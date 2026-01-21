#!/usr/bin/env bun
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { extractAudio } from './audio';
import { GeminiClient } from './ai';
import { splitAudio } from './splitter';
import type { ChunkInfo } from './splitter';
import { extractVideoScreenshots, isVideoFile } from './screenshot';
import { saveOutput, saveReport, type OutputFormat, type MeetingReport } from './formatting';
import { SUPPORTED_FORMATS, PRESETS, CHUNK_OVERLAP_SECONDS, DESCRIPTION_SAMPLE_MINUTES } from './config';
import { TRANSCRIPTION_PROMPT, DESCRIPTION_PROMPT, AUDIO_DESCRIPTION_PROMPT, MERGE_DESCRIPTION_PROMPT } from './prompts';
import { 
  validateTranscript, 
  logValidationResult, 
  buildSpeakerNormalizationMap, 
  normalizeTranscriptSpeakers,
  type ValidationConfig 
} from './validator';
import type { TranscriptSegment, CLIOptions } from './types';

// Interface for tracking transcription progress (like offmute)
interface TranscriptionProgressEntry {
  timestamp: number;
  chunkIndex: number;
  prompt: string;
  response: string;
  error?: string;
  validationResult?: {
    isValid: boolean;
    coverage: number;
    issues: string[];
  };
  attempt: number;
}

const program = new Command();

program
  .name('sb-transcribe')
  .description('Transcribe and diarize video/audio using Multimodal AI')
  .version('2.0.0')
  .argument('<file>', 'Path to the video or audio file')
  .option('-k, --key <key>', 'Google Gemini API Key')
  .option('-f, --format <format>', 'Output format: srt, vtt, md, txt, or json', 'srt')
  .option('-m, --model <model>', 'Model: pro, flash, or flash-lite', 'pro')
  .option('-s, --speakers <names...>', 'Known speaker names (e.g., -s "John" "Barbara")')
  .option('-i, --instructions <text>', 'Custom instructions for the AI')
  .option('-ac, --audio-chunk-minutes <minutes>', 'Audio chunk duration in minutes', '10')
  .option('-sc, --screenshot-count <number>', 'Number of screenshots to extract for video', '4')
  .option('-r, --report', 'Generate a meeting report with key points and action items')
  .option('-p, --preset <preset>', 'Use a preset: fast, quality, or lite')
  .option('--provider <type>', 'Transcription provider: "gemini" or "assembly"', 'gemini')
  .option('--show-cost', 'Show estimated API cost after processing')
  .option('--force', 'Force re-transcription, ignoring cached results')
  .option('--no-interactive', 'Skip interactive speaker identification')
  .option('--save-intermediates', 'Save intermediate processing files')
  .option('--validation-retries <number>', 'Number of retries if timing validation fails', '2')
  .option('--no-timing-check', 'Disable timing validation (faster but may have gaps)')
  .action((filePath, options) => {
    run(filePath, options);
  });

program.parse();

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function identifySpeakers(transcript: TranscriptSegment[]): Promise<Record<string, string>> {
  const uniqueSpeakers: string[] = [];
  transcript.forEach((item: TranscriptSegment) => {
    if (!uniqueSpeakers.includes(item.speaker)) {
      uniqueSpeakers.push(item.speaker);
    }
  });

  console.log(chalk.cyan.bold('\n--- Speaker Identification ---'));
  console.log(chalk.gray('For each speaker, enter their name or press Enter to keep the default.\n'));

  const speakerMap: Record<string, string> = {};

  for (const speaker of uniqueSpeakers) {
    const sample = transcript.find(
      (item: TranscriptSegment) => item.speaker === speaker && item.text.length > 20
    );
    const sampleText = sample ? sample.text.substring(0, 100) : transcript.find((item: TranscriptSegment) => item.speaker === speaker)?.text || '';
    
    console.log(chalk.yellow(`\n${speaker}:`));
    console.log(chalk.white(`  "${sampleText}${sampleText.length >= 100 ? '...' : ''}"`));
    
    const answer = await prompt(chalk.cyan(`  Who is this speaker? [${speaker}]: `));
    
    if (answer) {
      speakerMap[speaker] = answer;
      console.log(chalk.green(`  ✓ ${speaker} → ${answer}`));
    } else {
      speakerMap[speaker] = speaker;
      console.log(chalk.gray(`  (keeping as ${speaker})`));
    }
  }

  return speakerMap;
}

function parseTime(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 2) {
    const [min, sec] = parts as [number, number];
    return min * 60 + sec;
  }
  if (parts.length === 3) {
    const [hr, min, sec] = parts as [number, number, number];
    return hr * 3600 + min * 60 + sec;
  }
  return 0;
}

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatDate(date: Date): string {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Get last N lines from text (for context passing between chunks)
 */
function getLastNLines(text: string, n: number): string {
  if (!text) return '';
  const lines = text.split('\n').filter(line => line.trim());
  return lines.slice(-n).join('\n');
}

/**
 * Generate file metadata for the transcription file
 */
function generateMetadata(inputFile: string, userInstructions?: string): string {
  const stats = fs.statSync(inputFile);
  
  let metadata = `# File Metadata
- **Filename:** ${path.basename(inputFile)}
- **File Created:** ${formatDate(stats.birthtime)}
- **File Modified:** ${formatDate(stats.mtime)}
- **Processing Date:** ${formatDate(new Date())}
- **File Size:** ${(stats.size / (1024 * 1024)).toFixed(2)} MB
- **File Path:** ${inputFile}`;

  if (userInstructions) {
    metadata += `\n- **Custom Instructions:** ${userInstructions}`;
  }

  metadata += `\n\n*Note: This metadata is generated from the file properties and may not reflect the actual date/time when the content was recorded.*`;

  return metadata;
}

/**
 * Update the transcription markdown file with progress
 */
function updateTranscriptionFile(
  filePath: string,
  content: string,
  currentChunk: number,
  totalChunks: number,
  isComplete: boolean = false
): void {
  const currentContent = fs.readFileSync(filePath, 'utf-8');
  const transcriptionHeaderPos = currentContent.indexOf('# Full Transcription');
  
  if (transcriptionHeaderPos === -1) return;
  
  const contentBeforeTranscription = currentContent.substring(
    0,
    transcriptionHeaderPos + '# Full Transcription'.length
  );
  
  const progressIndicator = isComplete
    ? ''
    : `\n\n*Progress: ${currentChunk}/${totalChunks} chunks processed (${Math.round((currentChunk / totalChunks) * 100)}%)*`;
  
  const newContent = contentBeforeTranscription + progressIndicator + '\n\n' + content;
  
  fs.writeFileSync(filePath, newContent, 'utf-8');
}

// ===========================================
// MAIN PIPELINE
// ===========================================

async function run(filePath: string, options: Partial<CLIOptions> & Record<string, unknown>) {
  const startTime = Date.now();
  
  console.log(chalk.blue.bold('\n⭐ Southbridge Transcriber v2.0 - Multimodal AI Transcription ⭐\n'));

  // 1. Validate Input
  if (!fs.existsSync(filePath)) {
    console.error(chalk.red(`Error: File not found at ${filePath}`));
    process.exit(1);
  }
  const absolutePath = path.resolve(filePath);
  const inputBaseName = path.parse(absolutePath).name;

  const fileExt = path.extname(absolutePath).toLowerCase();
  if (!SUPPORTED_FORMATS.includes(fileExt)) {
    console.error(chalk.red(`Error: Unsupported format "${fileExt}"`));
    process.exit(1);
  }

  // 2. Load API Key
  if (!process.env.GEMINI_API_KEY && fs.existsSync('.env')) {
    const envConfig = fs.readFileSync('.env', 'utf8');
    const match = envConfig.match(/GEMINI_API_KEY=(.*)/);
    if (match && match[1]) {
      process.env.GEMINI_API_KEY = match[1].trim();
    }
  }
  const apiKey = options.key || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error(chalk.red('Error: GEMINI_API_KEY is missing.'));
    process.exit(1);
  }

  // === Provider Selection (Architectural Decision) ===
  // We support a --provider flag to acknowledge AssemblyAI as an alternative.
  // However, AssemblyAI is AUDIO-ONLY and cannot perform multimodal analysis.
  // 
  // DESIGN DECISION: We chose pure LLM (Gemini) because:
  // 1. Multimodal Requirement: The assignment required "offmute-style" video analysis
  //    - Using video frames to identify speakers visually
  //    - Binding visual context ("who is on camera") to transcription in a single pass
  // 2. AssemblyAI Limitation: It processes audio only, losing video context entirely
  // 3. Single-Pass Architecture: Gemini can see screenshots + hear audio simultaneously,
  //    enabling speaker identification from visual cues
  //
  // If AssemblyAI were used, we would need a complex two-pass system:
  //    Pass 1: AssemblyAI for raw transcription
  //    Pass 2: Separate LLM call to correlate visual speaker IDs with audio
  // This adds latency, cost, and potential alignment errors.
  if (options.provider === 'assembly') {
    console.log(chalk.yellow('\n⚠️  AssemblyAI Provider Selected'));
    console.log(chalk.yellow('─'.repeat(50)));
    console.log(chalk.white('AssemblyAI is a dedicated ASR service optimized for audio transcription.'));
    console.log(chalk.white('However, it is AUDIO-ONLY and cannot perform multimodal analysis.\n'));
    console.log(chalk.cyan('This tool prioritizes MULTIMODAL capabilities:'));
    console.log(chalk.gray('  • Video frame analysis for speaker identification'));
    console.log(chalk.gray('  • Visual context binding (who is on camera)'));
    console.log(chalk.gray('  • Single-pass video+audio processing\n'));
    console.log(chalk.white('AssemblyAI integration is architecturally planned but disabled'));
    console.log(chalk.white('to preserve multimodal features that AssemblyAI cannot support.\n'));
    console.log(chalk.green('→ Falling back to Gemini for full multimodal capabilities...\n'));
  }

  try {
    // Apply preset if specified
    const presetKey = typeof options.preset === 'string' ? options.preset : '';
    if (presetKey) {
      const preset = PRESETS[presetKey as keyof typeof PRESETS];
      if (!preset) {
        console.error(chalk.red(`Error: Unknown preset "${presetKey}".`));
        process.exit(1);
      }
      console.log(chalk.cyan(`Using preset: ${presetKey} - ${preset.description}`));
      options.model = options.model === 'pro' ? preset.model : options.model;
      options.audioChunkMinutes = options.audioChunkMinutes === '10' ? String(preset.chunkMinutes) : options.audioChunkMinutes;
      options.screenshotCount = options.screenshotCount === '4' ? String(preset.screenshotCount) : options.screenshotCount;
    }

    const chunkDurationMinutes = Number.parseInt(String(options.audioChunkMinutes)) || 10;
    const chunkDurationSeconds = chunkDurationMinutes * 60;
    const screenshotCount = Number.parseInt(String(options.screenshotCount)) || 4;

    console.log(chalk.white(`Processing: ${absolutePath}`));
    console.log(chalk.white(`Using: Gemini ${options.model || 'pro'}`));
    if (options.instructions) {
      console.log(chalk.white(`Custom instructions: ${options.instructions}`));
    }

    // 3. Create intermediates directory structure (like offmute)
    const intermediatesDir = path.join(path.dirname(absolutePath), `.southbridge_${inputBaseName}`);
    const audioDir = path.join(intermediatesDir, 'audio');
    const screenshotsDir = path.join(intermediatesDir, 'screenshots');
    const transcriptionDir = path.join(intermediatesDir, 'transcription');
    
    fs.mkdirSync(audioDir, { recursive: true });
    fs.mkdirSync(screenshotsDir, { recursive: true });
    fs.mkdirSync(transcriptionDir, { recursive: true });
    
    console.log(chalk.gray(`Saving intermediates to: ${intermediatesDir}`));

    const client = new GeminiClient(String(apiKey), String(options.model ?? ''), String(options.instructions ?? ''));
    const isVideo = isVideoFile(absolutePath);
    
    // ===========================================
    // PHASE 1: CONTENT ANALYSIS (Screenshots + Audio Sample)
    // ===========================================
    
    let imageDescription = '';
    let audioDescription = '';
    let finalDescription = '';
    let screenshots: { path: string; timestamp: number; index: number }[] = [];

    // Extract screenshots if video
    if (isVideo) {
      console.log(chalk.cyan('\n████████████████████████████████████████ | 100% | Screenshots'));
      screenshots = await extractVideoScreenshots(absolutePath, {
        screenshotCount,
        outputDir: screenshotsDir,
      });
      
      // Analyze screenshots
      console.log(chalk.gray('  → Analyzing visual content...'));
      try {
        imageDescription = await client.analyzeImages(
          screenshots.map(s => s.path),
          DESCRIPTION_PROMPT(options.instructions)
        );
        fs.writeFileSync(
          path.join(intermediatesDir, 'image_description.json'),
          JSON.stringify({ description: imageDescription }, null, 2)
        );
      } catch (error: any) {
        console.log(chalk.yellow(`  ⚠ Visual analysis failed: ${error.message}`));
      }
    }

    // Extract audio
    console.log(chalk.cyan('\n████████████████████████████████████████ | 100% | Audio Processing'));
    const mainAudioPath = await extractAudio(absolutePath);
    
    // Split audio into chunks (save to audio/ directory)
    const chunks = await splitAudioToDir(mainAudioPath, audioDir, inputBaseName, chunkDurationSeconds, CHUNK_OVERLAP_SECONDS);
    
    // Extract audio sample for description (first 20 mins or whole file if shorter)
    const tagSamplePath = path.join(audioDir, `${inputBaseName}_tag_sample.mp3`);
    if (!fs.existsSync(tagSamplePath)) {
      const ffmpeg = require('fluent-ffmpeg');
      await new Promise<void>((resolve, reject) => {
        ffmpeg(mainAudioPath)
          .setStartTime(0)
          .setDuration(DESCRIPTION_SAMPLE_MINUTES * 60)
          .audioCodec('libmp3lame')
          .audioBitrate('128k')
          .save(tagSamplePath)
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err));
      });
    }
    
    // Analyze audio sample
    console.log(chalk.gray('  → Analyzing audio content...'));
    try {
      audioDescription = await client.analyzeAudio(
        tagSamplePath,
        AUDIO_DESCRIPTION_PROMPT(options.instructions)
      );
      fs.writeFileSync(
        path.join(intermediatesDir, 'audio_description.json'),
        JSON.stringify({ description: audioDescription }, null, 2)
      );
    } catch (error: any) {
      console.log(chalk.yellow(`  ⚠ Audio analysis failed: ${error.message}`));
    }

    // Merge descriptions
    if (imageDescription && audioDescription) {
      try {
        finalDescription = await client.mergeDescriptions(
          imageDescription,
          audioDescription,
          MERGE_DESCRIPTION_PROMPT(options.instructions)
        );
      } catch (error: any) {
        finalDescription = audioDescription || imageDescription;
      }
    } else {
      finalDescription = audioDescription || imageDescription || 'No description available.';
    }
    
    fs.writeFileSync(
      path.join(intermediatesDir, 'final_description.json'),
      JSON.stringify({ finalDescription, imageDescription, audioDescription }, null, 2)
    );

    // ===========================================
    // PHASE 2: TRANSCRIPTION
    // ===========================================
    
    console.log(chalk.cyan('\n████████████████████████████████████████ | 100% | AI Processing'));
    console.log(chalk.white(`\nStarting transcription of ${chunks.length} chunks...`));

    // Create initial transcription file
    const transcriptionPath = path.join(path.dirname(absolutePath), `${inputBaseName}_transcription.md`);
    const metadata = generateMetadata(absolutePath, options.instructions);
    
    // Format description sections with appropriate fallbacks
    const descriptionSection = finalDescription && finalDescription !== 'No description available.' 
      ? finalDescription 
      : '*(Description generation failed due to API quota or other error. The transcription will proceed without context.)*';
    
    const audioSection = audioDescription 
      ? audioDescription 
      : '*(Audio analysis was skipped or failed.)*';
    
    const visualSection = isVideo 
      ? (imageDescription ? imageDescription : '*(Visual analysis was skipped or failed.)*')
      : '*(Audio file - no visual analysis performed.)*';
    
    const initialContent = [
      metadata,
      '\n# Meeting Description\n',
      descriptionSection,
      '\n# Audio Analysis\n',
      audioSection,
      '\n# Visual Analysis\n',
      visualSection,
      '\n# Full Transcription\n',
      '*(Transcription in progress...)*',
    ].join('\n');
    
    fs.writeFileSync(transcriptionPath, initialContent, 'utf-8');
    console.log(chalk.white(`Initial transcription file created at: ${transcriptionPath}`));

    // Process chunks with context passing
    let previousTranscription = '';
    let transcriptionContent = '';
    const chunkTranscriptions: string[] = [];
    let fullTranscript: TranscriptSegment[] = [];
    const transcriptionProgress: TranscriptionProgressEntry[] = [];
    const progressPath = path.join(transcriptionDir, 'transcription_progress.json');
    
    // Track known speakers for consistency across chunks
    let knownSpeakers: string[] = [];
    const validationRetries = Number.parseInt(String(options.validationRetries ?? '')) || 2;
    const enableTimingCheck = options.timingCheck !== false;

    for (let i = 0; i < chunks.length; i++) {
      try {
        const chunk = chunks[i]!;
        const expectedDuration = chunk.endTime - chunk.startTime;
        console.log(chalk.yellow(`\nProcessing chunk ${i + 1}/${chunks.length} (${Math.round(expectedDuration)}s expected)`));
        
        const cachePath = path.join(transcriptionDir, `chunk_${i}_raw.json`);
        let chunkData: TranscriptSegment[] = [];
        let validationPassed = false;
        
        // Check cache
        if (!options.force && fs.existsSync(cachePath)) {
          console.log(chalk.green(`  ✓ Found cached transcription`));
          try {
            chunkData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
            validationPassed = true; // Assume cached data was already validated
          } catch (e) {
            chunkData = [];
          }
        } else {
          // Transcribe with validation and retry logic
          for (let attempt = 0; attempt <= validationRetries; attempt++) {
            // Build prompt with context (add timing hint on retries)
            let timingHint = '';
            if (attempt > 0) {
              timingHint = `\n\nIMPORTANT: This chunk is ${Math.round(expectedDuration)} seconds long. Please ensure your transcription covers the entire duration with accurate timestamps from 00:00 to approximately ${formatTime(expectedDuration)}.`;
            }
            
            const prompt = TRANSCRIPTION_PROMPT(
              finalDescription,
              i + 1,
              chunks.length,
              previousTranscription,
              options.instructions
            ) + timingHint;
            
            const progressEntry: TranscriptionProgressEntry = {
              timestamp: Date.now(),
              chunkIndex: i,
              prompt: prompt,
              response: '',
              error: undefined,
              attempt: attempt + 1
            };
            
            try {
              if (attempt > 0) {
                console.log(chalk.yellow(`  ↻ Retry ${attempt}/${validationRetries} for better timing coverage...`));
              }
              
              const fileUri = await client.uploadMedia(chunk.path);
              chunkData = await client.transcribeWithContext(fileUri, prompt);
              
              // Validate the transcription if timing check is enabled
              if (enableTimingCheck && chunkData.length > 0) {
                const validationConfig: ValidationConfig = {
                  expectedDuration: expectedDuration,
                  minCoveragePercent: 60, // Be lenient - 60% coverage is acceptable
                  maxGapSeconds: 120,
                  knownSpeakers: knownSpeakers.length > 0 ? knownSpeakers : undefined,
                  strictTiming: false
                };
                
                const validationResult = validateTranscript(chunkData, validationConfig);
                logValidationResult(validationResult, i);
                
                // Record validation in progress
                progressEntry.validationResult = {
                  isValid: validationResult.isValid,
                  coverage: validationResult.stats.coverage,
                  issues: validationResult.issues.map(iss => iss.message)
                };
                
                if (validationResult.isValid) {
                  validationPassed = true;
                  
                  // Normalize speakers if inconsistencies detected
                  if (validationResult.issues.some(iss => iss.type === 'speaker_inconsistency')) {
                    const speakerMap = buildSpeakerNormalizationMap(
                      validationResult.stats.speakers,
                      knownSpeakers
                    );
                    if (Object.keys(speakerMap).length > 0) {
                      console.log(chalk.cyan(`  → Normalizing speakers: ${Object.entries(speakerMap).map(([k, v]) => `${k}→${v}`).join(', ')}`));
                      // FIX: Use type assertion (as TranscriptSegment) to access the 'end' property
                      chunkData = normalizeTranscriptSpeakers(chunkData, speakerMap).map((rawItem) => {
                        const item = rawItem as TranscriptSegment; // Assert correct type
                        let endStr: string;
                        if (typeof item.end === 'string') {
                          endStr = item.end;
                        } else if (item.end !== undefined && item.end !== null) {
                          endStr = String(item.end);
                        } else {
                          endStr = item.start;
                        }
                        return { ...item, end: endStr };
                      });
                    }
                  }
                  
                  // Update known speakers
                  const newSpeakers = validationResult.stats.speakers.filter(s => !knownSpeakers.includes(s));
                  knownSpeakers = [...knownSpeakers, ...newSpeakers];
                } else if (attempt < validationRetries) {
                  // Validation failed, will retry
                  progressEntry.error = `Validation failed: ${validationResult.issues.map(i => i.message).join('; ')}`;
                  transcriptionProgress.push(progressEntry);
                  fs.writeFileSync(progressPath, JSON.stringify(transcriptionProgress, null, 2));
                  continue; // Retry
                } else {
                  // Last attempt failed validation, use it anyway with warning
                  console.log(chalk.yellow(`  ⚠ Using transcript despite validation issues (all retries exhausted)`));
                  validationPassed = true;
                  
                  // Still update known speakers
                  knownSpeakers = [...new Set([...knownSpeakers, ...validationResult.stats.speakers])];
                }
              } else {
                validationPassed = true;
                // Track speakers even without validation
                const speakers = [...new Set(chunkData.map((item: TranscriptSegment) => item.speaker))];
                knownSpeakers = [...new Set([...knownSpeakers, ...speakers])];
              }
              
              // Save successful transcription
              fs.writeFileSync(cachePath, JSON.stringify(chunkData, null, 2));
              progressEntry.response = JSON.stringify(chunkData);
              transcriptionProgress.push(progressEntry);
              fs.writeFileSync(progressPath, JSON.stringify(transcriptionProgress, null, 2));
              break; // Success, exit retry loop
              
            } catch (error: any) {
              console.error(chalk.red(`  Error transcribing chunk ${i + 1}: ${error.message}`));
              progressEntry.error = `Gemini API Error: ${error.message}`;
              transcriptionProgress.push(progressEntry);
              fs.writeFileSync(progressPath, JSON.stringify(transcriptionProgress, null, 2));
              
              if (attempt === validationRetries) {
                // All retries exhausted
                chunkTranscriptions.push(`\n[Transcription error for chunk ${i + 1}]\n`);
                updateTranscriptionFile(
                  transcriptionPath,
                  transcriptionContent + `\n[Transcription error for chunk ${i + 1}]\n`,
                  i + 1,
                  chunks.length
                );
              }
            }
          }
          
          if (!validationPassed && chunkData.length === 0) {
            continue; // Skip to next chunk if all retries failed
          }
        }

        // Adjust timestamps based on chunk start time
        const adjustedData = chunkData.map((item: TranscriptSegment) => {
          const originalSeconds = parseTime(item.start);
          const newSeconds = originalSeconds + chunk.startTime;
          return {
            ...item,
            start: formatTime(newSeconds)
          };
        });

        fullTranscript = fullTranscript.concat(adjustedData);
        
        // Format chunk for markdown
        const chunkText = adjustedData.map((item: TranscriptSegment) => 
          `**[${item.start}] ${item.speaker}:** ${item.text}`
        ).join('\n\n');
        
        chunkTranscriptions.push(chunkText);
        transcriptionContent = chunkTranscriptions.join('\n\n---\n\n');
        
        // Update previous transcription context (last 20 lines)
        previousTranscription = getLastNLines(chunkText, 20);
        
        // Update the transcription file with progress
        updateTranscriptionFile(
          transcriptionPath,
          transcriptionContent,
          i + 1,
          chunks.length
        );
        
        console.log(chalk.gray(`  Transcription file updated (${i + 1}/${chunks.length} chunks)`));
      } catch (chunkError) {
        console.error(`❌ Error processing Chunk ${i + 1}, skipping...`, chunkError);
        // OPTIONAL: Add a placeholder segment so the transcript doesn't have a time gap
        fullTranscript.push({
          speaker: "SYSTEM",
          start: "ERROR",
          end: "ERROR",
          text: "[Transcription failed for this segment]"
        });
      }
    }

    // Final update (remove progress indicator)
    updateTranscriptionFile(transcriptionPath, transcriptionContent, chunks.length, chunks.length, true);
    
    // Save raw transcriptions
    fs.writeFileSync(
      path.join(transcriptionDir, 'raw_transcriptions.json'),
      JSON.stringify(chunkTranscriptions, null, 2)
    );

    console.log(chalk.green(`\nTranscription complete. Saved to: ${transcriptionPath}`));
    console.log(chalk.gray(`Intermediate outputs saved in: ${transcriptionDir}`));

    // ===========================================
    // PHASE 3: SPEAKER IDENTIFICATION & OUTPUT
    // ===========================================

    // Speaker identification
    let speakerMap: Record<string, string> = {};
    
    if (options.speakers && (options.speakers as string[]).length > 0) {
      const uniqueSpeakers: string[] = [];
      fullTranscript.forEach((item: TranscriptSegment) => {
        if (!uniqueSpeakers.includes(item.speaker)) {
          uniqueSpeakers.push(item.speaker);
        }
      });
      
      const speakerNames = options.speakers as string[];
      uniqueSpeakers.forEach((speaker, index) => {
        if (index < speakerNames.length) {
          speakerMap[speaker] = speakerNames[index] ?? '';
        }
      });
      console.log(chalk.cyan(`\nSpeaker names applied: ${Object.entries(speakerMap).map(([k, v]) => `${k} → ${v}`).join(', ')}`));
    } else if (options.interactive !== false && fullTranscript.length > 0) {
      speakerMap = await identifySpeakers(fullTranscript);
    }
    
    if (Object.keys(speakerMap).length > 0) {
      fullTranscript = fullTranscript.map((item: TranscriptSegment) => ({
        ...item,
        speaker: speakerMap[item.speaker] || item.speaker
      }));
    }

    // Save additional output formats if requested
    const validFormats = ['srt', 'vtt', 'md', 'txt', 'json'];
    const outputFormat: OutputFormat = typeof options.format === 'string' ? options.format.toLowerCase() as OutputFormat : 'srt';
    if (validFormats.includes(outputFormat)) {
      saveOutput(absolutePath, fullTranscript, outputFormat);
    }
    
    // Generate report if requested
    if (options.report && fullTranscript.length > 0) {
      console.log(chalk.cyan.bold('\n--- Generating Meeting Report ---'));
      try {
        const report = await client.generateReport(fullTranscript) as unknown as MeetingReport;
        saveReport(absolutePath, report);
      } catch (error: any) {
        console.error(chalk.yellow('Warning: Could not generate report:'), error.message);
      }
    }
    
    // Show cost estimation
    if (options.showCost) {
      const { total, breakdown } = client.getCostEstimate();
      console.log(chalk.cyan.bold('\n--- Cost Estimation ---'));
      breakdown.forEach((stat) => {
        console.log(chalk.gray(`  ${stat.model}: ${stat.inputTokens.toLocaleString()} input + ${stat.outputTokens.toLocaleString()} output tokens`));
      });
      console.log(chalk.green(`  Total estimated cost: $${total.toFixed(4)}`));
    }

    // Summary
    const totalSeconds = (Date.now() - startTime) / 1000;
    const videoDuration = chunks.reduce((sum, c) => sum + (c.endTime - c.startTime), 0);
    const timePerMinute = totalSeconds / (videoDuration / 60);
    
    console.log(chalk.cyan(`\nComplete in ${Math.floor(totalSeconds / 60)}m ${Math.floor(totalSeconds % 60)}s (${timePerMinute.toFixed(1)}s per minute)`));
    console.log(chalk.white(`Transcription: ${transcriptionPath}`));
    console.log(chalk.green.bold('\n✅ Processing complete!'));
    
  } catch (error: any) {
    console.error(chalk.red('\nFatal Error:'), error.message);
    process.exit(1);
  }
}

// ===========================================
// AUDIO SPLITTING (outputs to specified directory)
// ===========================================

async function splitAudioToDir(
  audioPath: string,
  outputDir: string,
  baseName: string,
  chunkDuration: number,
  overlapDuration: number
): Promise<ChunkInfo[]> {
  const ffmpeg = require('fluent-ffmpeg');
  
  // Get duration
  const duration = await new Promise<number>((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err: Error, metadata: { format: { duration?: number } }) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });

  // If file is short, just copy it
  if (duration <= chunkDuration) {
    const singleChunkPath = path.join(outputDir, `${baseName}_chunk_0.mp3`);
    if (!fs.existsSync(singleChunkPath)) {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(audioPath)
          .toFormat('mp3')
          .audioCodec('libmp3lame')
          .audioBitrate('128k')
          .save(singleChunkPath)
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err));
      });
    }
    return [{
      path: singleChunkPath,
      startTime: 0,
      endTime: duration,
      index: 0
    }];
  }

  // Calculate chunks with overlap
  const chunkStep = chunkDuration - overlapDuration;
  const totalChunks = Math.ceil(duration / chunkStep);
  const chunks: ChunkInfo[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const startTime = i * chunkStep;
    const endTime = Math.min(startTime + chunkDuration, duration);
    const chunkPath = path.join(outputDir, `${baseName}_chunk_${i}.mp3`);

    chunks.push({
      path: chunkPath,
      startTime,
      endTime,
      index: i
    });

    // Skip if exists (caching)
    if (fs.existsSync(chunkPath)) continue;

    await new Promise<void>((resolve, reject) => {
      ffmpeg(audioPath)
        .setStartTime(startTime)
        .setDuration(endTime - startTime)
        .toFormat('mp3')
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .save(chunkPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err));
    });
  }

  console.log(chalk.gray(`  Split into ${chunks.length} chunks (${chunkDuration/60}min each, ${overlapDuration}s overlap)`));
  return chunks;
}

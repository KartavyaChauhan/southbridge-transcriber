#!/usr/bin/env bun
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { extractAudio } from './audio';
import { GeminiClient } from './ai';
import { splitAudio } from './splitter';
import { saveOutput, type OutputFormat } from './formatting';
import { CHUNK_DURATION_SECONDS, SUPPORTED_FORMATS } from './config'; 

const program = new Command();

program
  .name('sb-transcribe')
  .description('Transcribe and diarize video/audio using Multimodal AI')
  .version('1.0.0')
  .argument('<file>', 'Path to the video or audio file')
  .option('-k, --key <key>', 'Google Gemini API Key')
  .option('-f, --format <format>', 'Output format: srt, vtt, md, txt, or json', 'srt')
  .option('-s, --speakers <names...>', 'Known speaker names (e.g., -s "John" "Barbara")')
  .option('--no-interactive', 'Skip interactive speaker identification')
  .action((filePath, options) => {
    run(filePath, options);
  });

program.parse();

/**
 * Prompt user for input (async readline wrapper)
 */
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

/**
 * Interactive speaker identification
 * Shows sample text from each speaker and asks user to provide a name
 */
async function identifySpeakers(transcript: any[]): Promise<Record<string, string>> {
  // Get unique speakers in order of appearance
  const uniqueSpeakers: string[] = [];
  transcript.forEach((item: any) => {
    if (!uniqueSpeakers.includes(item.speaker)) {
      uniqueSpeakers.push(item.speaker);
    }
  });

  console.log(chalk.cyan.bold('\n--- Speaker Identification ---'));
  console.log(chalk.gray('For each speaker, enter their name or press Enter to keep the default.\n'));

  const speakerMap: Record<string, string> = {};

  for (const speaker of uniqueSpeakers) {
    // Find the first significant utterance from this speaker (at least 20 chars)
    const sample = transcript.find(
      (item: any) => item.speaker === speaker && item.text.length > 20
    );
    const sampleText = sample ? sample.text.substring(0, 100) : transcript.find((item: any) => item.speaker === speaker)?.text || '';
    
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

// Helper to convert "MM:SS" string to Seconds (number)
function parseTime(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 2) {
    const [min, sec] = parts as [number, number];
    return min * 60 + sec; // MM:SS
  }
  if (parts.length === 3) {
    const [hr, min, sec] = parts as [number, number, number];
    return hr * 3600 + min * 60 + sec; // HH:MM:SS
  }
  return 0;
}

// Helper to convert Seconds to "HH:MM:SS"
function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

async function run(filePath: string, options: any) {
  console.log(chalk.blue.bold('🐸 Southbridge Transcriber (Release 1)'));

  // 1. Validate Input - File Exists
  if (!fs.existsSync(filePath)) {
    console.error(chalk.red(`Error: File not found at ${filePath}`));
    process.exit(1);
  }
  const absolutePath = path.resolve(filePath);

  // 2. Validate Input - Supported Format
  const fileExt = path.extname(absolutePath).toLowerCase();
  if (!SUPPORTED_FORMATS.includes(fileExt)) {
    console.error(chalk.red(`Error: Unsupported format "${fileExt}"`));
    console.error(chalk.gray(`Supported formats: ${SUPPORTED_FORMATS.join(', ')}`));
    process.exit(1);
  }

  // 3. Load API Key
  const envKey = process.env.GEMINI_API_KEY;
  if (!envKey && fs.existsSync('.env')) {
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

  try {
    // 3. Audio Extraction
    const mainAudioPath = await extractAudio(absolutePath);

    // 4. Split Audio (The IPGU Layer)
    const chunks = await splitAudio(mainAudioPath);
    console.log(chalk.gray(`Processing ${chunks.length} chunks...`));

    const client = new GeminiClient(apiKey);
    let fullTranscript: any[] = [];
    
    // Get the base name of the input file for organizing outputs
    const inputBaseName = path.parse(absolutePath).name;

    // 5. Loop through chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunkPath = chunks[i]!;
      const timeOffset = i * CHUNK_DURATION_SECONDS; // e.g., 0s, 1200s, 2400s...
      
      console.log(chalk.yellow(`\n--- Processing Chunk ${i + 1}/${chunks.length} ---`));
      
      // Upload & Transcribe
      const fileUri = await client.uploadMedia(chunkPath);
      const chunkData = await client.transcribe(fileUri);

      // --- Save Intermediate (Requirement #5) ---
      // Create a subfolder per input file to avoid overwriting
      const intermediatesDir = path.join(path.dirname(absolutePath), '.southbridge_intermediates', inputBaseName);
      if (!fs.existsSync(intermediatesDir)) fs.mkdirSync(intermediatesDir, { recursive: true });
      
      const logPath = path.join(intermediatesDir, `chunk_${i + 1}_raw.json`);
      fs.writeFileSync(logPath, JSON.stringify(chunkData, null, 2));
      console.log(chalk.gray(`   -> Raw AI response saved to ${logPath}`));
      // -------------------------------------------

      // 6. Adjust Timestamps (The "Drift Fix")
      const adjustedData = chunkData.map((item: any) => {
        const originalSeconds = parseTime(item.start);
        const newSeconds = originalSeconds + timeOffset;
        return {
          ...item,
          start: formatTime(newSeconds)
        };
      });

      fullTranscript = fullTranscript.concat(adjustedData);
    }

    // 7. Speaker Identification
    let speakerMap: Record<string, string> = {};
    
    if (options.speakers && options.speakers.length > 0) {
      // Use provided speaker names from -s flag
      const uniqueSpeakers: string[] = [];
      fullTranscript.forEach((item: any) => {
        if (!uniqueSpeakers.includes(item.speaker)) {
          uniqueSpeakers.push(item.speaker);
        }
      });
      
      uniqueSpeakers.forEach((speaker, index) => {
        if (index < options.speakers.length) {
          speakerMap[speaker] = options.speakers[index];
        }
      });
      
      console.log(chalk.cyan(`\nSpeaker names from -s flag: ${Object.entries(speakerMap).map(([k, v]) => `${k} → ${v}`).join(', ')}`));
    } else if (options.interactive !== false) {
      // Interactive speaker identification (default)
      speakerMap = await identifySpeakers(fullTranscript);
    }
    
    // Apply speaker name mapping
    if (Object.keys(speakerMap).length > 0) {
      fullTranscript = fullTranscript.map((item: any) => ({
        ...item,
        speaker: speakerMap[item.speaker] || item.speaker
      }));
    }

    // 8. Output Result
    const validFormats = ['srt', 'vtt', 'md', 'txt', 'json'];
    const outputFormat = (options.format || 'srt').toLowerCase() as OutputFormat;
    if (!validFormats.includes(outputFormat)) {
      console.error(chalk.red(`Error: Invalid format "${options.format}". Use srt, vtt, md, txt, or json.`));
      process.exit(1);
    }
    
    console.log(chalk.cyan.bold(`\n--- Generating ${outputFormat.toUpperCase()} ---`));
    
    // Save to the specified format
    saveOutput(absolutePath, fullTranscript, outputFormat);
    
    console.log(chalk.gray('Job complete.'));
    
  } catch (error: any) {
    console.error(chalk.red('\nFatal Error:'), error.message);
    process.exit(1);
  }
}
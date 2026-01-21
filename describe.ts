import path from 'node:path';
import fs from 'node:fs';
import ora from 'ora';
import chalk from 'chalk';
import { extractVideoScreenshots, isVideoFile } from './screenshot';
import type { ScreenshotInfo } from './screenshot';
import { extractAudio } from './audio';
import { DESCRIPTION_PROMPT, AUDIO_DESCRIPTION_PROMPT, MERGE_DESCRIPTION_PROMPT } from './prompts';
import type { GeminiClient } from './ai';

/**
 * Result of the description phase
 */
export interface DescriptionResult {
  /** Description based on video screenshots (if video file) */
  imageDescription?: string;
  /** Description based on audio sample */
  audioDescription: string;
  /** Final merged description */
  finalDescription: string;
  /** Generated files for reference */
  generatedFiles: {
    screenshots: string[];
    audioSample: string;
    intermediatesDir: string;
  };
}

/**
 * Options for description generation
 */
export interface DescriptionOptions {
  /** Number of screenshots to extract (default: 4) */
  screenshotCount?: number;
  /** Duration of audio sample for description in minutes (default: 20) */
  descriptionSampleMinutes?: number;
  /** Custom instructions to include in prompts */
  userInstructions?: string;
  /** API client for Gemini calls */
  apiClient: GeminiClient;
}

/**
 * Extracts a sample of audio for the description phase.
 * This is the "tag sample" - first N minutes of audio used to understand the meeting.
 */
async function extractAudioSample(
  audioPath: string,
  outputDir: string,
  durationMinutes: number = 20
): Promise<string> {
  const spinner = ora('Extracting audio sample for description...').start();
  
  const baseName = path.parse(audioPath).name;
  const samplePath = path.join(outputDir, `${baseName}_tag_sample.mp3`);
  
  // Skip if already exists (caching)
  if (fs.existsSync(samplePath)) {
    spinner.succeed('Audio sample already exists');
    return samplePath;
  }

  return new Promise((resolve, reject) => {
    const ffmpeg = require('fluent-ffmpeg');
    
    ffmpeg(audioPath)
      .setStartTime(0)
      .setDuration(durationMinutes * 60)
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .save(samplePath)
      .on('end', () => {
        spinner.succeed(chalk.green(`Extracted ${durationMinutes}-minute audio sample`));
        resolve(samplePath);
      })
      .on('error', (err: Error) => {
        spinner.fail('Failed to extract audio sample');
        reject(err);
      });
  });
}

/**
 * Generates a description of the meeting/content by analyzing:
 * 1. Video screenshots (if video file) - who's visible, what's on screen
 * 2. Audio sample - who's speaking, what's being discussed
 * 3. Merges both into a final description
 * 
 * This description is then used as context for the transcription phase.
 */
export async function generateDescription(
  inputFile: string,
  options: DescriptionOptions
): Promise<DescriptionResult> {
  const {
    screenshotCount = 4,
    descriptionSampleMinutes = 20,
    userInstructions,
    apiClient,
  } = options;

  console.log(chalk.cyan.bold('\n📋 Phase 1: Content Analysis'));

  // Determine intermediates directory
  const baseName = path.parse(inputFile).name;
  const intermediatesDir = path.join(
    path.dirname(inputFile),
    '.southbridge_intermediates',
    baseName
  );
  
  if (!fs.existsSync(intermediatesDir)) {
    fs.mkdirSync(intermediatesDir, { recursive: true });
  }

  const isVideo = isVideoFile(inputFile);
  let screenshots: ScreenshotInfo[] = [];
  let imageDescription = '';
  let audioDescription = '';

  // === Step 1: Extract and analyze screenshots (if video) ===
  if (isVideo) {
    console.log(chalk.gray('  → Extracting video frames for visual analysis...'));
    
    const screenshotsDir = path.join(intermediatesDir, 'screenshots');
    screenshots = await extractVideoScreenshots(inputFile, {
      screenshotCount,
      outputDir: screenshotsDir,
    });

    // Analyze screenshots with AI
    console.log(chalk.gray('  → Analyzing visual content...'));
    imageDescription = await apiClient.analyzeImages(
      screenshots.map(s => s.path),
      DESCRIPTION_PROMPT(userInstructions)
    );

    // Save intermediate
    fs.writeFileSync(
      path.join(intermediatesDir, 'image_description.json'),
      JSON.stringify({ description: imageDescription, screenshots: screenshots.map(s => s.path) }, null, 2)
    );
  }

  // === Step 2: Extract audio and analyze ===
  console.log(chalk.gray('  → Extracting audio for content analysis...'));
  
  // First ensure we have audio extracted
  const audioPath = await extractAudio(inputFile);
  
  // Extract a sample for description (tag sample)
  const audioDir = path.join(intermediatesDir, 'audio');
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
  }
  
  const audioSamplePath = await extractAudioSample(audioPath, audioDir, descriptionSampleMinutes);

  // Analyze audio sample with AI
  console.log(chalk.gray('  → Analyzing audio content...'));
  audioDescription = await apiClient.analyzeAudio(
    audioSamplePath,
    AUDIO_DESCRIPTION_PROMPT(userInstructions)
  );

  // Save intermediate
  fs.writeFileSync(
    path.join(intermediatesDir, 'audio_description.json'),
    JSON.stringify({ description: audioDescription, samplePath: audioSamplePath }, null, 2)
  );

  // === Step 3: Merge descriptions ===
  console.log(chalk.gray('  → Generating final content description...'));
  
  let finalDescription: string;
  
  if (isVideo && imageDescription) {
    // Merge both visual and audio descriptions
    finalDescription = await apiClient.mergeDescriptions(
      imageDescription,
      audioDescription,
      MERGE_DESCRIPTION_PROMPT(userInstructions)
    );
  } else {
    // Audio only - use audio description as final
    finalDescription = audioDescription;
  }

  // Save final description
  fs.writeFileSync(
    path.join(intermediatesDir, 'final_description.json'),
    JSON.stringify({ 
      finalDescription,
      imageDescription: imageDescription || null,
      audioDescription,
      isVideo,
    }, null, 2)
  );

  console.log(chalk.green('  ✓ Content analysis complete'));

  return {
    imageDescription: imageDescription || undefined,
    audioDescription,
    finalDescription,
    generatedFiles: {
      screenshots: screenshots.map(s => s.path),
      audioSample: audioSamplePath,
      intermediatesDir,
    },
  };
}

/**
 * Generate file metadata for the output
 */
export function generateMetadata(inputFile: string, userInstructions?: string): string {
  const stats = fs.statSync(inputFile);
  const creationTime = stats.birthtime;
  const modificationTime = stats.mtime;
  const processingTime = new Date();

  const formatDate = (date: Date): string => {
    return date.toISOString().replace('T', ' ').substring(0, 19);
  };

  let metadata = `# File Metadata
- **Filename:** ${path.basename(inputFile)}
- **File Created:** ${formatDate(creationTime)}
- **File Modified:** ${formatDate(modificationTime)}
- **Processing Date:** ${formatDate(processingTime)}
- **File Size:** ${(stats.size / (1024 * 1024)).toFixed(2)} MB
- **File Path:** ${inputFile}`;

  if (userInstructions) {
    metadata += `\n- **Custom Instructions:** ${userInstructions}`;
  }

  metadata += `\n\n*Note: This metadata is generated from the file properties and may not reflect the actual date/time when the content was recorded.*`;

  return metadata;
}

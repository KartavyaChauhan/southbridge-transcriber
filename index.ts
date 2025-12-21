#!/usr/bin/env bun
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { extractAudio } from './audio';
import { GeminiClient } from './ai';
import { splitAudio } from './splitter';
import { saveOutput } from './formatting';

// Duration of our chunks in seconds (Must match splitter.ts)
const CHUNK_DURATION_SECONDS = 20 * 60; 

const program = new Command();

program
  .name('sb-transcribe')
  .description('Transcribe and diarize video/audio using Multimodal AI')
  .version('1.0.0')
  .argument('<file>', 'Path to the video or audio file')
  .option('-k, --key <key>', 'Google Gemini API Key')
  .action((filePath, options) => {
    run(filePath, options);
  });

program.parse();

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

  // 1. Validate Input
  if (!fs.existsSync(filePath)) {
    console.error(chalk.red(`Error: File not found at ${filePath}`));
    process.exit(1);
  }
  const absolutePath = path.resolve(filePath);

  // 2. Load API Key
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

    // 5. Loop through chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunkPath = chunks[i]!;
      const timeOffset = i * CHUNK_DURATION_SECONDS; // e.g., 0s, 1200s, 2400s...
      
      console.log(chalk.yellow(`\n--- Processing Chunk ${i + 1}/${chunks.length} ---`));
      
      // Upload & Transcribe
      const fileUri = await client.uploadMedia(chunkPath);
      const chunkData = await client.transcribe(fileUri);

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

    // 7. Output Result
    console.log(chalk.cyan.bold('\n--- Generating SRT ---'));
    
    // Instead of printing huge JSON, we save to file
    saveOutput(absolutePath, fullTranscript);
    
    console.log(chalk.gray('Job complete.'));
    
  } catch (error: any) {
    console.error(chalk.red('\nFatal Error:'), error.message);
    process.exit(1);
  }
}
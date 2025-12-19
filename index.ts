#!/usr/bin/env bun
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

// Initialize CLI
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

async function run(filePath: string, options: any) {
  console.log(chalk.blue.bold('🐸 Southbridge Transcriber (Release 1)'));

  // 1. Validate File Exists
  if (!fs.existsSync(filePath)) {
    console.error(chalk.red(`Error: File not found at ${filePath}`));
    process.exit(1);
  }

  const absolutePath = path.resolve(filePath);
  console.log(chalk.green(`✓ Input file detected: ${absolutePath}`));

  // 2. Validate API Key
  const apiKey = options.key || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error(chalk.yellow('Warning: No API Key provided via flag or env variable.'));
    console.error(chalk.gray('You will need to set GEMINI_API_KEY to proceed with AI tasks.'));
    // We don't exit yet, just warning.
  } else {
    console.log(chalk.green('✓ API Key detected'));
  }

  // Next steps placeholder
  console.log(chalk.gray('\nReady for Phase 2: Audio Extraction...'));
}
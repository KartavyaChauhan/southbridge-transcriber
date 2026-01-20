import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import { CHUNK_DURATION_SECONDS, CHUNK_OVERLAP_SECONDS } from './config';

/**
 * Chunk information with timing details
 */
export interface ChunkInfo {
  path: string;
  startTime: number;
  endTime: number;
  index: number;
}

/**
 * Gets the duration of a media file in seconds.
 */
async function getDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    // ffprobe comes bundled with most ffmpeg installs
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const duration = metadata.format.duration;
      if (!duration) return reject(new Error('Could not determine file duration'));
      resolve(duration);
    });
  });
}

/**
 * Splits the audio file into smaller chunks with optional overlap.
 * Returns an array of ChunkInfo objects with paths and timing details.
 * 
 * @param audioPath - Path to the audio file
 * @param chunkDuration - Duration of each chunk in seconds (default from config)
 * @param overlapDuration - Overlap between chunks in seconds (default from config)
 */
export async function splitAudio(
  audioPath: string, 
  chunkDuration: number = CHUNK_DURATION_SECONDS,
  overlapDuration: number = CHUNK_OVERLAP_SECONDS
): Promise<ChunkInfo[]> {
  const spinner = ora('Checking audio duration...').start();
  
  try {
    const duration = await getDuration(audioPath);
    
    // If file is short, skip splitting logic
    if (duration <= chunkDuration) {
      spinner.succeed('Audio is short enough. No splitting needed.');
      return [{
        path: audioPath,
        startTime: 0,
        endTime: duration,
        index: 0
      }];
    }

    // Calculate effective chunk step (duration minus overlap)
    const chunkStep = chunkDuration - overlapDuration;
    const totalChunks = Math.ceil(duration / chunkStep);
    spinner.text = `Long audio detected (${Math.floor(duration/60)}m). Splitting into ${totalChunks} chunks with ${overlapDuration}s overlap...`;
    
    const chunks: ChunkInfo[] = [];
    const parse = path.parse(audioPath);
    const outputDir = path.join(parse.dir, '.southbridge_intermediates', parse.name, 'audio');

    // Create a folder for chunks
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    for (let i = 0; i < totalChunks; i++) {
      const startTime = i * chunkStep;
      const endTime = Math.min(startTime + chunkDuration, duration);
      const chunkFileName = `${parse.name}_chunk_${i}.mp3`;
      const chunkPath = path.join(outputDir, chunkFileName);
      
      chunks.push({
        path: chunkPath,
        startTime,
        endTime,
        index: i
      });

      // Skip if chunk already exists (caching/resuming)
      if (fs.existsSync(chunkPath)) {
        continue;
      }

      await new Promise<void>((resolve, reject) => {
        ffmpeg(audioPath)
          .setStartTime(startTime)
          .setDuration(endTime - startTime)
          .toFormat('mp3')
          .audioCodec('libmp3lame')
          .audioBitrate('128k')
          .save(chunkPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err));
      });
    }

    spinner.succeed(chalk.green(`Successfully split into ${chunks.length} chunks (${chunkDuration/60}min each, ${overlapDuration}s overlap)`));
    return chunks;

  } catch (error) {
    spinner.fail('Failed to split audio.');
    throw error;
  }
}

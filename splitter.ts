import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import ora from 'ora';

// We split into 20-minute chunks (1200 seconds) to prevent AI drift
const CHUNK_DURATION_MINUTES = 20;
const CHUNK_DURATION_SECONDS = CHUNK_DURATION_MINUTES * 60;

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
 * Splits the audio file into smaller chunks.
 * Returns an array of paths to the chunk files.
 */
export async function splitAudio(audioPath: string): Promise<string[]> {
  const spinner = ora('Checking audio duration...').start();
  
  try {
    const duration = await getDuration(audioPath);
    
    // If file is short (< 20 mins), skip splitting logic
    if (duration <= CHUNK_DURATION_SECONDS) {
      spinner.succeed('Audio is short enough. No splitting needed.');
      return [audioPath];
    }

    const totalChunks = Math.ceil(duration / CHUNK_DURATION_SECONDS);
    spinner.text = `Long audio detected (${Math.floor(duration/60)}m). Splitting into ${totalChunks} chunks...`;
    
    const chunks: string[] = [];
    const parse = path.parse(audioPath);
    const outputDir = path.join(parse.dir, `${parse.name}_chunks`);

    // Create a folder for chunks so we don't clutter the root
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    for (let i = 0; i < totalChunks; i++) {
      const startTime = i * CHUNK_DURATION_SECONDS;
      const chunkFileName = `part_${i + 1}${parse.ext}`;
      const chunkPath = path.join(outputDir, chunkFileName);
      
      chunks.push(chunkPath);

      // Skip if chunk already exists (Resuming previous run)
      if (fs.existsSync(chunkPath)) {
        continue;
      }

      await new Promise<void>((resolve, reject) => {
        ffmpeg(audioPath)
          .setStartTime(startTime)
          .setDuration(CHUNK_DURATION_SECONDS)
          .audioCodec('copy') // Fast copy, no re-encoding quality loss
          .save(chunkPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err));
      });
    }

    spinner.succeed(chalk.green(`Successfully split into ${chunks.length} parts in /${parse.name}_chunks`));
    return chunks;

  } catch (error) {
    spinner.fail('Failed to split audio.');
    throw error;
  }
}

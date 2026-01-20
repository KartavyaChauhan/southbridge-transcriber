import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import ora from 'ora';
import chalk from 'chalk';

/**
 * Screenshot information
 */
export interface ScreenshotInfo {
  path: string;
  timestamp: number;
  index: number;
}

/**
 * Options for screenshot extraction
 */
export interface ScreenshotOptions {
  screenshotCount?: number;  // Default: 4
  format?: 'jpg' | 'png';    // Default: jpg
  quality?: number;          // Default: 100 (1-100)
  outputDir?: string;        // Default: temp directory
}

/**
 * Gets the duration of a media file in seconds.
 */
async function getFileDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const duration = metadata.format.duration;
      if (!duration) return reject(new Error('Could not determine file duration'));
      resolve(duration);
    });
  });
}

/**
 * Extracts a single screenshot at a specific timestamp
 */
function extractScreenshot(
  inputPath: string,
  outputPath: string,
  timestamp: number,
  format: string,
  quality: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .screenshots({
        timestamps: [timestamp],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: '1280x720', // HD resolution
      })
      .on('end', () => resolve())
      .on('error', (err) => reject(err));
  });
}

/**
 * Extracts evenly-distributed screenshots from a video file.
 * Returns array of screenshot paths with their timestamps.
 * 
 * @param inputFile - Path to video file
 * @param options - Screenshot extraction options
 * @returns Array of screenshot info objects
 */
export async function extractVideoScreenshots(
  inputFile: string,
  options: ScreenshotOptions = {}
): Promise<ScreenshotInfo[]> {
  const {
    screenshotCount = 4,
    format = 'jpg',
    quality = 100,
    outputDir,
  } = options;

  // Validate input file exists
  if (!fs.existsSync(inputFile)) {
    throw new Error(`Input file not found: ${inputFile}`);
  }

  const spinner = ora('Extracting video screenshots...').start();

  try {
    // Create output directory if needed
    const screenshotsDir = outputDir || path.join(
      path.dirname(inputFile),
      '.southbridge_intermediates',
      path.parse(inputFile).name,
      'screenshots'
    );
    
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    // Get video duration
    const duration = await getFileDuration(inputFile);
    const baseFileName = path.parse(inputFile).name;
    const screenshots: ScreenshotInfo[] = [];
    const processingPromises: Promise<void>[] = [];

    // Calculate timestamps - start at 1% and end at 99% to avoid black frames
    const startTime = duration * 0.01;
    const endTime = duration * 0.99;
    const interval = (endTime - startTime) / (screenshotCount - 1);

    spinner.text = `Extracting ${screenshotCount} screenshots from video...`;

    for (let i = 0; i < screenshotCount; i++) {
      const timestamp = startTime + interval * i;
      const screenshotPath = path.join(
        screenshotsDir,
        `${baseFileName}_screenshot_${i}.${format}`
      );

      // Only process if screenshot doesn't already exist (caching)
      if (!fs.existsSync(screenshotPath)) {
        processingPromises.push(
          extractScreenshot(inputFile, screenshotPath, timestamp, format, quality)
        );
      }

      screenshots.push({
        path: screenshotPath,
        timestamp,
        index: i,
      });
    }

    // Wait for all screenshots to be extracted
    await Promise.all(processingPromises);

    spinner.succeed(chalk.green(`Extracted ${screenshotCount} screenshots`));
    return screenshots;

  } catch (error) {
    spinner.fail('Failed to extract screenshots');
    throw error;
  }
}

/**
 * Check if a file is a video file (has video stream)
 */
export function isVideoFile(filePath: string): boolean {
  const videoExtensions = new Set([
    '.mp4', '.mkv', '.avi', '.mov', '.webm', '.wmv',
    '.flv', '.mpeg', '.mpg', '.3gpp', '.m4v'
  ]);
  return videoExtensions.has(path.extname(filePath).toLowerCase());
}

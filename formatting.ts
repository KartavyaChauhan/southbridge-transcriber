import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

interface TranscriptItem {
  speaker: string;
  start: string; // "HH:MM:SS"
  text: string;
}

/**
 * Converts "HH:MM:SS" to seconds.
 */
function timeToSeconds(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) {
    const [hr, min, sec] = parts as [number, number, number];
    return hr * 3600 + min * 60 + sec;
  }
  if (parts.length === 2) {
    const [min, sec] = parts as [number, number];
    return min * 60 + sec;
  }
  return 0;
}

/**
 * Converts seconds back to SRT timestamp format "HH:MM:SS,mmm"
 */
function secondsToSrtTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const ms = Math.floor((totalSeconds % 1) * 1000);
  
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

/**
 * Generates SRT content from the transcript JSON.
 * Logic: End time of Line A = Start time of Line B.
 */
export function generateSrt(transcript: TranscriptItem[]): string {
  let srtContent = '';

  for (let i = 0; i < transcript.length; i++) {
    const item = transcript[i]!;
    const nextItem = transcript[i + 1];

    const startTime = timeToSeconds(item.start);
    let endTime;

    if (nextItem) {
      endTime = timeToSeconds(nextItem.start);
    } else {
      // For the last line, assume it lasts 3 seconds
      endTime = startTime + 3;
    }

    // Safety: Ensure subtitle is at least 1 second long
    if (endTime - startTime < 1) endTime = startTime + 1;

    srtContent += `${i + 1}\n`;
    srtContent += `${secondsToSrtTime(startTime)} --> ${secondsToSrtTime(endTime)}\n`;
    srtContent += `[${item.speaker}] ${item.text}\n\n`;
  }

  return srtContent;
}

/**
 * Saves the transcript to a .srt file next to the input video.
 */
export function saveOutput(originalFilePath: string, transcript: TranscriptItem[]) {
  const parse = path.parse(originalFilePath);
  // Output file: video_name.srt
  const outputPath = path.join(parse.dir, `${parse.name}.srt`);
  
  const srtContent = generateSrt(transcript);
  
  fs.writeFileSync(outputPath, srtContent);
  console.log(chalk.green(`\n✅ Saved subtitle file: ${outputPath}`));
  return outputPath;
}

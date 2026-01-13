import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { MIN_SUBTITLE_DURATION, LAST_SUBTITLE_DURATION } from './config';

interface TranscriptItem {
  speaker: string;
  start: string; // "HH:MM:SS"
  text: string;
}

export type OutputFormat = 'srt' | 'vtt' | 'md' | 'txt' | 'json';

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
 * Converts seconds to VTT timestamp format "HH:MM:SS.mmm"
 */
function secondsToVttTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const ms = Math.floor((totalSeconds % 1) * 1000);
  
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

/**
 * Converts seconds to readable time format "[HH:MM:SS]"
 */
function secondsToReadableTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Calculate end times for all transcript items
 */
function calculateEndTimes(transcript: TranscriptItem[]): Array<{ item: TranscriptItem; startTime: number; endTime: number }> {
  return transcript.map((item, i) => {
    const nextItem = transcript[i + 1];
    const startTime = timeToSeconds(item.start);
    let endTime;

    if (nextItem) {
      endTime = timeToSeconds(nextItem.start);
    } else {
      endTime = startTime + LAST_SUBTITLE_DURATION;
    }

    if (endTime - startTime < MIN_SUBTITLE_DURATION) {
      endTime = startTime + MIN_SUBTITLE_DURATION;
    }

    return { item, startTime, endTime };
  });
}

/**
 * Generates SRT content from the transcript JSON.
 */
export function generateSrt(transcript: TranscriptItem[]): string {
  const items = calculateEndTimes(transcript);
  let srtContent = '';

  items.forEach((entry, i) => {
    srtContent += `${i + 1}\n`;
    srtContent += `${secondsToSrtTime(entry.startTime)} --> ${secondsToSrtTime(entry.endTime)}\n`;
    srtContent += `[${entry.item.speaker}] ${entry.item.text}\n\n`;
  });

  return srtContent;
}

/**
 * Generates VTT (WebVTT) content from the transcript JSON.
 */
export function generateVtt(transcript: TranscriptItem[]): string {
  const items = calculateEndTimes(transcript);
  let vttContent = 'WEBVTT\n\n';

  items.forEach((entry, i) => {
    vttContent += `${i + 1}\n`;
    vttContent += `${secondsToVttTime(entry.startTime)} --> ${secondsToVttTime(entry.endTime)}\n`;
    vttContent += `<v ${entry.item.speaker}>${entry.item.text}\n\n`;
  });

  return vttContent;
}

/**
 * Generates Markdown content from the transcript JSON.
 */
export function generateMarkdown(transcript: TranscriptItem[], originalFilePath: string): string {
  const fileName = path.basename(originalFilePath);
  const processedDate = new Date().toLocaleString();
  
  // Extract unique speakers
  const speakers = [...new Set(transcript.map(item => item.speaker))];
  
  let mdContent = `# Transcript: ${fileName}\n\n`;
  mdContent += `_Processed on ${processedDate}_\n\n`;
  mdContent += `## Speakers\n\n`;
  speakers.forEach(speaker => {
    mdContent += `- **${speaker}**\n`;
  });
  mdContent += `\n## Transcript\n\n`;

  transcript.forEach(item => {
    const readableTime = secondsToReadableTime(timeToSeconds(item.start));
    mdContent += `**[${readableTime}] ${item.speaker}:** ${item.text}\n\n`;
  });

  return mdContent;
}

/**
 * Generates simple TXT content (like meeting-diary).
 * Format: [timestamp] Speaker: text
 */
export function generateTxt(transcript: TranscriptItem[]): string {
  let txtContent = '';

  transcript.forEach(item => {
    const readableTime = secondsToReadableTime(timeToSeconds(item.start));
    txtContent += `[${readableTime}] ${item.speaker}: ${item.text}\n`;
  });

  return txtContent;
}

/**
 * Generates JSON content with detailed metadata (like meeting-diary).
 */
export function generateJson(transcript: TranscriptItem[], originalFilePath: string): string {
  const fileName = path.basename(originalFilePath);
  const processedDate = new Date().toISOString();
  
  // Extract unique speakers
  const speakers = [...new Set(transcript.map(item => item.speaker))];
  
  // Calculate duration from last item
  const lastItem = transcript[transcript.length - 1];
  const durationSeconds = lastItem ? timeToSeconds(lastItem.start) + LAST_SUBTITLE_DURATION : 0;
  
  const output = {
    metadata: {
      file: fileName,
      processedAt: processedDate,
      durationSeconds,
      speakerCount: speakers.length
    },
    speakers,
    transcript: transcript.map(item => ({
      speaker: item.speaker,
      startTime: item.start,
      startSeconds: timeToSeconds(item.start),
      text: item.text
    }))
  };

  return JSON.stringify(output, null, 2);
}

/**
 * Saves the transcript to the specified format next to the input video.
 */
export function saveOutput(originalFilePath: string, transcript: TranscriptItem[], format: OutputFormat = 'srt') {
  const parse = path.parse(originalFilePath);
  const outputPath = path.join(parse.dir, `${parse.name}.${format}`);
  
  let content: string;
  
  switch (format) {
    case 'vtt':
      content = generateVtt(transcript);
      break;
    case 'md':
      content = generateMarkdown(transcript, originalFilePath);
      break;
    case 'txt':
      content = generateTxt(transcript);
      break;
    case 'json':
      content = generateJson(transcript, originalFilePath);
      break;
    case 'srt':
    default:
      content = generateSrt(transcript);
      break;
  }
  
  fs.writeFileSync(outputPath, content);
  console.log(chalk.green(`\n✅ Saved ${format.toUpperCase()} file: ${outputPath}`));
  return outputPath;
}

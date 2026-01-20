/**
 * Validation utilities for transcription output.
 * Inspired by ipgu's validation approach.
 * 
 * Validates:
 * - Timestamps fall within expected chunk duration
 * - No large gaps in the transcript
 * - Speaker names are consistent across chunks
 */

import chalk from 'chalk';

/**
 * Result of transcript validation
 */
export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  stats: TranscriptStats;
}

export interface ValidationIssue {
  type: 'timing_gap' | 'timing_overflow' | 'timing_underflow' | 'speaker_inconsistency' | 'empty_transcript';
  severity: 'error' | 'warning';
  message: string;
  details?: any;
}

export interface TranscriptStats {
  entryCount: number;
  firstTimestamp: number;
  lastTimestamp: number;
  expectedDuration: number;
  coverage: number; // percentage of expected duration covered
  speakers: string[];
  largestGap: number;
}

/**
 * Configuration for validation
 */
export interface ValidationConfig {
  /** Expected duration of the chunk in seconds */
  expectedDuration: number;
  /** Minimum coverage percentage (0-100) to consider valid */
  minCoveragePercent: number;
  /** Maximum allowed gap between entries in seconds */
  maxGapSeconds: number;
  /** Known speaker names from previous chunks for consistency checking */
  knownSpeakers?: string[];
  /** Whether to be strict about timing (false = more lenient) */
  strictTiming: boolean;
}

const DEFAULT_CONFIG: Partial<ValidationConfig> = {
  minCoveragePercent: 70,
  maxGapSeconds: 120, // 2 minutes max gap
  strictTiming: false,
};

/**
 * Parse timestamp string (MM:SS or HH:MM:SS) to seconds
 */
function parseTimestamp(timeStr: string): number {
  if (!timeStr) return 0;
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

/**
 * Validate a transcript against expected parameters
 */
export function validateTranscript(
  transcript: Array<{ speaker: string; start: string; text: string }>,
  config: ValidationConfig
): ValidationResult {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const issues: ValidationIssue[] = [];
  
  // Empty transcript check
  if (!transcript || transcript.length === 0) {
    return {
      isValid: false,
      issues: [{
        type: 'empty_transcript',
        severity: 'error',
        message: 'Transcript is empty'
      }],
      stats: {
        entryCount: 0,
        firstTimestamp: 0,
        lastTimestamp: 0,
        expectedDuration: fullConfig.expectedDuration,
        coverage: 0,
        speakers: [],
        largestGap: 0
      }
    };
  }

  // Extract timestamps and speakers
  const timestamps = transcript.map(entry => parseTimestamp(entry.start));
  const speakers = [...new Set(transcript.map(entry => entry.speaker))];
  
  const firstTimestamp = Math.min(...timestamps);
  const lastTimestamp = Math.max(...timestamps);
  
  // Calculate coverage
  const transcriptSpan = lastTimestamp - firstTimestamp;
  const coverage = (transcriptSpan / fullConfig.expectedDuration) * 100;
  
  // Find largest gap
  let largestGap = 0;
  const sortedTimestamps = [...timestamps].sort((a, b) => a - b);
  for (let i = 1; i < sortedTimestamps.length; i++) {
    const gap = sortedTimestamps[i]! - sortedTimestamps[i - 1]!;
    if (gap > largestGap) largestGap = gap;
  }

  const stats: TranscriptStats = {
    entryCount: transcript.length,
    firstTimestamp,
    lastTimestamp,
    expectedDuration: fullConfig.expectedDuration,
    coverage,
    speakers,
    largestGap
  };

  // Check timing underflow (transcript ends too early)
  if (coverage < fullConfig.minCoveragePercent) {
    issues.push({
      type: 'timing_underflow',
      severity: fullConfig.strictTiming ? 'error' : 'warning',
      message: `Transcript only covers ${coverage.toFixed(1)}% of expected ${fullConfig.expectedDuration}s duration (minimum: ${fullConfig.minCoveragePercent}%)`,
      details: { coverage, expectedDuration: fullConfig.expectedDuration, transcriptSpan }
    });
  }

  // Check timing overflow (timestamps exceed expected duration)
  if (lastTimestamp > fullConfig.expectedDuration * 1.1) { // 10% tolerance
    issues.push({
      type: 'timing_overflow',
      severity: 'warning',
      message: `Last timestamp (${lastTimestamp}s) exceeds expected duration (${fullConfig.expectedDuration}s)`,
      details: { lastTimestamp, expectedDuration: fullConfig.expectedDuration }
    });
  }

  // Check for large gaps
  if (largestGap > fullConfig.maxGapSeconds) {
    issues.push({
      type: 'timing_gap',
      severity: 'warning',
      message: `Large gap of ${largestGap}s detected in transcript (max allowed: ${fullConfig.maxGapSeconds}s)`,
      details: { largestGap, maxGapSeconds: fullConfig.maxGapSeconds }
    });
  }

  // Check speaker consistency
  if (fullConfig.knownSpeakers && fullConfig.knownSpeakers.length > 0) {
    const newSpeakers = speakers.filter(s => !fullConfig.knownSpeakers!.includes(s));
    const missingSpeakers = fullConfig.knownSpeakers.filter(s => !speakers.includes(s));
    
    // Check for generic speaker names that might indicate inconsistency
    const genericPattern = /^(Speaker\s*\d+|Unknown|Person\s*\d+)$/i;
    const genericSpeakers = speakers.filter(s => genericPattern.test(s));
    const namedKnownSpeakers = fullConfig.knownSpeakers.filter(s => !genericPattern.test(s));
    
    if (namedKnownSpeakers.length > 0 && genericSpeakers.length > 0) {
      issues.push({
        type: 'speaker_inconsistency',
        severity: 'warning',
        message: `Previous chunks used named speakers (${namedKnownSpeakers.join(', ')}), but this chunk uses generic names (${genericSpeakers.join(', ')})`,
        details: { namedKnownSpeakers, genericSpeakers, newSpeakers }
      });
    }
  }

  // Determine overall validity
  const hasErrors = issues.some(i => i.severity === 'error');
  
  return {
    isValid: !hasErrors,
    issues,
    stats
  };
}

/**
 * Print validation result to console
 */
export function logValidationResult(result: ValidationResult, chunkIndex: number): void {
  if (result.isValid && result.issues.length === 0) {
    console.log(chalk.green(`  ✓ Chunk ${chunkIndex + 1} validation passed (${result.stats.coverage.toFixed(0)}% coverage, ${result.stats.entryCount} entries)`));
    return;
  }

  if (!result.isValid) {
    console.log(chalk.red(`  ✗ Chunk ${chunkIndex + 1} validation failed:`));
  } else {
    console.log(chalk.yellow(`  ⚠ Chunk ${chunkIndex + 1} validation warnings:`));
  }

  for (const issue of result.issues) {
    const icon = issue.severity === 'error' ? '✗' : '⚠';
    const color = issue.severity === 'error' ? chalk.red : chalk.yellow;
    console.log(color(`    ${icon} ${issue.message}`));
  }
}

/**
 * Build a speaker map to normalize speaker names across chunks.
 * Maps generic names to consistent names when possible.
 */
export function buildSpeakerNormalizationMap(
  currentSpeakers: string[],
  knownSpeakers: string[],
  previousChunkLastSpeaker?: string
): Record<string, string> {
  const map: Record<string, string> = {};
  const genericPattern = /^(Speaker\s*\d+|Unknown|Person\s*\d+)$/i;
  
  // If we have named known speakers and current chunk has generic names,
  // try to map them based on order
  const namedKnown = knownSpeakers.filter(s => !genericPattern.test(s));
  const genericCurrent = currentSpeakers.filter(s => genericPattern.test(s));
  
  if (namedKnown.length > 0 && genericCurrent.length > 0) {
    // Simple heuristic: map Speaker 1 to first known speaker, etc.
    genericCurrent.forEach((generic, i) => {
      if (i < namedKnown.length) {
        map[generic] = namedKnown[i]!;
      }
    });
  }
  
  return map;
}

/**
 * Apply speaker normalization to transcript
 */
export function normalizeTranscriptSpeakers(
  transcript: Array<{ speaker: string; start: string; text: string }>,
  speakerMap: Record<string, string>
): Array<{ speaker: string; start: string; text: string }> {
  if (Object.keys(speakerMap).length === 0) return transcript;
  
  return transcript.map(entry => ({
    ...entry,
    speaker: speakerMap[entry.speaker] || entry.speaker
  }));
}

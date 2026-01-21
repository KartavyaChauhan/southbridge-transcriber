/**
 * Core type definitions for Southbridge Transcriber
 * 
 * This file centralizes all TypeScript interfaces to ensure type safety
 * and eliminate usage of 'any' throughout the codebase.
 */

// =============================================================================
// TRANSCRIPTION TYPES
// =============================================================================

/**
 * A single segment of transcription with speaker, timing, and tone information.
 * This is the core output unit from the AI transcription.
 */
export interface TranscriptSegment {
  /** Speaker name or identifier (e.g., "John", "Speaker 1", "Unknown") */
  speaker: string;
  /** Start timestamp in MM:SS format */
  start: string;
  /** End timestamp in MM:SS format */
  end: string;
  /** The transcribed text content */
  text: string;
  /** Optional emotional tone/delivery (e.g., "amused", "serious", "excited") */
  tone?: string;
}

/**
 * Raw API response that may include additional fields before normalization
 */
export interface RawTranscriptSegment extends TranscriptSegment {
  [key: string]: unknown; // Allow additional fields from API
}

// =============================================================================
// VALIDATION TYPES
// =============================================================================

/**
 * Statistics gathered during transcript validation
 */
export interface ValidationStats {
  /** Percentage of expected duration covered (0-100+) */
  coverage: number;
  /** List of unique speakers found */
  speakers: string[];
  /** Total number of transcript entries */
  entryCount: number;
  /** Total duration covered in seconds */
  coveredDuration: number;
  /** Expected duration in seconds */
  expectedDuration: number;
}

/**
 * Result of validating a transcript against expected parameters
 */
export interface ValidationResult {
  /** Whether the transcript passed validation */
  isValid: boolean;
  /** List of issues found (empty if valid) */
  issues: string[];
  /** Detailed statistics about the transcript */
  stats: ValidationStats;
}

/**
 * Options for transcript validation
 */
export interface ValidationOptions {
  /** Expected duration in seconds */
  expectedDuration: number;
  /** Minimum coverage percentage required (default: 60) */
  minCoverage?: number;
  /** Whether to check for timing gaps (default: true) */
  checkTimingGaps?: boolean;
  /** Maximum allowed gap in seconds (default: 30) */
  maxGapSeconds?: number;
}

// =============================================================================
// CHUNK PROCESSING TYPES
// =============================================================================

/**
 * Information about an audio chunk for processing
 */
export interface ChunkInfo {
  /** Absolute path to the chunk file */
  path: string;
  /** Start time in seconds from original file */
  startTime: number;
  /** End time in seconds from original file */
  endTime: number;
  /** Zero-based index of this chunk */
  index: number;
}

/**
 * Progress tracking for chunk processing
 */
export interface ChunkProgress {
  /** Current chunk being processed (1-indexed for display) */
  current: number;
  /** Total number of chunks */
  total: number;
  /** Chunks that have been completed */
  completed: number[];
  /** Chunks that failed processing */
  failed: number[];
}

/**
 * Result of processing a single chunk
 */
export interface ChunkResult {
  /** The chunk that was processed */
  chunk: ChunkInfo;
  /** The transcription segments (empty if failed) */
  transcript: TranscriptSegment[];
  /** Whether processing succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Validation result for this chunk */
  validation?: ValidationResult;
}

// =============================================================================
// DESCRIPTION PHASE TYPES
// =============================================================================

/**
 * Information about an extracted screenshot
 */
export interface ScreenshotInfo {
  /** Absolute path to the screenshot file */
  path: string;
  /** Timestamp in seconds where screenshot was taken */
  timestamp: number;
  /** Formatted timestamp string (HH:MM:SS) */
  formattedTimestamp: string;
}

/**
 * Result of the description/analysis phase
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

// =============================================================================
// API & COST TYPES
// =============================================================================

/**
 * Cost estimate for API usage
 */
export interface CostEstimate {
  /** Model used for this call */
  model: string;
  /** Number of input tokens */
  inputTokens: number;
  /** Number of output tokens */
  outputTokens: number;
  /** Estimated cost in USD */
  estimatedCost: number;
}

/**
 * Aggregated cost information
 */
export interface CostSummary {
  /** Total estimated cost in USD */
  total: number;
  /** Breakdown by individual API calls */
  breakdown: CostEstimate[];
}

// =============================================================================
// CLI & CONFIGURATION TYPES
// =============================================================================

/**
 * CLI options parsed from command line
 */
export interface CLIOptions {
  /** Input file path */
  input: string;
  /** Preferred AI model (pro, flash, flash-lite) */
  model?: string;
  /** Custom instructions for transcription */
  instructions?: string;
  /** Generate meeting report */
  report?: boolean;
  /** Transcription provider (gemini, assembly) */
  provider?: 'gemini' | 'assembly';
  /** Save intermediate files */
  saveIntermediates?: boolean;
  /** Skip confirmation prompts */
  noInteractive?: boolean;
  /** Force reprocessing (ignore cache) */
  force?: boolean;
  /** Number of validation retries */
  validationRetries?: number;
  /** Skip timing validation */
  noTimingCheck?: boolean;
}

/**
 * Speaker mapping for normalization across chunks
 */
export interface SpeakerMapping {
  /** Original speaker name */
  original: string;
  /** Normalized speaker name */
  normalized: string;
  /** Confidence of the mapping (0-1) */
  confidence: number;
}

/**
 * Progress state saved for resume capability
 */
export interface TranscriptionProgress {
  /** Input file being processed */
  inputFile: string;
  /** Total number of chunks */
  totalChunks: number;
  /** Index of last completed chunk */
  lastCompletedChunk: number;
  /** Accumulated transcript so far */
  transcript: TranscriptSegment[];
  /** Speaker mapping accumulated */
  speakerMap: Record<string, string>;
  /** Timestamp of last update */
  lastUpdated: string;
  /** Last prompt used (for context) */
  lastPrompt?: string;
}

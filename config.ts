
// ===========================================
// AUDIO PROCESSING
// ===========================================

/** Default chunk duration in minutes (offmute uses 10) */
export const CHUNK_DURATION_MINUTES = 10;
export const CHUNK_DURATION_SECONDS = CHUNK_DURATION_MINUTES * 60;

/** Overlap between chunks in minutes (for continuity) */
export const CHUNK_OVERLAP_MINUTES = 1;
export const CHUNK_OVERLAP_SECONDS = CHUNK_OVERLAP_MINUTES * 60;

/** Duration of audio sample for description phase (tag sample) */
export const DESCRIPTION_SAMPLE_MINUTES = 20;

/** Number of screenshots to extract for video analysis */
export const DEFAULT_SCREENSHOT_COUNT = 4;

/**
 * Audio bitrate for extraction (kbps).
 * 128k is sufficient for speech; higher values waste bandwidth.
 */
export const AUDIO_BITRATE = '128k';

/**
 * Supported input formats.
 * Video formats are converted to audio before processing.
 */
export const SUPPORTED_VIDEO_FORMATS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.wmv', '.flv', '.mpeg', '.mpg'];
export const SUPPORTED_AUDIO_FORMATS = ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac', '.opus'];
export const SUPPORTED_FORMATS = [...SUPPORTED_VIDEO_FORMATS, ...SUPPORTED_AUDIO_FORMATS];

// ===========================================
// AI MODEL CONFIGURATION
// ===========================================

export const CANDIDATE_MODELS = [
  "models/gemini-2.5-pro",        // Best for long-context speaker tracking
  "models/gemini-2.5-flash",      // Fast, good quality
  "models/gemini-2.0-flash",      // Stable fallback
  "models/gemini-2.0-flash-lite"  // Lightweight last resort
];

// ===========================================
// COST ESTIMATION
// ===========================================

export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'models/gemini-2.5-pro': { input: 1.25, output: 10.00 },
  'models/gemini-2.5-flash': { input: 0.15, output: 0.60 },
  'models/gemini-2.0-flash': { input: 0.10, output: 0.40 },
  'models/gemini-2.0-flash-lite': { input: 0.075, output: 0.30 },
};

// ===========================================
// PRESETS
// ===========================================

export const PRESETS: Record<string, { model: string; chunkMinutes: number; screenshotCount: number; description: string }> = {
  'fast': {
    model: 'flash',
    chunkMinutes: 15,
    screenshotCount: 2,
    description: 'Fast processing with Gemini Flash (good for quick transcriptions)'
  },
  'quality': {
    model: 'pro',
    chunkMinutes: 10,
    screenshotCount: 6,
    description: 'High-quality with Gemini Pro (best for important meetings)'
  },
  'lite': {
    model: 'flash-lite',
    chunkMinutes: 20,
    screenshotCount: 2,
    description: 'Lightweight processing (lowest cost, acceptable quality)'
  }
};

// ===========================================
// OUTPUT CONFIGURATION
// ===========================================


export const MIN_SUBTITLE_DURATION = 1;

/**
 * Default duration for the last subtitle (seconds).
 * Since we don't know when audio ends, we assume this duration.
 */
export const LAST_SUBTITLE_DURATION = 3;

/**
 * Centralized configuration for Southbridge Transcriber
 * 
 * This file contains all configurable parameters in one place,
 * making it easy to adjust behavior without hunting through code.
 */

// ===========================================
// AUDIO PROCESSING
// ===========================================

/**
 * Duration of audio chunks in minutes.
 * For speaker consistency across long meetings, we now use a much larger window.
 * Gemini 1.5 Pro supports up to 2 hours of audio in a single context.
 * 
 * Strategy: Process entire meeting as one chunk when possible.
 * Only split if file exceeds this threshold.
 */
export const CHUNK_DURATION_MINUTES = 120;
export const CHUNK_DURATION_SECONDS = CHUNK_DURATION_MINUTES * 60;

/**
 * Audio bitrate for extraction (kbps).
 * 128k is sufficient for speech; higher values waste bandwidth.
 */
export const AUDIO_BITRATE = '128k';

/**
 * Supported input formats.
 * Video formats are converted to audio before processing.
 */
export const SUPPORTED_VIDEO_FORMATS = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];
export const SUPPORTED_AUDIO_FORMATS = ['.mp3', '.wav', '.m4a', '.flac', '.ogg'];
export const SUPPORTED_FORMATS = [...SUPPORTED_VIDEO_FORMATS, ...SUPPORTED_AUDIO_FORMATS];

// ===========================================
// AI MODEL CONFIGURATION
// ===========================================

/**
 * Gemini models to try, in order of preference.
 * If a model hits quota (429), we automatically try the next one.
 * 
 * IMPORTANT: gemini-2.5-pro is prioritized for long-context speaker tracking.
 * It handles 2+ hour audio files better than Flash models for diarization.
 * 
 * Available models verified via ListModels API (January 2026):
 * - gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash, gemini-2.0-flash-lite
 * - gemini-3-pro-preview, gemini-3-flash-preview (experimental)
 */
export const CANDIDATE_MODELS = [
  "models/gemini-2.5-pro",        // Best for long-context speaker tracking
  "models/gemini-2.5-flash",      // Fast, good quality
  "models/gemini-2.0-flash",      // Stable fallback
  "models/gemini-2.0-flash-lite"  // Lightweight last resort
];

/**
 * System prompt for transcription.
 * Instructs the AI on output format and behavior.
 */
export const TRANSCRIPTION_PROMPT = `
You are an expert transcription assistant. 
Your task is to transcribe the audio provided perfectly, including speaker diarization and timestamps.

OUTPUT RULES:
1. Output MUST be valid JSON.
2. Structure: Array of objects: { "speaker": "Speaker 1", "start": "MM:SS", "text": "..." }
3. Identify distinct speakers.
4. Do not summarize. Transcribe verbatim.
`;

/**
 * Report generation prompt.
 * Used when --report flag is passed to generate a meeting summary.
 */
export const REPORT_PROMPT = `
You are an expert meeting analyst. Analyze the following transcript and generate a comprehensive meeting report.

OUTPUT RULES:
1. Output MUST be valid JSON.
2. Structure:
{
  "title": "Brief meeting title based on content",
  "summary": "2-3 paragraph executive summary",
  "keyPoints": ["Key point 1", "Key point 2", ...],
  "decisions": ["Decision 1", "Decision 2", ...],
  "actionItems": [
    { "owner": "Person name", "task": "Task description", "deadline": "If mentioned" }
  ],
  "topics": ["Topic 1", "Topic 2", ...],
  "participants": ["Speaker 1", "Speaker 2", ...]
}
3. Be thorough but concise.
4. If no decisions or action items are found, use empty arrays.
5. Extract specific names, dates, and commitments when mentioned.
`;

// ===========================================
// COST ESTIMATION
// ===========================================

/**
 * Estimated costs per million tokens (USD)
 * These are approximate and may change - check Google's pricing page for current rates.
 * https://ai.google.dev/pricing
 */
export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'models/gemini-2.5-pro': { input: 1.25, output: 10.00 },
  'models/gemini-2.5-flash': { input: 0.15, output: 0.60 },
  'models/gemini-2.0-flash': { input: 0.10, output: 0.40 },
  'models/gemini-2.0-flash-lite': { input: 0.075, output: 0.30 },
};

// ===========================================
// PRESETS
// ===========================================

/**
 * Preset configurations for common use cases.
 * Use with --preset flag.
 */
export const PRESETS: Record<string, { model: string; chunkMinutes: number; description: string }> = {
  'fast': {
    model: 'flash',
    chunkMinutes: 60,
    description: 'Fast processing with Gemini Flash (good for quick transcriptions)'
  },
  'quality': {
    model: 'pro',
    chunkMinutes: 120,
    description: 'High-quality with Gemini Pro (best for important meetings)'
  },
  'lite': {
    model: 'flash-lite',
    chunkMinutes: 30,
    description: 'Lightweight processing (lowest cost, acceptable quality)'
  }
};

// ===========================================
// OUTPUT CONFIGURATION
// ===========================================

/**
 * Default minimum subtitle duration in seconds.
 * Ensures subtitles don't flash too quickly.
 */
export const MIN_SUBTITLE_DURATION = 1;

/**
 * Default duration for the last subtitle (seconds).
 * Since we don't know when audio ends, we assume this duration.
 */
export const LAST_SUBTITLE_DURATION = 3;

// ===========================================
// LIMITATIONS & KNOWN ISSUES
// ===========================================

/**
 * KNOWN LIMITATIONS:
 * 
 * 1. SPEAKER ACCURACY: AI may misidentify speakers in:
 *    - Crosstalk (multiple people talking at once)
 *    - Similar-sounding voices
 *    - Background noise or music
 * 
 * 2. TIMESTAMP PRECISION: Timestamps are approximate (±2 seconds)
 *    - Long audio may experience "drift"
 *    - Chunking helps but doesn't eliminate this
 * 
 * 3. LANGUAGE: Currently optimized for English
 *    - Other languages may have reduced accuracy
 *    - No automatic language detection
 * 
 * 4. FILE SIZE: Gemini has limits:
 *    - Max ~2GB per file upload
 *    - Very long files (>3 hours) may timeout
 * 
 * 5. AUDIO QUALITY: Poor audio = poor transcription
 *    - Phone recordings may have issues
 *    - Recommended: Clear speech, minimal background noise
 */

/**
 * Prompts for the multi-phase transcription pipeline.
 * 
 * Phase 1: Description - Understand what the meeting/content is about
 * Phase 2: Transcription - Transcribe with context from Phase 1
 * Phase 3: Report - Generate summary and action items
 */

// ===========================================
// PHASE 1: DESCRIPTION PROMPTS
// ===========================================

/**
 * Prompt for analyzing video screenshots.
 * Used to understand visual context: who's visible, what's on screen, etc.
 */
export const DESCRIPTION_PROMPT = (userInstructions?: string) => `
Analyze these screenshots from a video recording. Describe:

1. **Participants**: Who is visible? Describe their appearance, apparent role, and any visible name tags or identifiers.
2. **Setting**: What kind of meeting/content is this? (interview, presentation, podcast, conference call, etc.)
3. **Visual Content**: What's shown on screen? (slides, demos, documents, shared screens)
4. **Emotional State**: What emotions or engagement levels do you observe in participants?
5. **Context Clues**: Any visible text, logos, or other identifying information.

${userInstructions ? `USER INSTRUCTIONS: ${userInstructions}\n\n` : ''}
IMPORTANT: Do NOT guess the date, time, or location unless explicitly visible in the screenshots. Only report what you can directly observe.

Provide a detailed but concise description that will help with speaker identification during transcription.
`;

/**
 * Prompt for analyzing audio sample.
 * Used to understand speakers, topic, and tone.
 */
export const AUDIO_DESCRIPTION_PROMPT = (userInstructions?: string) => `
Listen to this audio sample and describe:

1. **Speakers**: How many distinct speakers are there? Describe their voice characteristics (gender, accent, tone).
2. **Topic**: What is being discussed? What is the main subject matter?
3. **Format**: Is this a meeting, interview, presentation, podcast, or other format?
4. **Tone**: Is it formal or casual? Technical or general audience?
5. **Key Participants**: If names are mentioned, note them and associate with voice descriptions.

${userInstructions ? `USER INSTRUCTIONS: ${userInstructions}\n\n` : ''}
IMPORTANT: Do NOT guess the meeting date/time unless explicitly stated in the audio. Only include factual information that you can directly hear.

Provide a description that will help identify speakers during the full transcription.
`;

/**
 * Prompt for merging visual and audio descriptions.
 */
export const MERGE_DESCRIPTION_PROMPT = (userInstructions?: string) => `
You are given two descriptions of the same content:
1. A visual description based on video screenshots
2. An audio description based on an audio sample

Merge these into a single, coherent description that:
- Combines visual and audio observations about participants
- Associates visual appearances with voice characteristics
- Provides a complete picture of what this content is about
- Notes any discrepancies between visual and audio information

${userInstructions ? `USER INSTRUCTIONS: ${userInstructions}\n\n` : ''}
Output a unified description that will serve as context for transcription.
`;

// ===========================================
// PHASE 2: TRANSCRIPTION PROMPTS
// ===========================================

/**
 * Main transcription prompt with context from description phase.
 * Includes previous transcription for continuity across chunks.
 */
export const TRANSCRIPTION_PROMPT = (
  description: string,
  chunkNumber: number,
  totalChunks: number,
  previousTranscription: string,
  userInstructions?: string
) => `
You are transcribing chunk ${chunkNumber} of ${totalChunks} of a recording.

## Meeting/Content Description
${description}

${previousTranscription ? `
## Previous Transcription (for continuity)
...${previousTranscription}...

Continue the transcription from where this left off. Maintain speaker consistency.
` : ''}

## Transcription Instructions
1. Transcribe the audio verbatim - do not summarize
2. Identify and label each speaker consistently (use names if known from the description)
3. Include timestamps in MM:SS or HH:MM:SS format
4. Note emotions, tone, pauses, and non-verbal cues like:
   - (laughs)
   - (sighs)
   - (hesitant)
   - (enthusiastic)
   - (long pause)
   - (crosstalk)
5. If speakers talk over each other, note it as (overlapping)

${userInstructions ? `ADDITIONAL INSTRUCTIONS: ${userInstructions}\n` : ''}

## Output Format
Return a JSON array with this structure:
[
  {
    "speaker": "Speaker Name or Speaker 1",
    "start": "MM:SS",
    "text": "What they said (with emotional cues in parentheses if notable)"
  }
]

IMPORTANT: 
- Be consistent with speaker names across the transcription
- If you can identify speakers by name from context, use their names
- Include emotional/tonal information in parentheses within the text
`;

/**
 * Simple transcription prompt for audio-only processing (no description phase).
 * Used as fallback or for quick processing.
 */
export const SIMPLE_TRANSCRIPTION_PROMPT = `
You are an expert transcription assistant. 
Your task is to transcribe the audio provided perfectly, including speaker diarization and timestamps.

OUTPUT RULES:
1. Output MUST be valid JSON.
2. Structure: Array of objects: { "speaker": "Speaker 1", "start": "MM:SS", "text": "..." }
3. Identify distinct speakers.
4. Include emotional cues in parentheses: (laughs), (hesitant), (enthusiastic), etc.
5. Do not summarize. Transcribe verbatim.
`;

// ===========================================
// PHASE 3: REPORT PROMPTS
// ===========================================

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

/**
 * Report headings prompt for the Spreadfill technique.
 * First generates structure, then fills sections independently.
 */
export const REPORT_HEADINGS_PROMPT = (description: string, transcript: string, userInstructions?: string) => `
Meeting Description:
\`\`\`
${description}
\`\`\`

Transcript:
\`\`\`
${transcript}
\`\`\`

${userInstructions ? `USER INSTRUCTIONS: ${userInstructions}\n\n` : ''}

Based on this meeting content, generate appropriate section headings for a comprehensive meeting report.
Consider what sections would be most valuable given the specific content of this meeting.

Return a JSON object with this structure:
{
  "title": "Meeting title",
  "sections": [
    { "heading": "Section heading", "description": "What this section should contain" }
  ]
}
`;

# Process Log - Southbridge Transcriber


**Intent:**
Started the project today with the goal of building a multimodal transcription tool.
I have chosen to use **Bun** as the runtime because it is faster for local CLI tools and was requested in the spec.
I am using **TypeScript** to ensure type safety, especially when handling the complex JSON responses we expect from the LLM later.

**Architecture Decision:**
I reviewed `ipgu`, `offmute`, and `meeting-diary`.
- `offmute` uses multimodal LLMs (audio-in -> text-out). I am adopting this approach using Google's Gemini API because it simplifies the stack (no need for a separate AssemblyAI step initially).
- `ipgu` focuses on iterative alignment. I will keep this in mind if I encounter "timestamp drift" (where the AI loses track of time in long videos).

**Technical Setup:**
- Initialized `package.json`.
- Installed `commander` for CLI parsing and `fluent-ffmpeg` for audio processing.
- Created the basic CLI entry point (`index.ts`) to validate file inputs.

**Status:**
CLI skeleton is working. It correctly identifies file paths. Next step is connecting to GitHub and handling audio extraction.


Implemented audio.ts using fluent-ffmpeg. Why? Multimodal LLMs work better with audio-only inputs to save bandwidth and token costs. Decision: I added a check if (fs.existsSync(audioPath)) to skip re-processing if the audio is already there. This will make debugging much faster since I won't have to wait for ffmpeg every time I re-run the script.

---

## Phase 3: AI Transcription Engine

**Implemented ai.ts using the Google Generative AI SDK. Key Architecture:**
- Adapted the 'Fallback Logic' to automatically switch from Flash -> Pro -> Flash-lite if a 429 (Quota) error occurs. This ensures reliability during demos.
- Implemented a 'Polling Loop' for file uploads. Multimodal files aren't ready instantly; we must wait for state === ACTIVE.
- Used a rigid System Prompt to force JSON output, making the next phase (parsing) deterministic.

### Issue Encountered: Model Names Not Found (404 Error)

**Problem:**
When running the transcription, we got 404 errors like:
```
models/gemini-1.5-flash is not found for API version v1beta, or is not supported for generateContent
```

The original model names (`gemini-1.5-flash`, `gemini-1.5-pro`, `gemini-1.5-flash-8b`) were outdated and not recognized by the API.

**Debugging Process:**
1. First tried updating to `gemini-2.0-flash-exp` - this worked but hit quota limits (429).
2. Fallback models like `gemini-1.5-flash-latest` still returned 404.
3. Used a direct API call to list available models:
   ```
   fetch('https://generativelanguage.googleapis.com/v1beta/models?key=API_KEY')
   ```
4. Discovered that the SDK requires the `models/` prefix for model names.

**Solution:**
Updated `CANDIDATE_MODELS` array in `ai.ts` to use correct model names with prefix:
```typescript
const CANDIDATE_MODELS = [
  "models/gemini-2.5-flash",
  "models/gemini-2.0-flash",
  "models/gemini-2.5-pro",
  "models/gemini-2.0-flash-lite"
];
```

**Lesson Learned:**
- Google's model naming conventions change frequently. Always verify available models via the ListModels API.
- The `models/` prefix is required when using the Google Generative AI SDK.
- Keep multiple fallback models to handle quota exhaustion gracefully.

Integrated splitter.ts into the main index.ts pipeline. Logic Implemented:

Audio file is split into chunks (default 20 mins).

Iterated through chunks sequentially.

Timestamp Correction: Added a timeOffset logic. If we are on Chunk 2 (starts at 20:00), we add 1200 seconds to every timestamp returned by the AI. This ensures the final JSON has absolute timestamps matching the original video.
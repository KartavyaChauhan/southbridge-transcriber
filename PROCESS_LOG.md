# Process Log - Southbridge Transcriber


Started the project with the goal of building a multimodal transcription tool.
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

**Implemented ai.ts using the Google Generative AI SDK. Key Architecture:**
- Adapted the 'Fallback Logic' to automatically switch from Flash -> Pro -> Flash-lite if a 429 (Quota) error occurs. This ensures reliability during demos.
- Implemented a 'Polling Loop' for file uploads. Multimodal files aren't ready instantly; we must wait for state === ACTIVE.
- Used a rigid System Prompt to force JSON output, making the next phase (parsing) deterministic.


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

**Lesson Learned/Issues:**
- Google's model naming conventions change frequently. Always verify available models via the ListModels API.
- The `models/` prefix is required when using the Google Generative AI SDK.
- Keep multiple fallback models to handle quota exhaustion gracefully.

Integrated splitter.ts into the main index.ts pipeline. Logic Implemented:

Audio file is split into chunks (default 20 mins).

Iterated through chunks sequentially.

Timestamp Correction: Added a timeOffset logic. If we are on Chunk 2 (starts at 20:00), we add 1200 seconds to every timestamp returned by the AI. This ensures the final JSON has absolute timestamps matching the original video.

Implemented formatting.ts. Logic: Converted the AI's Start-Time-Only JSON into Start-End-Time SRT format. Assumption: I calculated the End Time based on the start of the next sentence. This is a standard heuristic in transcription when duration is missing.

Extended Output: Implemented .vtt and .md generators in formatting.ts to satisfy Requirement #4. Ensured VTT timestamp compliance (dot vs comma).

CLI Polish: Added npx/bunx bin configuration in package.json and a --format flag in index.ts.

Safety: Refactored intermediate logging to use subfolders, preventing overwrites when processing multiple files.


**Prompts Used**

I used two AI tools during this assignment: Google Gemini (Pro/Flash) and GitHub Copilot (Claude Opus 4.5).
The prompts used are numbered below. I have included only the main prompts that were essential to the assignment, as some interactions were minor (e.g., asking the AI to proceed to the next step or to confirm results).

I did not encounter many errors during development. When errors did occur, I pasted the error messages into Gemini and manually implemented the suggested solutions after reviewing them.

Gemini Prompts

1. Asked Gemini to help break the assignment into phases and outline a step-wise implementation plan.

2. Implememnted the step wise plans propsoed by Gemini with the help of copliot.

(for few steps then got the code snippets and the implemntaion tasks and integrated them in the project structure usign copilot no new prompts used just told to move on to next steps)

3. verified with gemini if we are on right track be providing the git repos provided in hte background of the assignment ( gemini suggested to include splitter file after this prompt)

4. confirmed the output in srt files and json files and understand the importance of intermediates required in the assignment 


5. Asked why are not any llm calls like the raw data gemini collected and its processing saved in the chunk_1_raw.json

6. Understood from gemini importnace of the files involved and how it helps in completing the assignment

7. what does these two mean raw transcripts
diarization output
?

8. what does this mean ✔ Audio is short enough. No splitting needed. and i am stil unabel to undertand what you explained above for the 3 sec and the toal video for the above was 3:25 min

9. so we wont analyse a file gretaer than 20 minutes ?

(Confirmed the changes made by copilot form gemini by providing it the lastest codes and files)


Copilot prompts

1. Asked copilot to have a look at the assignment so that it have context of what i will be doing and help in debugging errors and completing it 

2. asked it to explain th ecurrent progress and help me understand what have been done

3. what doe sthis mean program
.name('sb-transcribe')
.description('Transcribe and diarize video/audio using Multimodal AI')
.version('1.0.0')
.argument('<file>', 'Path to the video or audio file')
.option('-k, --key <key>', 'Google Gemini API Key')
.action((filePath, options) => {
run(filePath, options);
});

program.parse();

6. why are there two files created one for test.mp4 and one for test.mp3 when i bun run index.ts test.mp4?

7. Aksed to add the feautre for not overwritting the json log file and srt file for new audio/video 

(verifed the project status be providing the orignal task once again)

8. Asked to fic Configurable Parameters so it help me by creating config.ts - Centralized Configuration

9. then asked to help output SRT, VTT, or MD file	and accessible via npx/bunx or bun link.
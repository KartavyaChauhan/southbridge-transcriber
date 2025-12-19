# Process Log - Southbridge Transcriber

## Date: [Insert Today's Date]
**Phase:** Initialization & Setup

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
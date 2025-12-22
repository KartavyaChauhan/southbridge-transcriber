# Southbridge Transcriber 🐸

A robust, multimodal AI transcription and diarization tool built for the Southbridge take-home assignment. It acts as a unified "Level 2" solution, combining the architectural strengths of reference tools (`ipgu`, `offmute`, `meeting-diary`) into a single, production-ready CLI.

## 🚀 Features

* **Multimodal Intelligence:** Uses the latest **Google Gemini 2.0 & 2.5** models to "hear" audio directly, capturing nuance and tone better than text-only pipelines.
* **Reliability & Scalability:** Implements smart **Audio Chunking** (splitting files >20 mins) to prevent LLM timestamp drift and timeout errors.
* **Speaker Diarization:** Leveraging Gemini's multimodal capabilities to automatically identify and label distinct speakers.
* **Multi-Format Output:** Generates **SRT** (Subtitles), **VTT** (Web Captions), and **Markdown** (Meeting Summaries). Default is SRT.
* **Resilience:** Includes **smart fallback logic** that automatically switches AI models (e.g., Flash → Pro) specifically when API quota limits (429 errors) are hit.
* **Debug Traceability:** Saves raw "Intermediate" AI responses in auto-generated subfolders (`.southbridge_intermediates/{filename}/`) for inspection.
* **Smart Caching:** Skips expensive audio extraction and splitting steps if the artifacts already exist.

## 🛠️ Tech Stack

* **Runtime:** [Bun](https://bun.sh/) (Fast JavaScript runtime)
* **Language:** TypeScript
* **AI Model:** Google Gemini Multimodal API (`@google/generative-ai`)
* **Media Processing:** [FFmpeg](https://ffmpeg.org/) (via `fluent-ffmpeg`)
* **CLI Framework:** Commander.js
* **Utilities:** `ora` (spinners), `chalk` (styling)

## 📋 Prerequisites

1.  **Bun:** You must have Bun installed.
    ```bash
    curl -fsSL [https://bun.sh/install](https://bun.sh/install) | bash
    ```
2.  **FFmpeg:** Must be installed and available in your system PATH (used for audio extraction and splitting).
3.  **Google Gemini API Key:** Get a free key from [Google AI Studio](https://aistudio.google.com/).

## ⚙️ Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/YourUsername/southbridge-transcriber.git](https://github.com/YourUsername/southbridge-transcriber.git)
    cd southbridge-transcriber
    ```

2.  **Install dependencies:**
    ```bash
    bun install
    ```

3.  **Configure Environment:**
    Create a `.env` file in the root directory:
    ```env
    GEMINI_API_KEY=your_actual_api_key_here
    ```

## 🏃 Usage

You can run the tool in multiple ways. The tool accepts video (`.mp4`, `.mov`, `.mkv`) or audio (`.mp3`, `.wav`) files.

### Ways to Run
```bash
# Using bunx (Recommended - simulates installed package)
bunx sb-transcribe test.mp4

# Using bun run
bun run index.ts test.mp4

# Using bun directly
bun index.ts test.mp4

# Default (Generates SRT)
bunx sb-transcribe video.mp4

# Generate VTT (Web Captions)
bunx sb-transcribe video.mp4 --format vtt

# Generate Markdown (Meeting Summary)
bunx sb-transcribe video.mp4 -f md

# With inline API key (overrides .env)
bunx sb-transcribe video.mp4 -k YOUR_API_KEY

# Combine options
bunx sb-transcribe video.mp4 -f vtt -k YOUR_API_KEY 
```

## 📂 Project Structure

```text
SOUTHBRIDGE-TRANSCRIBER/
├── .southbridge_intermediates/  # Stores raw debug data (JSON)
│   └── test/                    # Subfolder per input file (Namespacing)
│       ├── chunk_1_raw.json     # The raw response from Gemini
│       └── chunk_2_raw.json
├── node_modules/
├── test_chunks/                 # Temporary split audio parts (created if file >20m)
├── .env                         # API Key config
├── ai.ts                        # "The Brain": Manages Gemini API, polling & retries
├── audio.ts                     # "The Extractor": FFmpeg logic to strip video
├── config.ts                    # "The Settings": Central config (Prompts, Models, Durations)
├── formatting.ts                # "The Translator": Converts JSON -> SRT/VTT/MD
├── index.ts                     # "The Manager": CLI entry point & orchestration
├── splitter.ts                  # "The Scalability": Logic to split long audio files
├── package.json                 # Dependencies & Bin configuration
├── PROCESS_LOG.md               # Dev diary of architectural decisions
└── README.md                    # This file
```

## 🏗️ Architecture & Flow

1. **Input:** User provides a video file (e.g., `movie.mp4`).
2. **Extraction:** `audio.ts` uses FFmpeg to create a lightweight `movie.mp3`.
3. **Analysis (The "Splitter"):**
   * `splitter.ts` checks duration.
   * If **> 20 mins**: It splits audio into 20-minute chunks to prevent AI hallucination/drift.
   * If **< 20 mins**: It processes the file as a single unit.
4. **Transcription Loop:**
   * `index.ts` iterates through every chunk.
   * `ai.ts` uploads audio to Gemini and waits for processing.
   * **Retry Logic:** If a model hits a rate limit (429), it auto-switches to a fallback model.
   * **Intermediates:** Raw JSON responses are saved to `.southbridge_intermediates/{filename}/` for debugging.
5. **Assembly:**
   * Timestamps are offset (e.g., Chunk 2 starts at 20:00).
   * `formatting.ts` calculates end-times and generates the final file (`.srt`, `.vtt`, or `.md`).

## ⚠️ Known Limitations

* **Speaker Accuracy:** AI may misidentify speakers during crosstalk (multiple people talking at once) or in noisy audio environments.
* **Timestamp Precision:** While chunking mitigates drift, timestamps are approximate (±1-2 seconds) compared to waveform-aligned tools.
* **File Size:** Very large files (>3 hours) are technically supported via chunking but may hit daily API cost limits depending on your Google Cloud plan.

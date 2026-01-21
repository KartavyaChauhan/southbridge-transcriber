# Southbridge Transcriber 🐸

A robust, multimodal AI transcription and diarization tool built for the Southbridge take-home assignment. It combines the architectural strengths of reference tools (`ipgu`, `offmute`, `meeting-diary`) into a single, production-ready CLI.

---

## ✨ What's New (Since Initial Submission)

| Feature | Description |
|---------|-------------|
| **Multimodal Analysis** | Uses **Video Screenshots + Audio** for accurate speaker ID & context |
| **Sequential Processing** | 10-min chunks with **context chaining** (no more lost context) |
| **IPGU-Style Validation** | Auto-retries on bad timestamps, gaps, or hallucinations |
| **Speaker Normalization** | Automatically fixes "Speaker 1" → "John" across chunks |
| **5 Output Formats** | SRT, VTT, Markdown, TXT, JSON |
| **Interactive Speaker ID** | Tool pauses to let you name each speaker |
| **Smart Caching** | Re-runs are instant (skips API calls) |
| **Meeting Reports** | AI-generated summaries with action items |
| **Model Selection** | Choose Pro, Flash, or Flash-Lite |
| **Presets** | Quick configs: `fast`, `quality`, `lite` |
| **Cost Estimation** | See token usage and estimated cost |
| **120-min Chunks** | Better speaker consistency for long files |

See [CHANGES.md](./CHANGES.md) for full details.

---

## 🚀 Features

### Core Transcription
* **Multimodal Intelligence:** Extracts video frames to identify speakers visually (e.g., "The speaker on screen is John") and captures non-verbal cues.
* **Context-Aware Chunks:** Passes the last 20 lines of the previous chunk to the next, ensuring seamless conversation flow and consistent speaker names.
* **Robust Validation:** Automatically detects and retries failed chunks (e.g., empty outputs, timing mismatches) using an `ipgu`-style validator.
* **Graceful Degradation:** If `Gemini Pro` hits rate limits, automatically falls back to `Flash` without crashing the pipeline.
* 
## 🛡️ Validation & Reliability
To ensure production-grade reliability (matching `ipgu` standards), the tool includes a strict validation pipeline:

* **Coverage Check:** Rejects chunks where the transcript covers less than 50% of the audio duration.
* **Timing Sanity:** Detects and fixes "time travel" timestamps or massive gaps.
* **Speaker Consistency:** Tracks known speakers across chunks. If Chunk 3 suddenly reverts to "Speaker 1", the validator detects it and re-maps it to the correct name based on previous chunks.
* **Automatic Retries:** If validation fails, the system automatically retries with a stricter system prompt before giving up.

### Output Formats
| Format | Flag | Description |
|--------|------|-------------|
| **SRT** | `--format srt` | Standard subtitles (default) |
| **VTT** | `--format vtt` | Web video captions |
| **Markdown** | `--format md` | Meeting transcript with header, speakers list |
| **TXT** | `--format txt` | Plain text with timestamps |
| **JSON** | `--format json` | Structured data with metadata |

### Intelligence Features
- **Meeting Reports** (`--report`): AI-generated executive summary, key points, decisions, and action items
- **Smart Caching**: Skips expensive API calls on re-runs (different format = instant)
- **Cost Estimation** (`--show-cost`): See token usage and estimated cost in USD

### Flexibility
- **Model Selection**: Choose between Pro (best quality), Flash (fast), or Flash-Lite (cheapest)
- **Presets**: Quick configurations for common use cases
- **Custom Instructions**: Guide the AI with specific context
- **Interactive or Automated**: Name speakers interactively or provide upfront

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Runtime** | [Bun](https://bun.sh/) |
| **Language** | TypeScript |
| **AI Model** | Google Gemini 2.5 Pro/Flash |
| **Media Processing** | FFmpeg |
| **CLI Framework** | Commander.js |

---

## 📋 Prerequisites

1. **Bun:** Install from [bun.sh](https://bun.sh/)
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. **FFmpeg:** Must be in your system PATH
   ```bash
   # Windows (with Chocolatey)
   choco install ffmpeg
   
   # macOS
   brew install ffmpeg
   
   # Ubuntu/Debian
   sudo apt install ffmpeg
   ```

3. **Google Gemini API Key:** Get free from [Google AI Studio](https://aistudio.google.com/)

---

## ⚙️ Installation

```bash
# Clone the repository
git clone https://github.com/KartavyaChauhan/southbridge-transcriber.git
cd southbridge-transcriber

# Install dependencies
bun install

# Configure API key (create .env file)
echo "GEMINI_API_KEY=your_api_key_here" > .env
```

---

## 🏃 Usage

### Basic Usage

```bash
# Default: Generate SRT subtitles
bunx sb-transcribe video.mp4

# Specify output format
bunx sb-transcribe video.mp4 --format md
bunx sb-transcribe video.mp4 --format json
bunx sb-transcribe video.mp4 --format txt
bunx sb-transcribe video.mp4 --format vtt
```

### Complete CLI Reference

```
Usage: sb-transcribe [options] <file>

Arguments:
  file                                  Video or audio file to transcribe

Options:
  -V, --version                         Show version number
  -k, --key <key>                       Google Gemini API Key (overrides .env)
  -f, --format <format>                 Output: srt, vtt, md, txt, json (default: srt)
  -m, --model <model>                   Model: pro, flash, flash-lite (default: pro)
  -s, --speakers <names...>             Speaker names: -s "Alice" "Bob"
  -i, --instructions <text>             Custom AI instructions
  -ac, --audio-chunk-minutes <mins>     Chunk duration (default: 120)
  -r, --report                          Generate meeting report
  -p, --preset <preset>                 Preset: fast, quality, lite
  --show-cost                           Show estimated API cost
  --force                               Bypass cache, re-transcribe
  --no-interactive                      Skip speaker identification prompts
  -h, --help                            Show help
```

---

## 📚 Examples

### Generate Meeting Report with Action Items

```bash
bunx sb-transcribe meeting.mp4 --report --format md
```

**Output:** Creates both `meeting.md` (transcript) and `meeting_report.md` (AI summary with action items)

### Fast Processing (Use Flash Model)

```bash
bunx sb-transcribe video.mp4 --preset fast
```

### Provide Speaker Names Upfront

```bash
bunx sb-transcribe podcast.mp3 -s "Alice" "Bob" "Charlie" --no-interactive
```

### Check Cost Before Processing

```bash
bunx sb-transcribe video.mp4 --show-cost
```

**Output:**
```
--- Cost Estimation ---
  models/gemini-2.5-flash: 116,526 input + 19,218 output tokens
  Total estimated cost: $0.0290
```

### Re-run with Different Format (Uses Cache - Instant!)

```bash
# First run: calls API, takes ~30 seconds
bunx sb-transcribe video.mp4 --format md

# Second run: uses cache, takes <1 second!
bunx sb-transcribe video.mp4 --format json
```

### Force Re-transcription

```bash
bunx sb-transcribe video.mp4 --force
```

### Custom AI Instructions

```bash
bunx sb-transcribe video.mp4 -i "Focus on technical terminology and action items"
```

---

## 🎛️ Presets

| Preset | Model | Chunk Duration | Best For |
|--------|-------|----------------|----------|
| `fast` | Flash | 60 min | Quick transcriptions |
| `quality` | Pro | 120 min | Important meetings |
| `lite` | Flash-Lite | 30 min | Lowest cost |

```bash
bunx sb-transcribe video.mp4 --preset fast
bunx sb-transcribe video.mp4 --preset quality
bunx sb-transcribe video.mp4 --preset lite
```

---

## 📂 Project Structure

```
southbridge-transcriber/
├── .southbridge_intermediates/   # Cached transcriptions (per file)
│   └── video_name/
│       └── chunk_1_raw.json      # Raw AI response (enables caching)
├── ai.ts                         # Gemini API client, retry logic, report generation
├── audio.ts                      # FFmpeg audio extraction
├── config.ts                     # Prompts, models, costs, presets
├── formatting.ts                 # Output generators (SRT, VTT, MD, TXT, JSON, Report)
├── index.ts                      # CLI entry point & orchestration
├── splitter.ts                   # Audio chunking for long files
├── CHANGES.md                    # Detailed changelog since initial submission
├── package.json                  # Dependencies & bin configuration
└── README.md                     # This file
```

---

## 🏗️ How It Works

```
┌─────────────────┐
│    Input File   │
└────────┬────────┘
         ▼
┌─────────────────┐      ┌───────────────────┐
│  Media Engine   │ ────►│ Extract Screenshots│ (Multimodal Context)
│  (FFmpeg)       │ ────►│ Split Audio (10m)  │ (Overlapping Chunks)
└────────┬────────┘      └───────────────────┘
         ▼
┌─────────────────┐
│  Loop: Chunk N  │◄──── "Previous Context" (Last 20 lines)
└────────┬────────┘
         ▼
┌─────────────────┐
│   Gemini API    │ ◄─── Prompt: "Use Audio + Screenshots + Context"
└────────┬────────┘
         ▼
┌─────────────────┐
│   VALIDATOR     │ ◄─── Checks: Coverage > 80%? Gaps? Speaker consistency?
└────────┬────────┘
         │
    [Fail] ────► Retry (Add "Timing Hint" to prompt)
         │
    [Pass] ────► Normalize Speakers ("Speaker 1" -> "Fei-Fei")
         ▼
┌─────────────────┐
│  Final Output   │
└─────────────────┘
```

---

## 💰 Cost Estimation

Approximate costs per model (USD per million tokens):

| Model | Input | Output |
|-------|-------|--------|
| gemini-2.5-pro | $1.25 | $10.00 |
| gemini-2.5-flash | $0.15 | $0.60 |
| gemini-2.0-flash-lite | $0.075 | $0.30 |

**Example:** 1-hour video ≈ 120K tokens ≈ $0.03 with Flash model

Use `--show-cost` to see actual usage after processing.

---

## ⚠️ Known Limitations

| Issue | Details |
|-------|---------|
| **Speaker Accuracy** | May misidentify during crosstalk or noisy audio |
| **Model Differences** | Pro detects names better; Flash uses generic "Speaker 1" |
| **Timestamp Precision** | Approximate (±1-2 seconds) |
| **File Size** | Files >3 hours may hit daily API limits |
| **Language** | Optimized for English |

---

## 🧪 Testing

Run these commands to verify all features work:

```bash
# Test 1: Interactive speaker identification
bunx sb-transcribe test.mp3

# Test 2: Structured markdown output
bunx sb-transcribe test.mp3 --format md --no-interactive

# Test 3: Report generation
bunx sb-transcribe test.mp3 --report --no-interactive

# Test 4: Smart caching (should be instant)
bunx sb-transcribe test.mp3 --format json --no-interactive

# Test 5: Force re-transcription
bunx sb-transcribe test.mp3 --force --no-interactive

# Test 6: Preset + cost estimation
bunx sb-transcribe test.mp3 --preset fast --show-cost --no-interactive

# Test 7: Long video (1 hour)
bunx sb-transcribe videoplayback.mp4 --no-interactive --report
```

---

## 📄 Sample Outputs

### Markdown Transcript (`--format md`)
```markdown
# Meeting Transcript

_Processed on 1/13/2026, 8:05:44 PM_
_Duration: 61 minutes_
_Source: videoplayback.mp4_

## Speakers
- **Speaker 1**
- **Speaker 2**

## Transcript
[0:00] **Speaker 1**: Welcome to the meeting...
[0:15] **Speaker 2**: Thank you for having me...
```

### Meeting Report (`--report`)
```markdown
# Project Planning Meeting

## Summary
This meeting focused on Q1 deliverables...

## Key Points
- Budget approved for new initiative
- Timeline set for March delivery

## Action Items
| Owner | Task | Deadline |
|-------|------|----------|
| Alice | Draft proposal | Jan 20 |
| Bob | Review specs | Jan 25 |
```




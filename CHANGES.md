# Changes Since Initial Submission

This document tracks all improvements made to Southbridge Transcriber after the initial submission feedback.

---

## Summary of Feedback

> "It failed on a couple of points. It should operate on this video: https://www.youtube.com/watch?v=60iW8FZ7MJU
> And you should review the output from Offmute and Meeting Diary to ensure your submission meets the same standard."

---

## Changes Made

### 1. Output Formats (Meeting-Diary Parity)

| Feature | Before | After |
|---------|--------|-------|
| SRT format | ✅ | ✅ |
| VTT format | ✅ | ✅ |
| Markdown format | ✅ (basic) | ✅ (improved with duration, speakers list) |
| **TXT format** | ❌ | ✅ `--format txt` |
| **JSON format** | ❌ | ✅ `--format json` (with metadata) |

**Commit:** `feat: add TXT and JSON output formats (meeting-diary parity)`

---

### 2. Speaker Identification (Meeting-Diary Parity)

| Feature | Before | After |
|---------|--------|-------|
| Auto speaker detection | ✅ (Speaker 1, 2, 3...) | ✅ (AI now detects actual names when spoken) |
| **Interactive identification** | ❌ | ✅ Prompts user to name each speaker |
| **`-s` flag** | ❌ | ✅ Provide names upfront: `-s "John" "Barbara"` |
| **`--no-interactive`** | ❌ | ✅ Skip speaker identification |

**Commit:** `feat: add interactive speaker identification (meeting-diary parity)`

---

### 3. Model Selection (Offmute Parity)

| Feature | Before | After |
|---------|--------|-------|
| Model fallback | ✅ Auto-retry on quota | ✅ |
| **`-m/--model` flag** | ❌ | ✅ Choose: `pro`, `flash`, `flash-lite` |
| Model priority | gemini-2.5-flash first | gemini-2.5-pro first (better for long audio) |

**Usage:**
```bash
bunx sb-transcribe video.mp4 --model flash      # Fast processing
bunx sb-transcribe video.mp4 --model pro        # Best quality (default)
bunx sb-transcribe video.mp4 --model flash-lite # Most economical
```

**Commit:** `feat: add offmute features (--model, --instructions, --audio-chunk-minutes)`

---

### 4. Custom Instructions (Offmute Parity)

| Feature | Before | After |
|---------|--------|-------|
| **`-i/--instructions` flag** | ❌ | ✅ Add custom context to AI prompt |

**Usage:**
```bash
bunx sb-transcribe video.mp4 -i "Focus on technical terminology"
bunx sb-transcribe video.mp4 -i "Highlight action items and decisions"
```

---

### 5. Chunk Duration Control (Offmute Parity)

| Feature | Before | After |
|---------|--------|-------|
| Default chunk size | 20 minutes | **120 minutes** (better speaker consistency) |
| **`-ac` flag** | ❌ | ✅ `--audio-chunk-minutes <mins>` |

**Why 120 minutes?**
- Gemini 2.5 Pro supports up to 2 hours of audio context
- Processing as a single chunk maintains speaker identity across the entire meeting
- No "drift" between chunks

**Usage:**
```bash
bunx sb-transcribe video.mp4 -ac 60   # Split into 60-min chunks
bunx sb-transcribe video.mp4 -ac 120  # Default: 2-hour chunks
```

---

### 6. Improved Markdown Output

**Before:**
```markdown
# Transcript: video.mp4

_Processed on 1/13/2026_

## Transcript
...
```

**After (Meeting-Diary style):**
```markdown
# Meeting Transcript

_Processed on 1/13/2026, 6:08:38 PM_
_Duration: 56 minutes_
_Source: videoplayback.mp4_

## Speakers

- **Fei-Fei Li**
- **Justin**
- **Swyx**
- **Adeo Ressi**

## Transcript

[0:00] **Fei-Fei Li**: I think the whole history of deep learning is...
```

**Commit:** `feat: improve MD format to match meeting-diary style (duration, header)`

---

### 7. Meeting Report Generation (Offmute Parity)

| Feature | Before | After |
|---------|--------|-------|
| **`-r/--report` flag** | ❌ | ✅ Generates AI-powered meeting summary |

**What the report includes:**
- Meeting title (auto-generated from content)
- Executive summary (2-3 paragraphs)
- Key points discussed
- Decisions made
- Action items (with owner, task, deadline)
- Topics covered
- Participants list

**Usage:**
```bash
bunx sb-transcribe video.mp4 --report                    # Transcript + Report
bunx sb-transcribe video.mp4 --format md --report        # MD transcript + Report
```

**Output:** Creates `video_report.md` alongside the transcript.

**Commit:** `feat: add report generation and cost estimation (ipgu parity)`

---

### 8. Cost Estimation (IPGU Parity)

| Feature | Before | After |
|---------|--------|-------|
| **`--show-cost` flag** | ❌ | ✅ Shows estimated API cost after processing |

**What it shows:**
- Token usage breakdown per API call (input/output tokens)
- Model used for each operation
- Total estimated cost in USD

**Usage:**
```bash
bunx sb-transcribe video.mp4 --show-cost
```

**Example output:**
```
--- Cost Estimation ---
  models/gemini-2.5-pro: 125,000 input + 15,000 output tokens
  Total estimated cost: $0.1875
```

**Commit:** `feat: add report generation and cost estimation (ipgu parity)`

---

### 9. Presets (IPGU Parity)

| Feature | Before | After |
|---------|--------|-------|
| **`-p/--preset` flag** | ❌ | ✅ Quick configuration presets |

**Available presets:**

| Preset | Model | Chunk Duration | Use Case |
|--------|-------|----------------|----------|
| `fast` | flash | 60 min | Quick transcriptions |
| `quality` | pro | 120 min | Important meetings (default behavior) |
| `lite` | flash-lite | 30 min | Lowest cost |

**Usage:**
```bash
bunx sb-transcribe video.mp4 --preset fast      # Fast processing
bunx sb-transcribe video.mp4 --preset quality   # Best quality
bunx sb-transcribe video.mp4 --preset lite      # Most economical
```

**Commit:** `feat: add report generation and cost estimation (ipgu parity)`

---

## Test Results: 1-Hour YouTube Video

Successfully processed the video mentioned in feedback:
- **Video:** https://www.youtube.com/watch?v=60iW8FZ7MJU (~1 hour)
- **Processing:** Single chunk (no splitting needed with 120-min window)
- **Speakers:** AI automatically identified 4 speakers by name (Fei-Fei Li, Justin, Swyx, Adeo Ressi)
- **Duration transcribed:** 55:27 of speech content
- **Output formats tested:** MD, TXT, JSON, SRT, VTT

---

## CLI Options (Complete)

```
Usage: sb-transcribe [options] <file>

Transcribe and diarize video/audio using Multimodal AI

Arguments:
  file                                  Path to the video or audio file

Options:
  -V, --version                         output the version number
  -k, --key <key>                       Google Gemini API Key
  -f, --format <format>                 Output format: srt, vtt, md, txt, or json (default: "srt")
  -m, --model <model>                   Model: pro, flash, or flash-lite (default: "pro")
  -s, --speakers <names...>             Known speaker names (e.g., -s "John" "Barbara")
  -i, --instructions <text>             Custom instructions for the AI
  -ac, --audio-chunk-minutes <minutes>  Audio chunk duration in minutes (default: "120")
  -r, --report                          Generate a meeting report with key points and action items
  -p, --preset <preset>                 Use a preset: fast, quality, or lite
  --show-cost                           Show estimated API cost after processing
  --no-interactive                      Skip interactive speaker identification
  -h, --help                            display help for command
```

---

## Commits (Chronological)

1. `feat: add TXT and JSON output formats (meeting-diary parity)`
2. `fix: update format validation to include txt and json`
3. `feat: improve MD format to match meeting-diary style (duration, header)`
4. `feat: add interactive speaker identification (meeting-diary parity)`
5. `feat: add offmute features (--model, --instructions, --audio-chunk-minutes)`
6. `feat: add report generation, cost estimation, and presets (ipgu parity)`

---

## What's Different from Offmute/Meeting-Diary/IPGU

| Feature | Offmute | Meeting-Diary | IPGU | Our Tool |
|---------|---------|---------------|------|----------|
| Transcription engine | Gemini | AssemblyAI | Gemini | **Gemini** |
| Speaker diarization | ✅ | ✅ | ✅ | ✅ |
| Auto speaker naming | ✅ | ❌ | ❌ | ✅ |
| Interactive speaker ID | ❌ | ✅ | ❌ | ✅ |
| Model selection | ✅ | ❌ | ✅ | ✅ |
| Custom instructions | ✅ | ❌ | ❌ | ✅ |
| Chunk duration control | ✅ | ❌ | ✅ | ✅ |
| **Report generation** | ✅ | ❌ | ❌ | ✅ |
| **Cost estimation** | ❌ | ❌ | ✅ | ✅ |
| **Presets** | ❌ | ❌ | ✅ | ✅ |
| Translation | ❌ | ❌ | ✅ | ❌ |
| Multiple output formats | MD only | MD, SRT, TXT, JSON | SRT only | **All 5** |

---

## How to Test

```bash
# Basic transcription (default: SRT format, pro model)
bunx sb-transcribe video.mp4

# All formats
bunx sb-transcribe video.mp4 --format md
bunx sb-transcribe video.mp4 --format txt
bunx sb-transcribe video.mp4 --format json
bunx sb-transcribe video.mp4 --format vtt

# With model selection
bunx sb-transcribe video.mp4 --model flash

# With presets (NEW)
bunx sb-transcribe video.mp4 --preset fast
bunx sb-transcribe video.mp4 --preset quality
bunx sb-transcribe video.mp4 --preset lite

# Generate meeting report (NEW)
bunx sb-transcribe video.mp4 --report
bunx sb-transcribe video.mp4 --format md --report

# Show cost estimation (NEW)
bunx sb-transcribe video.mp4 --show-cost

# With custom instructions
bunx sb-transcribe video.mp4 -i "Focus on action items"

# With speaker names
bunx sb-transcribe video.mp4 -s "Alice" "Bob" "Charlie"

# Skip interactive prompts
bunx sb-transcribe video.mp4 --no-interactive

# Full example: Fast preset with report and cost
bunx sb-transcribe meeting.mp4 --preset fast --report --show-cost --no-interactive
```

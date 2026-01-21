import { expect, test, describe } from "bun:test";
import { validateTranscript } from "../validator";
import type { TranscriptSegment } from "../types";

describe("Transcript Validator", () => {
  test("should detect timing gap (underflow)", () => {
    // 1. We HARDCODE a "bad" input to test the logic
    const transcript: TranscriptSegment[] = [
      { speaker: "A", start: "00:00", end: "00:10", text: "Hello" },
      // GAP HERE: 00:10 to 00:20 is missing
      { speaker: "B", start: "00:20", end: "00:30", text: "Hi" }
    ];

    // 2. We configure the validator expectations
    const config = {
      expectedDuration: 40, // We expect 40s, but only gave 20s
      minCoveragePercent: 60,
      maxGapSeconds: 5,
      knownSpeakers: ["A", "B"],
      strictTiming: false
    };

    // 3. We Run the Logic
    const result = validateTranscript(transcript, config);

    // 4. We Expect the logic to catch the error
    // Fix for 'i implicit any': We assume 'i' has a 'type' property
    expect(result.issues.some((i: { type: string }) => i.type === "timing_gap" || i.type === "timing_underflow")).toBe(true);
  });
});
import { describe, expect, it } from "vitest";
import { formatDurationMs } from "../../src/shared/utils/time";

describe("formatDurationMs", () => {
  it("formats minutes and seconds", () => {
    expect(formatDurationMs(185_000)).toBe("3:05");
  });

  it("formats hours, minutes, and seconds", () => {
    expect(formatDurationMs(3_785_000)).toBe("1:03:05");
  });

  it("handles unknown durations", () => {
    expect(formatDurationMs()).toBe("Unknown duration");
  });
});

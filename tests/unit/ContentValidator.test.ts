import { describe, expect, it } from "vitest";
import { ContentValidator } from "../../src/domain/services/ContentValidator";

describe("ContentValidator", () => {
  it("allows safe input", () => {
    expect(ContentValidator.isForbidden("lo-fi study mix")).toEqual({
      forbidden: false,
    });
  });

  it("blocks a near-match blacklisted title", () => {
    const result = ContentValidator.isForbidden("Jagung rebus");

    expect(result.forbidden).toBe(true);
    expect(result.reason).toContain("inappropriate");
  });

  it("blocks a near-match forbidden word", () => {
    const result = ContentValidator.isForbidden("play fuck remix");

    expect(result.forbidden).toBe(true);
    expect(result.reason).toContain("forbidden");
  });
});

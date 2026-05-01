import { describe, expect, it } from "vitest";
import {
  classifyProviderFailure,
  createMissingCredentialsFailure,
  createProviderHttpFailure,
  isProviderFailureError,
} from "../../src/application/services/ProviderFailureClassifier";

describe("ProviderFailureClassifier", () => {
  it("classifies YouTube quota-exceeded 403 responses", () => {
    const error = createProviderHttpFailure(
      "youtube",
      "search",
      403,
      JSON.stringify({
        error: {
          errors: [{ reason: "quotaExceeded" }],
          message: "The request cannot be completed because quota is exhausted.",
        },
      }),
    );

    expect(error.failure).toMatchObject({
      provider: "youtube",
      operation: "search",
      reason: "quota-exceeded",
      statusCode: 403,
    });
    expect(error.message).toContain("quota");
  });

  it("classifies Spotify 403 responses as account restrictions", () => {
    const error = createProviderHttpFailure(
      "spotify",
      "search",
      403,
      JSON.stringify({
        error: {
          status: 403,
          message: "Premium required for this market.",
        },
      }),
    );

    expect(error.failure).toMatchObject({
      provider: "spotify",
      operation: "search",
      reason: "account-restricted",
      statusCode: 403,
    });
    expect(error.message).toContain("account");
  });

  it("classifies missing provider credentials", () => {
    const error = createMissingCredentialsFailure("spotify", "search", [
      "SPOTIFY_CLIENT_ID",
      "SPOTIFY_CLIENT_SECRET",
    ]);

    expect(error.failure).toMatchObject({
      provider: "spotify",
      operation: "search",
      reason: "credentials-missing",
      retryable: false,
    });
  });

  it("classifies legacy plain errors without losing provider context", () => {
    const failure = classifyProviderFailure(
      new Error("Spotify search failed. HTTP 403. Premium required."),
      "spotify",
      "search",
    );

    expect(failure).toMatchObject({
      provider: "spotify",
      operation: "search",
      reason: "account-restricted",
      statusCode: 403,
    });
  });

  it("returns structured failures unchanged", () => {
    const error = createMissingCredentialsFailure("youtube", "playlist", [
      "YOUTUBE_API_KEY",
    ]);

    expect(isProviderFailureError(error)).toBe(true);
    expect(classifyProviderFailure(error)).toBe(error.failure);
  });

  it("classifies auth, rate-limit, unavailable, and unknown HTTP failures", () => {
    const auth = createProviderHttpFailure("youtube", "search", 401, "{}");
    const rateLimit = createProviderHttpFailure(
      "spotify",
      "search",
      429,
      "{}",
      "3",
    );
    const unavailable = createProviderHttpFailure(
      "youtube",
      "search",
      503,
      "{}",
      new Date(Date.now() + 5_000).toUTCString(),
    );
    const unknown = createProviderHttpFailure("youtube", "search", 404, "{}");
    const unavailable403 = createProviderHttpFailure(
      "youtube",
      "search",
      403,
      "{}",
      "not-a-date",
    );

    expect(auth.failure.reason).toBe("credentials-missing");
    expect(auth.failure.retryable).toBe(false);
    expect(rateLimit.failure.reason).toBe("rate-limited");
    expect(rateLimit.failure.retryAfterMs).toBe(3_000);
    expect(unavailable.failure.reason).toBe("unavailable");
    expect(unavailable.failure.retryAfterMs).toBeGreaterThanOrEqual(0);
    expect(unknown.failure.reason).toBe("unknown");
    expect(unavailable403.failure.reason).toBe("unavailable");
    expect(unavailable403.failure.retryAfterMs).toBeUndefined();
  });

  it("classifies text-only provider failures", () => {
    expect(
      classifyProviderFailure(new Error("YouTube quota exceeded"), "unknown")
        .reason,
    ).toBe("quota-exceeded");
    expect(
      classifyProviderFailure(new Error("Spotify subscription restricted"))
        .reason,
    ).toBe("account-restricted");
    expect(
      classifyProviderFailure(new Error("provider rate limit"), "youtube")
        .reason,
    ).toBe("rate-limited");
    expect(
      classifyProviderFailure(new Error("API key missing"), "youtube").reason,
    ).toBe("credentials-missing");
    expect(classifyProviderFailure("boom").reason).toBe("unknown");
  });
});

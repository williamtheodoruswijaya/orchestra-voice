import { describe, expect, it } from "vitest";
import {
  classifyProviderFailure,
  createMissingCredentialsFailure,
  createProviderHttpFailure,
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
});

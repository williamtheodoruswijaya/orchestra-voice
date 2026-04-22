import { describe, expect, it } from "vitest";
import { ProviderCooldownService } from "../../src/application/services/ProviderCooldownService";
import type { ProviderFailure } from "../../src/application/services/ProviderFailureClassifier";

function failure(overrides: Partial<ProviderFailure> = {}): ProviderFailure {
  return {
    provider: "youtube",
    reason: "quota-exceeded",
    operation: "search",
    message: "YouTube search is temporarily unavailable.",
    retryable: true,
    ...overrides,
  };
}

describe("ProviderCooldownService", () => {
  it("cooldowns a failed provider and expires the cooldown later", () => {
    let now = 1_000;
    const service = new ProviderCooldownService({
      clock: () => now,
      cooldownByReasonMs: {
        "quota-exceeded": 2_000,
      },
    });

    const registration = service.recordFailure(failure());

    expect(registration.shouldLog).toBe(true);
    expect(service.getCooldown("youtube")).toMatchObject({
      provider: "youtube",
      failureReason: "quota-exceeded",
      retryAfterMs: 2_000,
    });

    now = 3_001;

    expect(service.getCooldown("youtube")).toBeUndefined();
  });

  it("suppresses repeated identical log events during the cooldown window", () => {
    let now = 1_000;
    const service = new ProviderCooldownService({
      clock: () => now,
      logSuppressionMs: 5_000,
      cooldownByReasonMs: {
        "account-restricted": 1_000,
      },
    });

    const first = service.recordFailure(
      failure({
        provider: "spotify",
        reason: "account-restricted",
      }),
    );
    const second = service.recordFailure(
      failure({
        provider: "spotify",
        reason: "account-restricted",
      }),
    );

    expect(first.shouldLog).toBe(true);
    expect(second.shouldLog).toBe(false);

    now = 6_001;
    const third = service.recordFailure(
      failure({
        provider: "spotify",
        reason: "account-restricted",
      }),
    );

    expect(third.shouldLog).toBe(true);
  });

  it("keeps provider cooldown state isolated by provider", () => {
    const service = new ProviderCooldownService({
      cooldownByReasonMs: {
        "quota-exceeded": 2_000,
      },
    });

    service.recordFailure(failure({ provider: "youtube" }));

    expect(service.getCooldown("youtube")).toBeDefined();
    expect(service.getCooldown("spotify")).toBeUndefined();
  });
});

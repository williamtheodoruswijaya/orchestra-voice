import { describe, expect, it } from "vitest";
import type { LoggerPort } from "../../src/application/ports/outbound/LoggerPort";
import type { MusicCatalogPort } from "../../src/application/ports/outbound/MusicCatalogPort";
import { ProviderCooldownService } from "../../src/application/services/ProviderCooldownService";
import { ProviderFailureError } from "../../src/application/services/ProviderFailureClassifier";
import type { Track } from "../../src/domain/entities/Track";
import { ResilientMusicCatalogAdapter } from "../../src/infrastructure/providers/ResilientMusicCatalogAdapter";

class FakeCatalog implements MusicCatalogPort {
  calls = 0;
  fail = true;

  async search(_query: string): Promise<Track[]> {
    this.calls += 1;

    if (this.fail) {
      throw new ProviderFailureError({
        provider: "spotify",
        reason: "account-restricted",
        operation: "search",
        message: "Spotify search is restricted.",
        retryable: true,
      });
    }

    return [
      {
        id: "spotify:ok",
        provider: "spotify",
        providerTrackId: "ok",
        title: "Recovered",
      },
    ];
  }
}

class FakeLogger implements LoggerPort {
  readonly warnings: string[] = [];

  debug(_message: string): void {}
  info(_message: string): void {}
  error(_message: string): void {}

  warn(message: string): void {
    this.warnings.push(message);
  }
}

describe("ResilientMusicCatalogAdapter", () => {
  it("classifies failures, skips provider calls during cooldown, and avoids duplicate warnings", async () => {
    let now = 1_000;
    const catalog = new FakeCatalog();
    const logger = new FakeLogger();
    const cooldowns = new ProviderCooldownService({
      clock: () => now,
      logSuppressionMs: 5_000,
      cooldownByReasonMs: {
        "account-restricted": 2_000,
      },
    });
    const resilient = new ResilientMusicCatalogAdapter(
      "spotify",
      catalog,
      cooldowns,
      logger,
    );

    const first = await resilient.searchDetailed("song");
    const second = await resilient.searchDetailed("song");

    expect(catalog.calls).toBe(1);
    expect(logger.warnings).toHaveLength(1);
    expect(first.providerStatuses[0]).toMatchObject({
      provider: "spotify",
      status: "failed",
    });
    expect(second.providerStatuses[0]).toMatchObject({
      provider: "spotify",
      status: "skipped",
      failureReason: "account-restricted",
    });

    now = 3_001;
    catalog.fail = false;

    const recovered = await resilient.searchDetailed("song");

    expect(catalog.calls).toBe(2);
    expect(recovered.tracks.map((track) => track.title)).toEqual([
      "Recovered",
    ]);
    expect(recovered.providerStatuses[0]).toMatchObject({
      provider: "spotify",
      status: "fulfilled",
      resultCount: 1,
    });
  });
});

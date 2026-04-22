import type { LoggerPort } from "../../application/ports/outbound/LoggerPort";
import type {
  MusicCatalogPort,
  MusicCatalogSearchResult,
} from "../../application/ports/outbound/MusicCatalogPort";
import { ProviderCooldownService } from "../../application/services/ProviderCooldownService";
import {
  classifyProviderFailure,
  type MetadataProvider,
} from "../../application/services/ProviderFailureClassifier";

export class ResilientMusicCatalogAdapter implements MusicCatalogPort {
  constructor(
    private readonly provider: MetadataProvider,
    private readonly catalog: MusicCatalogPort,
    private readonly cooldowns: ProviderCooldownService,
    private readonly logger?: LoggerPort,
  ) {}

  async search(query: string): Promise<MusicCatalogSearchResult["tracks"]> {
    const result = await this.searchDetailed(query);
    return result.tracks;
  }

  async searchDetailed(query: string): Promise<MusicCatalogSearchResult> {
    const cooldown = this.cooldowns.getCooldown(this.provider);

    if (cooldown) {
      return {
        tracks: [],
        providerStatuses: [
          {
            provider: this.provider,
            status: "skipped",
            reason: "cooldown",
            failureReason: cooldown.failureReason,
            retryAfterMs: cooldown.retryAfterMs,
            message: cooldown.message,
          },
        ],
      };
    }

    try {
      const tracks = await this.catalog.search(query);
      this.cooldowns.recordSuccess(this.provider);

      return {
        tracks,
        providerStatuses: [
          {
            provider: this.provider,
            status: "fulfilled",
            resultCount: tracks.length,
          },
        ],
      };
    } catch (error) {
      const failure = classifyProviderFailure(error, this.provider, "search");
      const registration = this.cooldowns.recordFailure(failure);

      if (registration.shouldLog) {
        this.logger?.warn(failure.message, {
          provider: failure.provider,
          reason: failure.reason,
          operation: failure.operation,
          statusCode: failure.statusCode,
          cooldownUntil: registration.cooldownUntil,
        });
      }

      return {
        tracks: [],
        providerStatuses: [
          {
            provider: this.provider,
            status: "failed",
            failure,
          },
        ],
      };
    }
  }
}

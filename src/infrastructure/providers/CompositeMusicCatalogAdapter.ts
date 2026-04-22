import { Track } from "../../domain/entities/Track";
import {
  MusicCatalogPort,
  MusicCatalogSearchResult,
  ProviderSearchStatus,
} from "../../application/ports/outbound/MusicCatalogPort";
import { classifyProviderFailure } from "../../application/services/ProviderFailureClassifier";

export class CompositeMusicCatalogAdapter implements MusicCatalogPort {
  constructor(
    private readonly providers: MusicCatalogPort[],
    private readonly limit: number = 10,
  ) {}

  async search(query: string): Promise<Track[]> {
    const result = await this.searchDetailed(query);
    return result.tracks;
  }

  async searchDetailed(query: string): Promise<MusicCatalogSearchResult> {
    const settledResults = await Promise.all(
      this.providers.map((provider) => this.searchProvider(provider, query)),
    );

    const merged: Track[] = [];
    const providerStatuses: ProviderSearchStatus[] = [];

    for (const result of settledResults) {
      merged.push(...result.tracks);
      providerStatuses.push(...result.providerStatuses);
    }

    return {
      tracks: merged.slice(0, this.limit),
      providerStatuses,
    };
  }

  private async searchProvider(
    provider: MusicCatalogPort,
    query: string,
  ): Promise<MusicCatalogSearchResult> {
    try {
      if (provider.searchDetailed) {
        return await provider.searchDetailed(query);
      }

      const tracks = await provider.search(query);
      return {
        tracks,
        providerStatuses: [
          {
            provider: "unknown",
            status: "fulfilled",
            resultCount: tracks.length,
          },
        ],
      };
    } catch (error) {
      return {
        tracks: [],
        providerStatuses: [
          {
            provider: "unknown",
            status: "failed",
            failure: classifyProviderFailure(error),
          },
        ],
      };
    }
  }
}

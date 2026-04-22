import { Track } from "../../domain/entities/Track";
import { MusicCatalogPort } from "../../application/ports/outbound/MusicCatalogPort";

export class CompositeMusicCatalogAdapter implements MusicCatalogPort {
  constructor(
    private readonly providers: MusicCatalogPort[],
    private readonly limit: number = 10,
  ) {}

  async search(query: string): Promise<Track[]> {
    const settledResults = await Promise.allSettled(
      this.providers.map((provider) => provider.search(query)),
    );

    const merged: Track[] = [];

    for (const result of settledResults) {
      if (result.status === "fulfilled") {
        merged.push(...result.value);
      } else {
        console.error("Composite search provider failed:", result.reason);
      }
    }

    return merged.slice(0, this.limit);
  }
}

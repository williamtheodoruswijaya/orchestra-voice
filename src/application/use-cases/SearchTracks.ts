import { Track } from "../../domain/entities/Track";
import {
  MusicCatalogPort,
  MusicCatalogSearchResult,
} from "../ports/outbound/MusicCatalogPort";

export class SearchTracks {
  constructor(private readonly musicCatalog: MusicCatalogPort) {}

  async execute(query: string): Promise<Track[]> {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      throw new Error("Search query cannot be empty.");
    }

    return this.musicCatalog.search(trimmedQuery);
  }

  async executeDetailed(query: string): Promise<MusicCatalogSearchResult> {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      throw new Error("Search query cannot be empty.");
    }

    if (this.musicCatalog.searchDetailed) {
      return this.musicCatalog.searchDetailed(trimmedQuery);
    }

    const tracks = await this.musicCatalog.search(trimmedQuery);
    return {
      tracks,
      providerStatuses: [],
    };
  }
}

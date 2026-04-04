import { Track } from "../../domain/entities/Track";
import { MusicCatalogPort } from "../ports/outbound/MusicCatalogPort";

export class SearchTracks {
  constructor(private readonly musicCatalog: MusicCatalogPort) {}

  async execute(query: string): Promise<Track[]> {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      throw new Error("Search query cannot be empty.");
    }

    return this.musicCatalog.search(trimmedQuery);
  }
}

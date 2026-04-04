import { Track } from "../../../domain/entities/Track";

export interface MusicCatalogPort {
  search(query: string): Promise<Track[]>;
}

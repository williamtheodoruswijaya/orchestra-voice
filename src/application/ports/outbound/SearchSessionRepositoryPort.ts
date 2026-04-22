import { Track } from "../../../domain/entities/Track";

export type SearchProvider = "youtube" | "spotify" | "all";

export interface SearchSessionState {
  guildId: string;
  lastQuery?: string;
  lastProvider?: SearchProvider;
  lastResults: Track[];
  selectedTrack?: Track;
}

export interface SearchSessionRepositoryPort {
  getByGuildId(guildId: string): Promise<SearchSessionState>;
  save(session: SearchSessionState): Promise<void>;
  clear(guildId: string): Promise<void>;
}

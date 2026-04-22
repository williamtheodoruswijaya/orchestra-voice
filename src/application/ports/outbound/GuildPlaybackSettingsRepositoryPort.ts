import type { GuildPlaybackSettings } from "../../../domain/entities/GuildPlaybackSettings";

export interface GuildPlaybackSettingsRepositoryPort {
  getByGuildId(guildId: string): Promise<GuildPlaybackSettings>;
  save(settings: GuildPlaybackSettings): Promise<void>;
  clear(guildId: string): Promise<void>;
}

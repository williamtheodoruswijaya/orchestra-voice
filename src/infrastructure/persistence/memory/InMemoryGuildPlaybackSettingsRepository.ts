import {
  GuildPlaybackSettings,
  GuildPlaybackSettingsState,
} from "../../../domain/entities/GuildPlaybackSettings";
import type { GuildPlaybackSettingsRepositoryPort } from "../../../application/ports/outbound/GuildPlaybackSettingsRepositoryPort";

export class InMemoryGuildPlaybackSettingsRepository
  implements GuildPlaybackSettingsRepositoryPort
{
  private readonly store = new Map<string, GuildPlaybackSettingsState>();

  async getByGuildId(guildId: string): Promise<GuildPlaybackSettings> {
    const existing = this.store.get(guildId);

    if (!existing) {
      return new GuildPlaybackSettings(guildId);
    }

    return new GuildPlaybackSettings(
      existing.guildId,
      existing.autoplayMode,
      existing.mood,
    );
  }

  async save(settings: GuildPlaybackSettings): Promise<void> {
    this.store.set(settings.guildId, settings.toState());
  }

  async clear(guildId: string): Promise<void> {
    this.store.delete(guildId);
  }
}

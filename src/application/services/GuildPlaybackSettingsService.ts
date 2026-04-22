import type {
  AutoplayMode,
  GuildPlaybackSettingsState,
  PlaybackMood,
} from "../../domain/entities/GuildPlaybackSettings";
import type { GuildPlaybackSettingsRepositoryPort } from "../ports/outbound/GuildPlaybackSettingsRepositoryPort";

export class GuildPlaybackSettingsService {
  constructor(
    private readonly settingsRepository: GuildPlaybackSettingsRepositoryPort,
  ) {}

  async getSettings(guildId: string): Promise<GuildPlaybackSettingsState> {
    const settings = await this.settingsRepository.getByGuildId(guildId);
    return settings.toState();
  }

  async setAutoplay(
    guildId: string,
    mode: AutoplayMode,
  ): Promise<GuildPlaybackSettingsState> {
    const settings = await this.settingsRepository.getByGuildId(guildId);

    if (mode === "related") {
      settings.enableRelatedAutoplay();
    } else {
      settings.disableAutoplay();
    }

    await this.settingsRepository.save(settings);
    return settings.toState();
  }

  async setMood(
    guildId: string,
    mood: PlaybackMood,
  ): Promise<GuildPlaybackSettingsState> {
    const settings = await this.settingsRepository.getByGuildId(guildId);
    settings.setMood(mood);

    await this.settingsRepository.save(settings);
    return settings.toState();
  }
}

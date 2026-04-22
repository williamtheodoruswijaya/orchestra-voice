import type { GuildPlaybackSettingsState } from "../../domain/entities/GuildPlaybackSettings";
import { GuildPlaybackSettingsService } from "../services/GuildPlaybackSettingsService";

export class GetPlaybackSettings {
  constructor(
    private readonly settingsService: GuildPlaybackSettingsService,
  ) {}

  async execute(guildId: string): Promise<GuildPlaybackSettingsState> {
    return this.settingsService.getSettings(guildId);
  }
}

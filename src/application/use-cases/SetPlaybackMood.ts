import type {
  GuildPlaybackSettingsState,
  PlaybackMood,
} from "../../domain/entities/GuildPlaybackSettings";
import { GuildPlaybackSettingsService } from "../services/GuildPlaybackSettingsService";

interface SetPlaybackMoodInput {
  guildId: string;
  mood: PlaybackMood;
}

export class SetPlaybackMood {
  constructor(
    private readonly settingsService: GuildPlaybackSettingsService,
  ) {}

  async execute(
    input: SetPlaybackMoodInput,
  ): Promise<GuildPlaybackSettingsState> {
    return this.settingsService.setMood(input.guildId, input.mood);
  }
}

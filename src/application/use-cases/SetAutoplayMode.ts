import type {
  AutoplayMode,
  GuildPlaybackSettingsState,
} from "../../domain/entities/GuildPlaybackSettings";
import { GuildPlaybackSettingsService } from "../services/GuildPlaybackSettingsService";

interface SetAutoplayModeInput {
  guildId: string;
  mode: AutoplayMode;
}

export class SetAutoplayMode {
  constructor(
    private readonly settingsService: GuildPlaybackSettingsService,
  ) {}

  async execute(
    input: SetAutoplayModeInput,
  ): Promise<GuildPlaybackSettingsState> {
    return this.settingsService.setAutoplay(input.guildId, input.mode);
  }
}

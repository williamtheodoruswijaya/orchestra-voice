export type AutoplayMode = "off" | "related";
export type PlaybackMood = "balanced" | "focus" | "chill" | "upbeat";

export interface GuildPlaybackSettingsState {
  guildId: string;
  autoplayMode: AutoplayMode;
  mood: PlaybackMood;
}

export class GuildPlaybackSettings {
  constructor(
    public readonly guildId: string,
    public autoplayMode: AutoplayMode = "off",
    public mood: PlaybackMood = "balanced",
  ) {}

  enableRelatedAutoplay(): void {
    this.autoplayMode = "related";
  }

  disableAutoplay(): void {
    this.autoplayMode = "off";
  }

  setMood(mood: PlaybackMood): void {
    this.mood = mood;
  }

  toState(): GuildPlaybackSettingsState {
    return {
      guildId: this.guildId,
      autoplayMode: this.autoplayMode,
      mood: this.mood,
    };
  }
}

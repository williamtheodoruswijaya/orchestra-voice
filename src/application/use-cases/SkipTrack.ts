import {
  AdvancePlaybackResult,
  PlaybackQueueService,
} from "../services/PlaybackQueueService";

export class SkipTrack {
  constructor(private readonly playbackQueueService: PlaybackQueueService) {}

  async execute(guildId: string): Promise<AdvancePlaybackResult> {
    return this.playbackQueueService.skip(guildId);
  }
}

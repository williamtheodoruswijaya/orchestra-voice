import {
  LoopCurrentResult,
  PlaybackQueueService,
} from "../services/PlaybackQueueService";

export class LoopCurrentTrack {
  constructor(private readonly playbackQueueService: PlaybackQueueService) {}

  async execute(guildId: string): Promise<LoopCurrentResult> {
    return this.playbackQueueService.toggleCurrentLoop(guildId);
  }
}

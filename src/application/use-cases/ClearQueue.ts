import {
  ClearQueueResult,
  PlaybackQueueService,
} from "../services/PlaybackQueueService";

export class ClearQueue {
  constructor(private readonly playbackQueueService: PlaybackQueueService) {}

  async execute(guildId: string): Promise<ClearQueueResult> {
    return this.playbackQueueService.clearUpcoming(guildId);
  }
}

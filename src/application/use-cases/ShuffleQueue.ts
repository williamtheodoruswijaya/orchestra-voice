import {
  PlaybackQueueService,
  ShuffleQueueResult,
} from "../services/PlaybackQueueService";

export class ShuffleQueue {
  constructor(private readonly playbackQueueService: PlaybackQueueService) {}

  async execute(guildId: string): Promise<ShuffleQueueResult> {
    return this.playbackQueueService.shuffleUpcoming(guildId);
  }
}

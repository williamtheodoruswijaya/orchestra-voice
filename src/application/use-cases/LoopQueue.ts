import {
  PlaybackQueueService,
  QueueLoopResult,
} from "../services/PlaybackQueueService";

export class LoopQueue {
  constructor(private readonly playbackQueueService: PlaybackQueueService) {}

  async execute(guildId: string): Promise<QueueLoopResult> {
    return this.playbackQueueService.toggleQueueLoop(guildId);
  }
}

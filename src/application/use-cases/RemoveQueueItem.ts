import {
  PlaybackQueueService,
  RemoveQueueItemResult,
} from "../services/PlaybackQueueService";

interface RemoveQueueItemInput {
  guildId: string;
  position: number;
}

export class RemoveQueueItem {
  constructor(private readonly playbackQueueService: PlaybackQueueService) {}

  async execute(input: RemoveQueueItemInput): Promise<RemoveQueueItemResult> {
    return this.playbackQueueService.removeUpcoming(
      input.guildId,
      input.position,
    );
  }
}

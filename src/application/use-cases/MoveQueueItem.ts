import {
  MoveQueueItemResult,
  PlaybackQueueService,
} from "../services/PlaybackQueueService";

export interface MoveQueueItemInput {
  guildId: string;
  from: number;
  to: number;
}

export class MoveQueueItem {
  constructor(private readonly playbackQueueService: PlaybackQueueService) {}

  async execute(input: MoveQueueItemInput): Promise<MoveQueueItemResult> {
    return this.playbackQueueService.moveUpcoming(
      input.guildId,
      input.from,
      input.to,
    );
  }
}

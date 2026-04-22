import {
  EnqueueTrackInput,
  EnqueueTrackResult,
  PlaybackQueueService,
} from "../services/PlaybackQueueService";

export class EnqueueTrack {
  constructor(private readonly playbackQueueService: PlaybackQueueService) {}

  async execute(input: EnqueueTrackInput): Promise<EnqueueTrackResult> {
    return this.playbackQueueService.enqueue(input);
  }
}

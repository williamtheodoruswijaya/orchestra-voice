import {
  PlaybackQueueService,
  PlayNowInput,
  PlayNowResult,
} from "../services/PlaybackQueueService";

export class PlayNowTrack {
  constructor(private readonly playbackQueueService: PlaybackQueueService) {}

  async execute(input: PlayNowInput): Promise<PlayNowResult> {
    return this.playbackQueueService.playNow(input);
  }
}

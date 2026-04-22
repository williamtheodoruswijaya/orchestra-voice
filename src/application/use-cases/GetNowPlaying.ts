import { QueueItem } from "../../domain/entities/GuildQueue";
import { PlaybackQueueService } from "../services/PlaybackQueueService";

export class GetNowPlaying {
  constructor(private readonly playbackQueueService: PlaybackQueueService) {}

  async execute(guildId: string): Promise<QueueItem | undefined> {
    return this.playbackQueueService.getNowPlaying(guildId);
  }
}

import { QueueState } from "../../domain/entities/GuildQueue";
import { PlaybackQueueService } from "../services/PlaybackQueueService";

export class ResumePlayback {
  constructor(private readonly playbackQueueService: PlaybackQueueService) {}

  async execute(guildId: string): Promise<QueueState> {
    return this.playbackQueueService.resume(guildId);
  }
}

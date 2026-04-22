import { GuildQueue } from "../../../domain/entities/GuildQueue";

export interface QueueRepositoryPort {
  getByGuildId(guildId: string): Promise<GuildQueue>;
  save(queue: GuildQueue): Promise<void>;
  clear(guildId: string): Promise<void>;
}

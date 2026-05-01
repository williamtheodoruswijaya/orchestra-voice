import { GuildQueue, QueueState } from "../../../domain/entities/GuildQueue";
import { QueueRepositoryPort } from "../../../application/ports/outbound/QueueRepositoryPort";

export class InMemoryGuildQueueRepository implements QueueRepositoryPort {
  private readonly store = new Map<string, QueueState>();

  async getByGuildId(guildId: string): Promise<GuildQueue> {
    const existing = this.store.get(guildId);

    if (!existing) {
      return new GuildQueue(guildId);
    }

    return new GuildQueue(guildId, {
      current: existing.current,
      upcoming: existing.upcoming,
      status: existing.status,
      loopCurrent: existing.loopCurrent,
      queueLoop: existing.queueLoop,
      queueLoopItems: existing.queueLoopItems,
    });
  }

  async save(queue: GuildQueue): Promise<void> {
    this.store.set(queue.guildId, queue.toState());
  }

  async clear(guildId: string): Promise<void> {
    this.store.delete(guildId);
  }
}

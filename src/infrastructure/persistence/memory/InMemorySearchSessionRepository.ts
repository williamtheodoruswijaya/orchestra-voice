import {
  SearchSessionRepositoryPort,
  SearchSessionState,
} from "../../../application/ports/outbound/SearchSessionRepositoryPort";

export class InMemorySearchSessionRepository implements SearchSessionRepositoryPort {
  private readonly store = new Map<string, SearchSessionState>();

  async getByGuildId(guildId: string): Promise<SearchSessionState> {
    const existing = this.store.get(guildId);

    if (existing) {
      return existing;
    }

    const emptyState: SearchSessionState = {
      guildId,
      lastResults: [],
    };

    this.store.set(guildId, emptyState);
    return emptyState;
  }

  async save(session: SearchSessionState): Promise<void> {
    this.store.set(session.guildId, session);
  }

  async clear(guildId: string): Promise<void> {
    this.store.delete(guildId);
  }
}

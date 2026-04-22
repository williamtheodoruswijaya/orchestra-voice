import { Track } from "../../domain/entities/Track";
import { SearchSessionRepositoryPort } from "../ports/outbound/SearchSessionRepositoryPort";

export class GetSelectedTrack {
  constructor(
    private readonly searchSessionRepository: SearchSessionRepositoryPort,
  ) {}

  async execute(guildId: string): Promise<Track | undefined> {
    const session = await this.searchSessionRepository.getByGuildId(guildId);
    return session.selectedTrack;
  }
}

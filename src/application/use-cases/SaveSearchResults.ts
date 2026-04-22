import {
  SearchProvider,
  SearchSessionRepositoryPort,
} from "../ports/outbound/SearchSessionRepositoryPort";
import { Track } from "../../domain/entities/Track";

interface SaveSearchResultsInput {
  guildId: string;
  query: string;
  provider: SearchProvider;
  results: Track[];
}

export class SaveSearchResults {
  constructor(
    private readonly searchSessionRepository: SearchSessionRepositoryPort,
  ) {}

  async execute(input: SaveSearchResultsInput): Promise<void> {
    const session = await this.searchSessionRepository.getByGuildId(
      input.guildId,
    );

    session.lastQuery = input.query;
    session.lastProvider = input.provider;
    session.lastResults = input.results;
    session.selectedTrack = undefined;

    await this.searchSessionRepository.save(session);
  }
}

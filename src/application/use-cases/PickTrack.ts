import { Track } from "../../domain/entities/Track";
import { SearchSessionRepositoryPort } from "../ports/outbound/SearchSessionRepositoryPort";

interface PickTrackInput {
  guildId: string;
  number: number;
}

export class PickTrack {
  constructor(
    private readonly searchSessionRepository: SearchSessionRepositoryPort,
  ) {}

  async execute(input: PickTrackInput): Promise<Track> {
    const session = await this.searchSessionRepository.getByGuildId(
      input.guildId,
    );

    if (session.lastResults.length === 0) {
      throw new Error(
        "There are no saved search results yet. Run /search first.",
      );
    }

    const index = input.number - 1;

    if (index < 0 || index >= session.lastResults.length) {
      throw new Error(
        `Pick number must be between 1 and ${session.lastResults.length}.`,
      );
    }

    const selectedTrack = session.lastResults[index];
    session.selectedTrack = selectedTrack;

    await this.searchSessionRepository.save(session);

    return selectedTrack;
  }
}

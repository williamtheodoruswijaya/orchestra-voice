import { describe, expect, it } from "vitest";
import { GetSelectedTrack } from "../../src/application/use-cases/GetSelectedTrack";
import { PickTrack } from "../../src/application/use-cases/PickTrack";
import { SaveSearchResults } from "../../src/application/use-cases/SaveSearchResults";
import { InMemorySearchSessionRepository } from "../../src/infrastructure/persistence/memory/InMemorySearchSessionRepository";
import type { Track } from "../../src/domain/entities/Track";

function createTrack(id: string): Track {
  return {
    id: `spotify:${id}`,
    provider: "spotify",
    providerTrackId: id,
    title: `Track ${id}`,
    artist: "Example Artist",
    pageUrl: `https://open.spotify.com/track/${id}`,
  };
}

describe("search session selection", () => {
  it("persists a selected track per guild", async () => {
    const repository = new InMemorySearchSessionRepository();
    const saveSearchResults = new SaveSearchResults(repository);
    const pickTrack = new PickTrack(repository);
    const getSelectedTrack = new GetSelectedTrack(repository);

    await saveSearchResults.execute({
      guildId: "guild-a",
      query: "song",
      provider: "spotify",
      results: [createTrack("a"), createTrack("b")],
    });
    await saveSearchResults.execute({
      guildId: "guild-b",
      query: "song",
      provider: "spotify",
      results: [createTrack("c")],
    });

    await pickTrack.execute({ guildId: "guild-a", number: 2 });
    await pickTrack.execute({ guildId: "guild-b", number: 1 });

    await expect(getSelectedTrack.execute("guild-a")).resolves.toMatchObject({
      title: "Track b",
    });
    await expect(getSelectedTrack.execute("guild-b")).resolves.toMatchObject({
      title: "Track c",
    });
  });

  it("clears the selected track when new search results are saved", async () => {
    const repository = new InMemorySearchSessionRepository();
    const saveSearchResults = new SaveSearchResults(repository);
    const pickTrack = new PickTrack(repository);
    const getSelectedTrack = new GetSelectedTrack(repository);

    await saveSearchResults.execute({
      guildId: "guild-a",
      query: "song",
      provider: "spotify",
      results: [createTrack("a")],
    });
    await pickTrack.execute({ guildId: "guild-a", number: 1 });
    await saveSearchResults.execute({
      guildId: "guild-a",
      query: "new song",
      provider: "spotify",
      results: [createTrack("b")],
    });

    await expect(getSelectedTrack.execute("guild-a")).resolves.toBeUndefined();
  });

  it("rejects picking when there are no saved results", async () => {
    const repository = new InMemorySearchSessionRepository();
    const pickTrack = new PickTrack(repository);

    await expect(
      pickTrack.execute({ guildId: "guild-a", number: 1 }),
    ).rejects.toThrow("There are no saved search results yet.");
  });

  it("rejects picking outside the saved result range", async () => {
    const repository = new InMemorySearchSessionRepository();
    const saveSearchResults = new SaveSearchResults(repository);
    const pickTrack = new PickTrack(repository);

    await saveSearchResults.execute({
      guildId: "guild-a",
      query: "song",
      provider: "spotify",
      results: [createTrack("a")],
    });

    await expect(
      pickTrack.execute({ guildId: "guild-a", number: 2 }),
    ).rejects.toThrow("Pick number must be between 1 and 1.");
  });
});

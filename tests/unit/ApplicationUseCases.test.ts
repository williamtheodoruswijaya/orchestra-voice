import { describe, expect, it } from "vitest";
import { EnqueueTrack } from "../../src/application/use-cases/EnqueueTrack";
import { GetNowPlaying } from "../../src/application/use-cases/GetNowPlaying";
import { GetPlaybackSettings } from "../../src/application/use-cases/GetPlaybackSettings";
import { LeaveVoiceChannel } from "../../src/application/use-cases/LeaveVoiceChannel";
import { MoveQueueItem } from "../../src/application/use-cases/MoveQueueItem";
import { PausePlayback } from "../../src/application/use-cases/PausePlayback";
import { RemoveQueueItem } from "../../src/application/use-cases/RemoveQueueItem";
import { ResumePlayback } from "../../src/application/use-cases/ResumePlayback";
import { SearchTracks } from "../../src/application/use-cases/SearchTracks";
import { SetPlaybackMood } from "../../src/application/use-cases/SetPlaybackMood";
import { StartPlayback } from "../../src/application/use-cases/StartPlayback";
import { StopPlayback } from "../../src/application/use-cases/StopPlayback";
import type { PlaybackQueueService } from "../../src/application/services/PlaybackQueueService";
import type { GuildPlaybackSettingsService } from "../../src/application/services/GuildPlaybackSettingsService";
import type { MusicCatalogPort } from "../../src/application/ports/outbound/MusicCatalogPort";
import type { StreamResolverPort } from "../../src/application/ports/outbound/StreamResolverPort";
import type {
  PlayAudioRequest,
  VoiceGatewayPort,
} from "../../src/application/ports/outbound/VoiceGatewayPort";
import type { Track } from "../../src/domain/entities/Track";

function createTrack(id: string): Track {
  return {
    id: `youtube:${id}`,
    provider: "youtube",
    providerTrackId: id,
    title: `Track ${id}`,
    pageUrl: `https://example.com/${id}`,
  };
}

describe("application use cases", () => {
  it("delegates playback queue wrappers to the playback service", async () => {
    const calls: string[] = [];
    const playbackService = {
      enqueue: async () => {
        calls.push("enqueue");
        return { startedPlayback: false };
      },
      getNowPlaying: async () => {
        calls.push("getNowPlaying");
        return createTrack("now");
      },
      pause: async () => {
        calls.push("pause");
        return { status: "paused" };
      },
      resume: async () => {
        calls.push("resume");
        return { status: "playing" };
      },
      removeUpcoming: async (_guildId: string, position: number) => {
        calls.push(`remove:${position}`);
        return { removedItem: { track: createTrack("removed") } };
      },
      stop: async () => {
        calls.push("stop");
        return { status: "idle" };
      },
    } as unknown as PlaybackQueueService;

    await new EnqueueTrack(playbackService).execute({
      guildId: "guild-a",
      track: createTrack("a"),
    });
    await new GetNowPlaying(playbackService).execute("guild-a");
    await new PausePlayback(playbackService).execute("guild-a");
    await new ResumePlayback(playbackService).execute("guild-a");
    await new RemoveQueueItem(playbackService).execute({
      guildId: "guild-a",
      position: 2,
    });
    await new StopPlayback(playbackService).execute("guild-a");

    expect(calls).toEqual([
      "enqueue",
      "getNowPlaying",
      "pause",
      "resume",
      "remove:2",
      "stop",
    ]);
  });

  it("delegates move to the playback service", async () => {
    const calls: string[] = [];
    const playbackService = {
      moveUpcoming: async (_guildId: string, from: number, to: number) => {
        calls.push(`move:${from}→${to}`);
        return { movedItem: { track: createTrack("moved") }, queue: {} };
      },
    } as unknown as PlaybackQueueService;

    await new MoveQueueItem(playbackService).execute({
      guildId: "guild-a",
      from: 3,
      to: 1,
    });

    expect(calls).toEqual(["move:3→1"]);
  });

  it("delegates settings wrappers to the settings service", async () => {
    const calls: string[] = [];
    const settingsService = {
      getSettings: async () => {
        calls.push("getSettings");
        return { guildId: "guild-a", autoplayMode: "off", mood: "balanced" };
      },
      setMood: async (_guildId: string, mood: string) => {
        calls.push(`setMood:${mood}`);
        return { guildId: "guild-a", autoplayMode: "off", mood };
      },
    } as unknown as GuildPlaybackSettingsService;

    await new GetPlaybackSettings(settingsService).execute("guild-a");
    await new SetPlaybackMood(settingsService).execute({
      guildId: "guild-a",
      mood: "focus",
    });

    expect(calls).toEqual(["getSettings", "setMood:focus"]);
  });

  it("leaves voice through the voice gateway", async () => {
    const leftGuilds: string[] = [];
    const voiceGateway = {
      leave: async (guildId: string) => {
        leftGuilds.push(guildId);
      },
    } as unknown as VoiceGatewayPort;

    await new LeaveVoiceChannel(voiceGateway).execute("guild-a");

    expect(leftGuilds).toEqual(["guild-a"]);
  });

  it("resolves and starts playback through StartPlayback", async () => {
    const playCalls: PlayAudioRequest[] = [];
    const resolver = {
      resolve: async () => ({
        title: "Resolved Track",
        sourceUrl: "https://example.com/source",
        url: "https://example.com/audio.mp3",
      }),
    } as StreamResolverPort;
    const voiceGateway = {
      play: async (request: PlayAudioRequest) => {
        playCalls.push(request);
      },
    } as unknown as VoiceGatewayPort;

    const result = await new StartPlayback(voiceGateway, resolver).execute({
      guildId: "guild-a",
      source: "query",
    });

    expect(result.title).toBe("Resolved Track");
    expect(playCalls).toEqual([
      {
        guildId: "guild-a",
        title: "Resolved Track",
        sourceUrl: "https://example.com/source",
        url: "https://example.com/audio.mp3",
      },
    ]);
  });

  it("trims search queries and supports detailed or fallback search results", async () => {
    const tracks = [createTrack("a")];
    const detailedCatalog = {
      search: async () => [],
      searchDetailed: async (query: string) => ({
        tracks,
        providerStatuses: [
          { provider: "youtube" as const, status: "fulfilled" as const, resultCount: 1 },
        ],
        query,
      }),
    } as MusicCatalogPort;
    const fallbackCatalog = {
      search: async (query: string) =>
        query === "lofi" ? tracks : [],
    } as MusicCatalogPort;

    await expect(new SearchTracks(fallbackCatalog).execute("   ")).rejects.toThrow(
      "Search query cannot be empty.",
    );
    await expect(
      new SearchTracks(fallbackCatalog).execute(" lofi "),
    ).resolves.toEqual(tracks);
    await expect(
      new SearchTracks(detailedCatalog).executeDetailed("   "),
    ).rejects.toThrow("Search query cannot be empty.");
    await expect(
      new SearchTracks(detailedCatalog).executeDetailed(" lofi "),
    ).resolves.toMatchObject({ tracks });
    await expect(
      new SearchTracks(fallbackCatalog).executeDetailed(" lofi "),
    ).resolves.toEqual({ tracks, providerStatuses: [] });
  });
});

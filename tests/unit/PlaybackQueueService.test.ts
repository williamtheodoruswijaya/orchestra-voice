import { describe, expect, it } from "vitest";
import { PlaybackQueueService } from "../../src/application/services/PlaybackQueueService";
import type {
  AudioSourceDescriptor,
  ResolvedAudioSource,
  StreamResolverPort,
} from "../../src/application/ports/outbound/StreamResolverPort";
import type {
  MusicCatalogPort,
  MusicCatalogSearchResult,
  PlaylistLookupResult,
  ProviderSearchStatus,
} from "../../src/application/ports/outbound/MusicCatalogPort";
import type {
  JoinVoiceRequest,
  PlayAudioRequest,
  VoiceGatewayPort,
} from "../../src/application/ports/outbound/VoiceGatewayPort";
import { InMemoryGuildPlaybackSettingsRepository } from "../../src/infrastructure/persistence/memory/InMemoryGuildPlaybackSettingsRepository";
import { InMemoryGuildQueueRepository } from "../../src/infrastructure/persistence/memory/InMemoryGuildQueueRepository";
import type { Track } from "../../src/domain/entities/Track";

class FakeStreamResolver implements StreamResolverPort {
  readonly failedTrackIds = new Set<string>();
  readonly describeInputs: Array<string | Track> = [];
  readonly resolveInputs: Array<string | Track> = [];

  async describe(source: string | Track): Promise<AudioSourceDescriptor> {
    this.describeInputs.push(source);

    return {
      title: typeof source === "string" ? source : source.title,
      sourceUrl: typeof source === "string" ? source : source.pageUrl,
    };
  }

  async resolve(source: string | Track): Promise<ResolvedAudioSource> {
    this.resolveInputs.push(source);

    if (typeof source !== "string" && this.failedTrackIds.has(source.id)) {
      throw new Error(`Cannot resolve ${source.title}`);
    }

    const title = typeof source === "string" ? source : source.title;

    return {
      title,
      sourceUrl: typeof source === "string" ? source : source.pageUrl,
      url: `https://audio.example/${encodeURIComponent(title)}.mp3`,
    };
  }
}

class FakeMusicCatalog implements MusicCatalogPort {
  searchCalls = 0;

  constructor(private readonly tracks: Track[] = []) {}

  async search(_query: string): Promise<Track[]> {
    this.searchCalls += 1;
    return this.tracks;
  }
}

class FakePlaylistCatalog implements MusicCatalogPort {
  playlistCalls = 0;

  constructor(private readonly playlists: Map<string, PlaylistLookupResult>) {}

  async search(_query: string): Promise<Track[]> {
    return [];
  }

  async getPlaylist(source: string): Promise<PlaylistLookupResult | undefined> {
    this.playlistCalls += 1;
    return this.playlists.get(source);
  }
}

class DetailedFakeMusicCatalog implements MusicCatalogPort {
  searchCalls = 0;

  constructor(private readonly result: MusicCatalogSearchResult) {}

  async search(_query: string): Promise<Track[]> {
    const result = await this.searchDetailed(_query);
    return result.tracks;
  }

  async searchDetailed(_query: string): Promise<MusicCatalogSearchResult> {
    this.searchCalls += 1;
    return this.result;
  }
}

class FakeVoiceGateway implements VoiceGatewayPort {
  readonly playCalls: PlayAudioRequest[] = [];
  readonly stopCalls: string[] = [];
  readonly pauseCalls: string[] = [];
  readonly resumeCalls: string[] = [];
  failNextPlay = false;
  private readonly listeners: Array<(guildId: string) => void | Promise<void>> =
    [];

  async join(_request: JoinVoiceRequest): Promise<void> {}

  async play(request: PlayAudioRequest): Promise<void> {
    if (this.failNextPlay) {
      this.failNextPlay = false;
      throw new Error(`Cannot play ${request.title}`);
    }

    this.playCalls.push(request);
  }

  async leave(_guildId: string): Promise<void> {}

  async stop(guildId: string): Promise<void> {
    this.stopCalls.push(guildId);
  }

  async pause(guildId: string): Promise<boolean> {
    this.pauseCalls.push(guildId);
    return true;
  }

  async resume(guildId: string): Promise<boolean> {
    this.resumeCalls.push(guildId);
    return true;
  }

  onPlaybackFinished(
    listener: (guildId: string) => void | Promise<void>,
  ): void {
    this.listeners.push(listener);
  }

  async triggerPlaybackFinished(guildId: string): Promise<void> {
    await Promise.all(this.listeners.map(async (listener) => listener(guildId)));
  }
}

function createTrack(id: string): Track {
  return {
    id: `youtube:${id}`,
    provider: "youtube",
    providerTrackId: id,
    title: `Track ${id}`,
    artist: "Example Channel",
    pageUrl: `https://www.youtube.com/watch?v=${id}`,
  };
}

function createService(
  options: {
    relatedCatalog?: MusicCatalogPort;
    playlistCatalog?: MusicCatalogPort;
  } = {},
): {
  service: PlaybackQueueService;
  voiceGateway: FakeVoiceGateway;
  streamResolver: FakeStreamResolver;
  settingsRepository: InMemoryGuildPlaybackSettingsRepository;
  queueRepository: InMemoryGuildQueueRepository;
} {
  const voiceGateway = new FakeVoiceGateway();
  const streamResolver = new FakeStreamResolver();
  const settingsRepository = new InMemoryGuildPlaybackSettingsRepository();
  const queueRepository = new InMemoryGuildQueueRepository();
  const service = new PlaybackQueueService(
    queueRepository,
    streamResolver,
    voiceGateway,
    (() => {
      let counter = 0;
      return () => `queue-item-${++counter}`;
    })(),
    () => 1_700_000_000_000,
    {
      relatedCatalog:
        options.relatedCatalog ?? new FakeMusicCatalog([createTrack("related")]),
      playlistCatalog: options.playlistCatalog,
      settingsRepository,
    },
  );

  return {
    service,
    voiceGateway,
    streamResolver,
    settingsRepository,
    queueRepository,
  };
}

describe("PlaybackQueueService", () => {
  it("starts playback when enqueueing while idle", async () => {
    const { service, voiceGateway } = createService();

    const result = await service.enqueue({
      guildId: "guild-a",
      track: createTrack("a"),
    });

    expect(result.startedPlayback).toBe(true);
    expect(result.queuePosition).toBe(0);
    expect(result.queue.current?.track.title).toBe("Track a");
    expect(result.queue.upcoming).toHaveLength(0);
    expect(voiceGateway.playCalls).toHaveLength(1);
    expect(voiceGateway.playCalls[0].title).toBe("Track a");
  });

  it("does not interrupt current playback when enqueueing while already playing", async () => {
    const { service, voiceGateway } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    const second = await service.enqueue({
      guildId: "guild-a",
      track: createTrack("b"),
    });

    expect(second.startedPlayback).toBe(false);
    expect(second.queuePosition).toBe(1);
    expect(second.queue.current?.track.title).toBe("Track a");
    expect(second.queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track b",
    ]);
    expect(voiceGateway.playCalls).toHaveLength(1);
  });

  it("queues play requests while already playing without interrupting current playback", async () => {
    const { service, streamResolver, voiceGateway } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("b") });

    const result = await service.playNow({
      guildId: "guild-a",
      source: createTrack("now"),
    });

    expect(result.startedPlayback).toBe(false);
    expect(result.queuePosition).toBe(2);
    expect(result.queue.current?.track.title).toBe("Track a");
    expect(result.queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track b",
      "Track now",
    ]);
    expect(streamResolver.describeInputs).toHaveLength(0);
    expect(streamResolver.resolveInputs).toHaveLength(1);
    expect(voiceGateway.playCalls.map((call) => call.title)).toEqual([
      "Track a",
    ]);
  });

  it("does not resolve busy play requests immediately", async () => {
    const { service, streamResolver } = createService();
    const failingTrack = createTrack("now");

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("b") });
    streamResolver.failedTrackIds.add(failingTrack.id);

    const result = await service.playNow({
      guildId: "guild-a",
      source: failingTrack,
    });

    const queue = await service.getQueue("guild-a");
    expect(result.startedPlayback).toBe(false);
    expect(queue.current?.track.title).toBe("Track a");
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track b",
      "Track now",
    ]);
    expect(streamResolver.describeInputs).toHaveLength(0);
    expect(streamResolver.resolveInputs).toHaveLength(1);
  });

  it("rolls back an idle enqueue when playback fails", async () => {
    const { service, voiceGateway } = createService();
    voiceGateway.failNextPlay = true;

    await expect(
      service.enqueue({ guildId: "guild-a", track: createTrack("a") }),
    ).rejects.toThrow("Cannot play Track a");

    const queue = await service.getQueue("guild-a");
    expect(queue.current).toBeUndefined();
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track a",
    ]);
  });

  it("rolls back an idle enqueue when source resolution fails", async () => {
    const { service, streamResolver } = createService();
    const track = createTrack("a");
    streamResolver.failedTrackIds.add(track.id);

    await expect(
      service.enqueue({ guildId: "guild-a", track }),
    ).rejects.toThrow("Cannot resolve Track a");

    const queue = await service.getQueue("guild-a");
    expect(queue.current).toBeUndefined();
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track a",
    ]);
  });

  it("preserves queue order while advancing through tracks", async () => {
    const { service, voiceGateway } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("b") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("c") });

    const firstAdvance = await service.advanceAfterCurrent("guild-a");
    const secondAdvance = await service.advanceAfterCurrent("guild-a");

    expect(firstAdvance.nextItem?.track.title).toBe("Track b");
    expect(secondAdvance.nextItem?.track.title).toBe("Track c");
    expect(voiceGateway.playCalls.map((call) => call.title)).toEqual([
      "Track a",
      "Track b",
      "Track c",
    ]);
  });

  it("can autoplay the next track from a playback-finished callback", async () => {
    const { service, voiceGateway } = createService();
    voiceGateway.onPlaybackFinished((guildId) =>
      service.advanceAfterCurrent(guildId),
    );

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("b") });
    await voiceGateway.triggerPlaybackFinished("guild-a");

    const queue = await service.getQueue("guild-a");

    expect(queue.current?.track.title).toBe("Track b");
    expect(voiceGateway.playCalls.map((call) => call.title)).toEqual([
      "Track a",
      "Track b",
    ]);
  });

  it("can autoplay a queued /play source from a playback-finished callback", async () => {
    const { service, streamResolver, voiceGateway } = createService();
    const queuedSource = "https://www.youtube.com/watch?v=queued";
    voiceGateway.onPlaybackFinished((guildId) =>
      service.advanceAfterCurrent(guildId),
    );

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    await service.playNow({
      guildId: "guild-a",
      source: queuedSource,
    });
    await voiceGateway.triggerPlaybackFinished("guild-a");

    const queue = await service.getQueue("guild-a");

    expect(queue.current?.track.title).toBe(queuedSource);
    expect(streamResolver.describeInputs).toEqual([queuedSource]);
    expect(streamResolver.resolveInputs).toHaveLength(2);
    expect(streamResolver.resolveInputs[1]).toBe(queuedSource);
    expect(voiceGateway.playCalls.map((call) => call.title)).toEqual([
      "Track a",
      queuedSource,
    ]);
  });

  it("starts the first playlist item and queues the rest when /play receives a playlist link while idle", async () => {
    const playlistUrl =
      "https://www.youtube.com/playlist?list=PL-orchestra-voice";
    const playlistTracks = [
      createTrack("playlist-a"),
      createTrack("playlist-b"),
      createTrack("playlist-c"),
    ];
    const playlistCatalog = new FakePlaylistCatalog(
      new Map([
        [
          playlistUrl,
          {
            title: "Study playlist",
            sourceUrl: playlistUrl,
            tracks: playlistTracks,
          },
        ],
      ]),
    );
    const { service, streamResolver, voiceGateway } = createService({
      playlistCatalog,
    });

    const result = await service.playNow({
      guildId: "guild-a",
      source: playlistUrl,
    });

    expect(result.playlist?.trackCount).toBe(playlistTracks.length);
    expect(result.startedPlayback).toBe(true);
    expect(result.item.track.title).toBe("Track playlist-a");
    expect(result.queue.current?.track.title).toBe("Track playlist-a");
    expect(result.queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track playlist-b",
      "Track playlist-c",
    ]);
    expect(streamResolver.resolveInputs).toEqual([playlistTracks[0]]);
    expect(voiceGateway.playCalls.map((call) => call.title)).toEqual([
      "Track playlist-a",
    ]);
  });

  it("queues every playlist item without interrupting current playback", async () => {
    const playlistUrl =
      "https://www.youtube.com/playlist?list=PL-orchestra-voice";
    const playlistTracks = [
      createTrack("playlist-a"),
      createTrack("playlist-b"),
    ];
    const playlistCatalog = new FakePlaylistCatalog(
      new Map([
        [
          playlistUrl,
          {
            title: "Study playlist",
            sourceUrl: playlistUrl,
            tracks: playlistTracks,
          },
        ],
      ]),
    );
    const { service, streamResolver, voiceGateway } = createService({
      playlistCatalog,
    });

    await service.enqueue({ guildId: "guild-a", track: createTrack("current") });
    const result = await service.playNow({
      guildId: "guild-a",
      source: playlistUrl,
    });

    expect(result.startedPlayback).toBe(false);
    expect(result.playlist?.trackCount).toBe(playlistTracks.length);
    expect(result.queue.current?.track.title).toBe("Track current");
    expect(result.queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track playlist-a",
      "Track playlist-b",
    ]);
    expect(streamResolver.resolveInputs).toEqual([createTrack("current")]);
    expect(voiceGateway.playCalls.map((call) => call.title)).toEqual([
      "Track current",
    ]);
  });

  it("iterates every queued playlist item as playback finishes", async () => {
    const playlistUrl =
      "https://www.youtube.com/playlist?list=PL-orchestra-voice";
    const playlistTracks = [
      createTrack("playlist-a"),
      createTrack("playlist-b"),
      createTrack("playlist-c"),
      createTrack("playlist-d"),
    ];
    const playlistCatalog = new FakePlaylistCatalog(
      new Map([
        [
          playlistUrl,
          {
            title: "Study playlist",
            sourceUrl: playlistUrl,
            tracks: playlistTracks,
          },
        ],
      ]),
    );
    const { service, voiceGateway } = createService({ playlistCatalog });
    voiceGateway.onPlaybackFinished((guildId) =>
      service.advanceAfterCurrent(guildId),
    );

    await service.playNow({
      guildId: "guild-a",
      source: playlistUrl,
    });

    for (const expectedTrack of playlistTracks.slice(1)) {
      await voiceGateway.triggerPlaybackFinished("guild-a");
      const queue = await service.getQueue("guild-a");

      expect(queue.current?.track.title).toBe(expectedTrack.title);
    }

    const queue = await service.getQueue("guild-a");
    expect(queue.upcoming).toHaveLength(0);
    expect(voiceGateway.playCalls.map((call) => call.title)).toEqual(
      playlistTracks.map((track) => track.title),
    );
  });

  it("replays the current item when current-track loop is enabled", async () => {
    const { service, voiceGateway } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("b") });

    const loopResult = await service.toggleCurrentLoop("guild-a");
    const advanceResult = await service.advanceAfterCurrent("guild-a");

    expect(loopResult.loopCurrent).toBe(true);
    expect(advanceResult.nextItem?.track.title).toBe("Track a");
    expect(advanceResult.queue.loopCurrent).toBe(true);
    expect(advanceResult.queue.current?.track.title).toBe("Track a");
    expect(advanceResult.queue.upcoming.map((item) => item.track.title)).toEqual(
      ["Track b"],
    );
    expect(voiceGateway.playCalls.map((call) => call.title)).toEqual([
      "Track a",
      "Track a",
    ]);
  });

  it("turns off current-track loop when toggled again", async () => {
    const { service, voiceGateway } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("b") });

    await service.toggleCurrentLoop("guild-a");
    const loopOffResult = await service.toggleCurrentLoop("guild-a");
    const advanceResult = await service.advanceAfterCurrent("guild-a");

    expect(loopOffResult.loopCurrent).toBe(false);
    expect(advanceResult.queue.loopCurrent).toBe(false);
    expect(advanceResult.queue.current?.track.title).toBe("Track b");
    expect(voiceGateway.playCalls.map((call) => call.title)).toEqual([
      "Track a",
      "Track b",
    ]);
  });

  it("rejects current-track loop when nothing is playing", async () => {
    const { service } = createService();

    await expect(service.toggleCurrentLoop("guild-a")).rejects.toThrow(
      "There is nothing playing to loop.",
    );
  });

  it("skips the current item and starts the next item", async () => {
    const { service, voiceGateway } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("b") });

    const result = await service.skip("guild-a");

    expect(result.nextItem?.track.title).toBe("Track b");
    expect(result.queue.current?.track.title).toBe("Track b");
    expect(voiceGateway.playCalls.map((call) => call.title)).toEqual([
      "Track a",
      "Track b",
    ]);
  });

  it("reuses the original /play source when skip advances to the queued item", async () => {
    const { service, streamResolver, voiceGateway } = createService();
    const queuedSource = "spotify:track:1234567890123456789012";

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    await service.playNow({
      guildId: "guild-a",
      source: queuedSource,
    });

    const result = await service.skip("guild-a");

    expect(result.nextItem?.track.title).toBe(queuedSource);
    expect(streamResolver.describeInputs).toEqual([queuedSource]);
    expect(streamResolver.resolveInputs).toHaveLength(2);
    expect(streamResolver.resolveInputs[1]).toBe(queuedSource);
    expect(voiceGateway.playCalls.map((call) => call.title)).toEqual([
      "Track a",
      queuedSource,
    ]);
  });

  it("rolls back the next item when skip playback fails", async () => {
    const { service, voiceGateway } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("b") });
    voiceGateway.failNextPlay = true;

    await expect(service.skip("guild-a")).rejects.toThrow("Cannot play Track b");

    const queue = await service.getQueue("guild-a");
    expect(queue.current).toBeUndefined();
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track b",
    ]);
  });

  it("rolls back the next item when skip source resolution fails", async () => {
    const { service, streamResolver } = createService();
    const nextTrack = createTrack("b");

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    await service.enqueue({ guildId: "guild-a", track: nextTrack });
    streamResolver.failedTrackIds.add(nextTrack.id);

    await expect(service.skip("guild-a")).rejects.toThrow(
      "Cannot resolve Track b",
    );

    const queue = await service.getQueue("guild-a");
    expect(queue.current).toBeUndefined();
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track b",
    ]);
  });

  it("rolls back the next item when natural advance playback fails", async () => {
    const { service, voiceGateway } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("b") });
    voiceGateway.failNextPlay = true;

    await expect(service.advanceAfterCurrent("guild-a")).rejects.toThrow(
      "Cannot play Track b",
    );

    const queue = await service.getQueue("guild-a");
    expect(queue.current).toBeUndefined();
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track b",
    ]);
  });

  it("stops playback when skipping the only current item", async () => {
    const { service, voiceGateway } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    const result = await service.skip("guild-a");

    expect(result.nextItem).toBeUndefined();
    expect(result.queue.current).toBeUndefined();
    expect(result.queue.status).toBe("idle");
    expect(voiceGateway.stopCalls).toEqual(["guild-a"]);
  });

  it("rejects skip when nothing is playing", async () => {
    const { service } = createService();

    await expect(service.skip("guild-a")).rejects.toThrow(
      "There is nothing to skip.",
    );
  });

  it("clears upcoming items without interrupting the current item", async () => {
    const { service } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("b") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("c") });

    const result = await service.clearUpcoming("guild-a");

    expect(result.removedCount).toBe(2);
    expect(result.queue.current?.track.title).toBe("Track a");
    expect(result.queue.upcoming).toHaveLength(0);
  });

  it("removes a valid upcoming queue item", async () => {
    const { service } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("b") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("c") });

    const result = await service.removeUpcoming("guild-a", 1);

    expect(result.removedItem.track.title).toBe("Track b");
    expect(result.queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track c",
    ]);
  });

  it("rejects an invalid remove position", async () => {
    const { service } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });

    await expect(service.removeUpcoming("guild-a", 1)).rejects.toThrow(
      "Queue position must be between 1 and 0.",
    );
  });

  it("keeps queues scoped per guild", async () => {
    const { service } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    await service.enqueue({ guildId: "guild-b", track: createTrack("b") });

    const guildAQueue = await service.getQueue("guild-a");
    const guildBQueue = await service.getQueue("guild-b");

    expect(guildAQueue.current?.track.title).toBe("Track a");
    expect(guildBQueue.current?.track.title).toBe("Track b");
  });

  it("does not start related autoplay when autoplay is disabled", async () => {
    const { service, voiceGateway } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });

    const result = await service.advanceAfterCurrent("guild-a");

    expect(result.autoplayStarted).toBe(false);
    expect(result.nextItem).toBeUndefined();
    expect(voiceGateway.playCalls.map((call) => call.title)).toEqual([
      "Track a",
    ]);
  });

  it("leaves voice idle without another play call when handleTrackFinished exhausts the queue with queue-loop off", async () => {
    const { service, voiceGateway } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });

    const result = await service.handleTrackFinished("guild-a");

    expect(result.nextItem).toBeUndefined();
    expect(result.queue.current).toBeUndefined();
    expect(result.queue.status).toBe("idle");
    expect(voiceGateway.playCalls.map((call) => call.title)).toEqual([
      "Track a",
    ]);
  });

  it("plays item 1 when handleTrackFinished reaches the last item with queue-loop on", async () => {
    const { service, voiceGateway, queueRepository } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("b") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("c") });
    const queue = await queueRepository.getByGuildId("guild-a");
    queue.toggleQueueLoop();
    await queueRepository.save(queue);

    await service.handleTrackFinished("guild-a");
    await service.handleTrackFinished("guild-a");
    const result = await service.handleTrackFinished("guild-a");

    expect(result.nextItem?.track.title).toBe("Track a");
    expect(result.queue.current?.track.title).toBe("Track a");
    expect(voiceGateway.playCalls.map((call) => call.title)).toEqual([
      "Track a",
      "Track b",
      "Track c",
      "Track a",
    ]);
  });

  it("preserves queue order after handleTrackFinished wraps with queue-loop on", async () => {
    const { service, queueRepository } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("b") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("c") });
    const queue = await queueRepository.getByGuildId("guild-a");
    queue.toggleQueueLoop();
    await queueRepository.save(queue);

    await service.handleTrackFinished("guild-a");
    await service.handleTrackFinished("guild-a");
    const result = await service.handleTrackFinished("guild-a");

    expect(result.queue.current?.track.title).toBe("Track a");
    expect(result.queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track b",
      "Track c",
    ]);
  });

  it("replays the same item when track-loop and queue-loop are both on", async () => {
    const { service, voiceGateway, queueRepository } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("b") });
    const queue = await queueRepository.getByGuildId("guild-a");
    queue.toggleQueueLoop();
    await queueRepository.save(queue);
    await service.toggleCurrentLoop("guild-a");

    const result = await service.handleTrackFinished("guild-a");

    expect(result.nextItem?.track.title).toBe("Track a");
    expect(result.queue.current?.track.title).toBe("Track a");
    expect(result.queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track b",
    ]);
    expect(voiceGateway.playCalls.map((call) => call.title)).toEqual([
      "Track a",
      "Track a",
    ]);
  });

  it("rolls back the wrapped item on resolver failure without clearing queue-loop", async () => {
    const { service, streamResolver, queueRepository } = createService();
    const firstTrack = createTrack("a");

    await service.enqueue({ guildId: "guild-a", track: firstTrack });
    await service.enqueue({ guildId: "guild-a", track: createTrack("b") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("c") });
    const queue = await queueRepository.getByGuildId("guild-a");
    queue.toggleQueueLoop();
    await queueRepository.save(queue);
    await service.handleTrackFinished("guild-a");
    await service.handleTrackFinished("guild-a");
    streamResolver.failedTrackIds.add(firstTrack.id);

    await expect(service.handleTrackFinished("guild-a")).rejects.toThrow(
      "Cannot resolve Track a",
    );

    const rolledBackQueue = await service.getQueue("guild-a");
    expect(rolledBackQueue.current).toBeUndefined();
    expect(rolledBackQueue.upcoming.map((item) => item.track.title)).toEqual([
      "Track a",
      "Track b",
      "Track c",
    ]);
    expect(rolledBackQueue.queueLoop).toBe(true);
  });

  it("does not automatically retry after a queue-loop rollback", async () => {
    const { service, streamResolver, queueRepository } = createService();
    const firstTrack = createTrack("a");

    await service.enqueue({ guildId: "guild-a", track: firstTrack });
    await service.enqueue({ guildId: "guild-a", track: createTrack("b") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("c") });
    const queue = await queueRepository.getByGuildId("guild-a");
    queue.toggleQueueLoop();
    await queueRepository.save(queue);
    await service.handleTrackFinished("guild-a");
    await service.handleTrackFinished("guild-a");
    streamResolver.failedTrackIds.add(firstTrack.id);
    await expect(service.handleTrackFinished("guild-a")).rejects.toThrow(
      "Cannot resolve Track a",
    );
    const resolveCountAfterRollback = streamResolver.resolveInputs.length;

    const idleResult = await service.handleTrackFinished("guild-a");

    expect(idleResult.autoplayStatus).toBe("not-needed");
    expect(idleResult.nextItem).toBeUndefined();
    expect(streamResolver.resolveInputs).toHaveLength(resolveCountAfterRollback);
  });

  it("starts a related track when related autoplay is enabled and queue is empty", async () => {
    const { service, voiceGateway, settingsRepository } = createService();
    const settings = await settingsRepository.getByGuildId("guild-a");
    settings.enableRelatedAutoplay();
    await settingsRepository.save(settings);

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });

    const result = await service.advanceAfterCurrent("guild-a");

    expect(result.autoplayStarted).toBe(true);
    expect(result.nextItem?.track.title).toBe("Track related");
    expect(voiceGateway.playCalls.map((call) => call.title)).toEqual([
      "Track a",
      "Track related",
    ]);
  });

  it("stops related autoplay cleanly when providers are unavailable", async () => {
    const failedStatus: ProviderSearchStatus = {
      provider: "youtube",
      status: "failed",
      failure: {
        provider: "youtube",
        reason: "quota-exceeded",
        operation: "search",
        message: "YouTube search quota is exhausted.",
        retryable: true,
      },
    };
    const relatedCatalog = new DetailedFakeMusicCatalog({
      tracks: [],
      providerStatuses: [failedStatus],
    });
    const { service, voiceGateway, settingsRepository } = createService({
      relatedCatalog,
    });
    const settings = await settingsRepository.getByGuildId("guild-a");
    settings.enableRelatedAutoplay();
    await settingsRepository.save(settings);

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });

    const result = await service.advanceAfterCurrent("guild-a");

    expect(result.autoplayStarted).toBe(false);
    expect(result.autoplayStatus).toBe("provider-unavailable");
    expect(result.providerStatuses).toEqual([failedStatus]);
    expect(result.queue.current).toBeUndefined();
    expect(result.queue.upcoming).toHaveLength(0);
    expect(voiceGateway.playCalls.map((call) => call.title)).toEqual([
      "Track a",
    ]);

    const repeatedIdle = await service.advanceAfterCurrent("guild-a");

    expect(repeatedIdle.autoplayStatus).toBe("not-needed");
    expect(relatedCatalog.searchCalls).toBe(1);
  });

  it("distinguishes related autoplay no-candidate from provider failure", async () => {
    const fulfilledStatus: ProviderSearchStatus = {
      provider: "youtube",
      status: "fulfilled",
      resultCount: 0,
    };
    const { service, settingsRepository } = createService({
      relatedCatalog: new DetailedFakeMusicCatalog({
        tracks: [],
        providerStatuses: [fulfilledStatus],
      }),
    });
    const settings = await settingsRepository.getByGuildId("guild-a");
    settings.enableRelatedAutoplay();
    await settingsRepository.save(settings);

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });

    const result = await service.advanceAfterCurrent("guild-a");

    expect(result.autoplayStarted).toBe(false);
    expect(result.autoplayStatus).toBe("no-candidate");
    expect(result.providerStatuses).toEqual([fulfilledStatus]);
  });

  it("distinguishes related autoplay provider cooldown from no-candidate", async () => {
    const cooldownStatus: ProviderSearchStatus = {
      provider: "spotify",
      status: "skipped",
      reason: "cooldown",
      failureReason: "account-restricted",
      retryAfterMs: 60_000,
      message: "Spotify search is on cooldown.",
    };
    const { service, settingsRepository } = createService({
      relatedCatalog: new DetailedFakeMusicCatalog({
        tracks: [],
        providerStatuses: [cooldownStatus],
      }),
    });
    const settings = await settingsRepository.getByGuildId("guild-a");
    settings.enableRelatedAutoplay();
    await settingsRepository.save(settings);

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });

    const result = await service.advanceAfterCurrent("guild-a");

    expect(result.autoplayStarted).toBe(false);
    expect(result.autoplayStatus).toBe("provider-on-cooldown");
    expect(result.providerStatuses).toEqual([cooldownStatus]);
  });

  it("treats unresolved related suggestions as metadata-only without queueing them", async () => {
    const relatedTrack = createTrack("related");
    const relatedCatalog = new FakeMusicCatalog([relatedTrack]);
    const { service, voiceGateway, streamResolver, settingsRepository } =
      createService({ relatedCatalog });
    const settings = await settingsRepository.getByGuildId("guild-a");
    settings.enableRelatedAutoplay();
    await settingsRepository.save(settings);
    streamResolver.failedTrackIds.add(relatedTrack.id);

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });

    const result = await service.advanceAfterCurrent("guild-a");

    expect(result.autoplayStarted).toBe(false);
    expect(result.autoplayStatus).toBe("metadata-only");
    expect(result.relatedCandidate?.title).toBe("Track related");
    expect(result.queue.current).toBeUndefined();
    expect(result.queue.upcoming).toHaveLength(0);
    expect(voiceGateway.playCalls.map((call) => call.title)).toEqual([
      "Track a",
    ]);

    const repeatedIdle = await service.advanceAfterCurrent("guild-a");

    expect(repeatedIdle.autoplayStatus).toBe("not-needed");
    expect(relatedCatalog.searchCalls).toBe(1);
  });

  it("shuffles the upcoming queue and saves state to the repository", async () => {
    const { service, queueRepository } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("b") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("c") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("d") });

    const reverseShuffler = (items: import("../../src/domain/entities/GuildQueue").QueueItem[]) =>
      [...items].reverse();
    const result = await service.shuffleUpcoming("guild-a", reverseShuffler);

    expect(result.shuffledCount).toBe(3);
    expect(result.queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track d",
      "Track c",
      "Track b",
    ]);
    expect(result.queue.current?.track.title).toBe("Track a");

    const persisted = await queueRepository.getByGuildId("guild-a");
    expect(persisted.upcoming.map((item) => item.track.title)).toEqual([
      "Track d",
      "Track c",
      "Track b",
    ]);
  });

  it("shuffleUpcoming is a no-op when there are no upcoming items", async () => {
    const { service } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });

    const result = await service.shuffleUpcoming("guild-a");

    expect(result.shuffledCount).toBe(0);
    expect(result.queue.current?.track.title).toBe("Track a");
    expect(result.queue.upcoming).toHaveLength(0);
  });

  it("shuffleUpcoming is a no-op on an idle queue", async () => {
    const { service } = createService();

    const result = await service.shuffleUpcoming("guild-a");

    expect(result.shuffledCount).toBe(0);
    expect(result.queue.current).toBeUndefined();
    expect(result.queue.upcoming).toHaveLength(0);
  });
});

describe("PlaybackQueueService moveUpcoming", () => {
  it("moves an upcoming item from one position to another", async () => {
    const { service } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("b") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("c") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("d") });

    const result = await service.moveUpcoming("guild-a", 3, 1);

    expect(result.movedItem.track.title).toBe("Track d");
    expect(result.queue.upcoming.map((i) => i.track.title)).toEqual([
      "Track d",
      "Track b",
      "Track c",
    ]);
  });

  it("returns the moved item and the updated queue", async () => {
    const { service } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("b") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("c") });

    const result = await service.moveUpcoming("guild-a", 1, 2);

    expect(result.movedItem.track.title).toBe("Track b");
    expect(result.queue.upcoming.map((i) => i.track.title)).toEqual([
      "Track c",
      "Track b",
    ]);
  });

  it("rejects an invalid from position", async () => {
    const { service } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });

    await expect(service.moveUpcoming("guild-a", 0, 1)).rejects.toThrow(
      "Queue position must be 1 or higher.",
    );
  });

  it("rejects an out-of-range to position", async () => {
    const { service } = createService();

    await service.enqueue({ guildId: "guild-a", track: createTrack("a") });
    await service.enqueue({ guildId: "guild-a", track: createTrack("b") });

    await expect(service.moveUpcoming("guild-a", 1, 5)).rejects.toThrow(
      "Queue position must be between 1 and 1.",
    );
  });
});

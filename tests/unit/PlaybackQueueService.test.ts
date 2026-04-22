import { describe, expect, it } from "vitest";
import type { DiscordGatewayAdapterCreator } from "@discordjs/voice";
import { PlaybackQueueService } from "../../src/application/services/PlaybackQueueService";
import type { ResolvedAudioSource, StreamResolverPort } from "../../src/application/ports/outbound/StreamResolverPort";
import type {
  JoinVoiceRequest,
  PlayAudioRequest,
  VoiceGatewayPort,
} from "../../src/application/ports/outbound/VoiceGatewayPort";
import { InMemoryGuildQueueRepository } from "../../src/infrastructure/persistence/memory/InMemoryGuildQueueRepository";
import type { Track } from "../../src/domain/entities/Track";

class FakeStreamResolver implements StreamResolverPort {
  async resolve(source: string | Track): Promise<ResolvedAudioSource> {
    const title = typeof source === "string" ? source : source.title;

    return {
      title,
      sourceUrl: typeof source === "string" ? source : source.pageUrl,
      url: `https://audio.example/${encodeURIComponent(title)}.mp3`,
    };
  }
}

class FakeVoiceGateway implements VoiceGatewayPort {
  readonly playCalls: PlayAudioRequest[] = [];
  readonly stopCalls: string[] = [];
  readonly pauseCalls: string[] = [];
  readonly resumeCalls: string[] = [];
  private readonly listeners: Array<(guildId: string) => void | Promise<void>> =
    [];

  async join(_request: JoinVoiceRequest): Promise<void> {}

  async play(request: PlayAudioRequest): Promise<void> {
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

function createService(): {
  service: PlaybackQueueService;
  voiceGateway: FakeVoiceGateway;
} {
  const voiceGateway = new FakeVoiceGateway();
  const service = new PlaybackQueueService(
    new InMemoryGuildQueueRepository(),
    new FakeStreamResolver(),
    voiceGateway,
    (() => {
      let counter = 0;
      return () => `queue-item-${++counter}`;
    })(),
    () => 1_700_000_000_000,
  );

  return { service, voiceGateway };
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
});

const _adapterCreator: DiscordGatewayAdapterCreator = () => ({
  destroy: () => undefined,
  sendPayload: () => false,
});

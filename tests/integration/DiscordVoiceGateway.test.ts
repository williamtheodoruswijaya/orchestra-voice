import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadGatewayWithMocks(options: {
  emitsIdleOnReplace: boolean;
}): Promise<{
  DiscordVoiceGateway: typeof import("../../src/infrastructure/voice/DiscordVoiceGateway").DiscordVoiceGateway;
  mockState: {
    players: any[];
    connections: Map<string, any>;
  };
}> {
  const mockState = {
    players: [] as any[],
    connections: new Map<string, any>(),
  };
  const AudioPlayerStatus = {
    Idle: "idle",
    Playing: "playing",
    Paused: "paused",
  };
  const VoiceConnectionStatus = {
    Ready: "ready",
  };

  vi.doMock("@discordjs/voice", () => {
    class MockAudioPlayer extends EventEmitter {
      state = { status: AudioPlayerStatus.Idle };

      play(_resource: unknown): void {
        if (
          this.state.status !== AudioPlayerStatus.Idle &&
          options.emitsIdleOnReplace
        ) {
          this.state.status = AudioPlayerStatus.Idle;
          this.emit(AudioPlayerStatus.Idle);
        }

        this.state.status = AudioPlayerStatus.Playing;
        this.emit(AudioPlayerStatus.Playing);
      }

      stop(): void {
        if (this.state.status === AudioPlayerStatus.Idle) {
          return;
        }

        this.state.status = AudioPlayerStatus.Idle;
        this.emit(AudioPlayerStatus.Idle);
      }

      pause(): boolean {
        this.state.status = AudioPlayerStatus.Paused;
        return true;
      }

      unpause(): boolean {
        this.state.status = AudioPlayerStatus.Playing;
        return true;
      }

      finishNaturally(): void {
        this.state.status = AudioPlayerStatus.Idle;
        this.emit(AudioPlayerStatus.Idle);
      }
    }

    class MockVoiceConnection {
      readonly joinConfig: { channelId: string };
      readonly state = { status: VoiceConnectionStatus.Ready };
      readonly subscribe = vi.fn();
      readonly destroy = vi.fn();
      readonly on = vi.fn();

      constructor(
        readonly guildId: string,
        channelId: string,
      ) {
        this.joinConfig = { channelId };
        this.destroy.mockImplementation(() => {
          mockState.connections.delete(this.guildId);
        });
      }
    }

    return {
      AudioPlayerStatus,
      NoSubscriberBehavior: {
        Pause: "pause",
      },
      StreamType: {
        Arbitrary: "arbitrary",
      },
      VoiceConnectionStatus,
      createAudioPlayer: vi.fn(() => {
        const player = new MockAudioPlayer();
        mockState.players.push(player);
        return player;
      }),
      createAudioResource: vi.fn((input: unknown, config: unknown) => ({
        input,
        config,
      })),
      entersState: vi.fn(async (target: any, status: string) => {
        if (target.state?.status !== status) {
          throw new Error(`Target did not reach ${status}.`);
        }

        return target;
      }),
      getVoiceConnection: vi.fn((guildId: string) =>
        mockState.connections.get(guildId),
      ),
      joinVoiceChannel: vi.fn((request: any) => {
        const connection = new MockVoiceConnection(
          request.guildId,
          request.channelId,
        );
        mockState.connections.set(request.guildId, connection);
        return connection;
      }),
    };
  });

  const module = await import(
    "../../src/infrastructure/voice/DiscordVoiceGateway"
  );

  return {
    DiscordVoiceGateway: module.DiscordVoiceGateway,
    mockState,
  };
}

describe("DiscordVoiceGateway integration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("suppresses replace-induced idle events so explicit transitions do not look like track finishes", async () => {
    const { DiscordVoiceGateway } = await loadGatewayWithMocks({
      emitsIdleOnReplace: true,
    });
    const gateway = new DiscordVoiceGateway();
    const finishedGuilds: string[] = [];

    gateway.onPlaybackFinished((guildId) => {
      finishedGuilds.push(guildId);
    });

    await gateway.join({
      guildId: "guild-a",
      channelId: "voice-a",
      adapterCreator: {} as never,
    });
    await gateway.play({
      guildId: "guild-a",
      title: "Track one",
      url: "https://audio.example/one.mp3",
    });
    await gateway.play({
      guildId: "guild-a",
      title: "Track two",
      url: "https://audio.example/two.mp3",
    });

    expect(finishedGuilds).toEqual([]);
  });

  it("still notifies natural finishes after a replacement that did not emit idle", async () => {
    const { DiscordVoiceGateway, mockState } = await loadGatewayWithMocks({
      emitsIdleOnReplace: false,
    });
    const gateway = new DiscordVoiceGateway();
    const finishedGuilds: string[] = [];

    gateway.onPlaybackFinished((guildId) => {
      finishedGuilds.push(guildId);
    });

    await gateway.join({
      guildId: "guild-a",
      channelId: "voice-a",
      adapterCreator: {} as never,
    });
    await gateway.play({
      guildId: "guild-a",
      title: "Track one",
      url: "https://audio.example/one.mp3",
    });
    await gateway.play({
      guildId: "guild-a",
      title: "Track two",
      url: "https://audio.example/two.mp3",
    });

    mockState.players[0].finishNaturally();

    expect(finishedGuilds).toEqual(["guild-a"]);
  });
});

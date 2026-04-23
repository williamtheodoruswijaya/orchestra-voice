import { describe, expect, it } from "vitest";
import { GuildPlaybackSettingsService } from "../../src/application/services/GuildPlaybackSettingsService";
import { PlaybackQueueService } from "../../src/application/services/PlaybackQueueService";
import type {
  AudioSourceDescriptor,
  ResolvedAudioSource,
  StreamResolverPort,
} from "../../src/application/ports/outbound/StreamResolverPort";
import type { MusicCatalogPort } from "../../src/application/ports/outbound/MusicCatalogPort";
import type {
  JoinVoiceRequest,
  PlayAudioRequest,
  VoiceGatewayPort,
} from "../../src/application/ports/outbound/VoiceGatewayPort";
import { ClearQueue } from "../../src/application/use-cases/ClearQueue";
import { EnqueueTrack } from "../../src/application/use-cases/EnqueueTrack";
import { GetNowPlaying } from "../../src/application/use-cases/GetNowPlaying";
import { GetPlaybackSettings } from "../../src/application/use-cases/GetPlaybackSettings";
import { GetQueue } from "../../src/application/use-cases/GetQueue";
import { GetSelectedTrack } from "../../src/application/use-cases/GetSelectedTrack";
import { JoinVoiceChannel } from "../../src/application/use-cases/JoinVoiceChannel";
import { LeaveVoiceChannel } from "../../src/application/use-cases/LeaveVoiceChannel";
import { PausePlayback } from "../../src/application/use-cases/PausePlayback";
import { PickTrack } from "../../src/application/use-cases/PickTrack";
import { PlayNextTrack } from "../../src/application/use-cases/PlayNextTrack";
import { PlayNowTrack } from "../../src/application/use-cases/PlayNowTrack";
import { RemoveQueueItem } from "../../src/application/use-cases/RemoveQueueItem";
import { ResumePlayback } from "../../src/application/use-cases/ResumePlayback";
import { SaveSearchResults } from "../../src/application/use-cases/SaveSearchResults";
import { SearchTracks } from "../../src/application/use-cases/SearchTracks";
import { SetAutoplayMode } from "../../src/application/use-cases/SetAutoplayMode";
import { SetPlaybackMood } from "../../src/application/use-cases/SetPlaybackMood";
import { SkipTrack } from "../../src/application/use-cases/SkipTrack";
import { StopPlayback } from "../../src/application/use-cases/StopPlayback";
import { InMemoryGuildPlaybackSettingsRepository } from "../../src/infrastructure/persistence/memory/InMemoryGuildPlaybackSettingsRepository";
import { InMemoryGuildQueueRepository } from "../../src/infrastructure/persistence/memory/InMemoryGuildQueueRepository";
import { InMemorySearchSessionRepository } from "../../src/infrastructure/persistence/memory/InMemorySearchSessionRepository";
import { DiscordInteractionHandler } from "../../src/infrastructure/discord/DiscordInteractionHandler";
import type { Track } from "../../src/domain/entities/Track";

interface SongFixture {
  source: string;
  title: string;
}

class EmptyMusicCatalog implements MusicCatalogPort {
  async search(): Promise<Track[]> {
    return [];
  }
}

class ScenarioStreamResolver implements StreamResolverPort {
  readonly describeCalls: string[] = [];
  readonly resolveCalls: string[] = [];

  constructor(private readonly fixtures: Map<string, SongFixture>) {}

  async describe(source: string | Track): Promise<AudioSourceDescriptor> {
    if (typeof source !== "string") {
      return {
        title: source.title,
        sourceUrl: source.pageUrl,
      };
    }

    this.describeCalls.push(source);
    const fixture = this.fixtures.get(source);

    return {
      title: fixture?.title ?? source,
      sourceUrl: fixture?.source ?? source,
    };
  }

  async resolve(source: string | Track): Promise<ResolvedAudioSource> {
    if (typeof source !== "string") {
      return {
        title: source.title,
        sourceUrl: source.pageUrl,
        url: `https://audio.example/${encodeURIComponent(source.title)}.mp3`,
      };
    }

    this.resolveCalls.push(source);
    const fixture = this.fixtures.get(source);
    const title = fixture?.title ?? source;

    return {
      title,
      sourceUrl: fixture?.source ?? source,
      url: `https://audio.example/${encodeURIComponent(title)}.mp3`,
    };
  }
}

class ScenarioVoiceGateway implements VoiceGatewayPort {
  readonly joinCalls: JoinVoiceRequest[] = [];
  readonly playCalls: PlayAudioRequest[] = [];
  readonly stopCalls: string[] = [];
  private readonly joinedChannels = new Map<string, string>();
  private readonly currentPlayback = new Map<string, PlayAudioRequest>();
  private readonly listeners: Array<(guildId: string) => void | Promise<void>> =
    [];

  async join(request: JoinVoiceRequest): Promise<void> {
    this.joinCalls.push(request);
    this.joinedChannels.set(request.guildId, request.channelId);
  }

  async play(request: PlayAudioRequest): Promise<void> {
    this.playCalls.push(request);
    this.currentPlayback.set(request.guildId, request);
  }

  async leave(guildId: string): Promise<void> {
    this.currentPlayback.delete(guildId);
    this.joinedChannels.delete(guildId);
  }

  async stop(guildId: string): Promise<void> {
    this.stopCalls.push(guildId);
    this.currentPlayback.delete(guildId);
  }

  async pause(): Promise<boolean> {
    return true;
  }

  async resume(): Promise<boolean> {
    return true;
  }

  onPlaybackFinished(
    listener: (guildId: string) => void | Promise<void>,
  ): void {
    this.listeners.push(listener);
  }

  getJoinedChannel(guildId: string): string | undefined {
    return this.joinedChannels.get(guildId);
  }

  getCurrentTitle(guildId: string): string | undefined {
    return this.currentPlayback.get(guildId)?.title;
  }

  async finishCurrentTrack(guildId: string): Promise<void> {
    this.currentPlayback.delete(guildId);
    await Promise.all(this.listeners.map(async (listener) => listener(guildId)));
  }
}

class FakeChatInputInteraction {
  deferred = false;
  replied = false;
  readonly guildId: string;
  readonly user = { id: "user-1" };
  readonly guild: any;
  readonly member: any;
  readonly options: {
    getString: (name: string) => string | null;
    getInteger: (name: string) => number | null;
  };
  private editPayload?: unknown;
  private replyPayload?: unknown;

  constructor(
    readonly commandName: string,
    guildId: string,
    guild: any,
    member: any,
    optionValues: Record<string, string | number | undefined> = {},
  ) {
    this.guildId = guildId;
    this.guild = guild;
    this.member = member;
    this.options = {
      getString: (name: string) => {
        const value = optionValues[name];
        return typeof value === "string" ? value : null;
      },
      getInteger: (name: string) => {
        const value = optionValues[name];
        return typeof value === "number" ? value : null;
      },
    };
  }

  isChatInputCommand(): boolean {
    return true;
  }

  inGuild(): boolean {
    return true;
  }

  isRepliable(): boolean {
    return true;
  }

  async deferReply(): Promise<void> {
    this.deferred = true;
  }

  async reply(payload: unknown): Promise<unknown> {
    this.replied = true;
    this.replyPayload = payload;
    return payload;
  }

  async editReply(payload: unknown): Promise<unknown> {
    this.replied = true;
    this.editPayload = payload;
    return payload;
  }

  getLatestPayload(): unknown {
    return this.editPayload ?? this.replyPayload;
  }
}

class PlaybackCommandHarness {
  readonly guildId = "guild-a";
  readonly voiceChannelId = "voice-a";
  readonly voiceChannelName = "Study Hall";
  readonly voiceGateway = new ScenarioVoiceGateway();
  readonly streamResolver: ScenarioStreamResolver;
  readonly playbackQueueService: PlaybackQueueService;
  readonly handler: DiscordInteractionHandler;
  readonly guild: any;
  readonly member: any;

  constructor(songFixtures: SongFixture[]) {
    const emptyCatalog = new EmptyMusicCatalog();
    const searchSessions = new InMemorySearchSessionRepository();
    const queueRepository = new InMemoryGuildQueueRepository();
    const settingsRepository = new InMemoryGuildPlaybackSettingsRepository();
    const settingsService = new GuildPlaybackSettingsService(settingsRepository);
    this.streamResolver = new ScenarioStreamResolver(
      new Map(songFixtures.map((fixture) => [fixture.source, fixture])),
    );
    this.playbackQueueService = new PlaybackQueueService(
      queueRepository,
      this.streamResolver,
      this.voiceGateway,
      undefined,
      undefined,
      {
        relatedCatalog: emptyCatalog,
        settingsRepository,
      },
    );

    const searchTracks = {
      all: new SearchTracks(emptyCatalog),
      youtube: new SearchTracks(emptyCatalog),
      spotify: new SearchTracks(emptyCatalog),
    };
    const playNextTrack = new PlayNextTrack(this.playbackQueueService);
    this.voiceGateway.onPlaybackFinished((guildId) =>
      playNextTrack.execute(guildId),
    );

    this.handler = new DiscordInteractionHandler({
      joinVoiceChannel: new JoinVoiceChannel(this.voiceGateway),
      leaveVoiceChannel: new LeaveVoiceChannel(this.voiceGateway),
      searchTracks,
      saveSearchResults: new SaveSearchResults(searchSessions),
      pickTrack: new PickTrack(searchSessions),
      getSelectedTrack: new GetSelectedTrack(searchSessions),
      playNowTrack: new PlayNowTrack(this.playbackQueueService),
      enqueueTrack: new EnqueueTrack(this.playbackQueueService),
      getQueue: new GetQueue(this.playbackQueueService),
      getNowPlaying: new GetNowPlaying(this.playbackQueueService),
      skipTrack: new SkipTrack(this.playbackQueueService),
      clearQueue: new ClearQueue(this.playbackQueueService),
      removeQueueItem: new RemoveQueueItem(this.playbackQueueService),
      stopPlayback: new StopPlayback(this.playbackQueueService),
      pausePlayback: new PausePlayback(this.playbackQueueService),
      resumePlayback: new ResumePlayback(this.playbackQueueService),
      getPlaybackSettings: new GetPlaybackSettings(settingsService),
      setAutoplayMode: new SetAutoplayMode(settingsService),
      setPlaybackMood: new SetPlaybackMood(settingsService),
    });

    const guild = {
      voiceAdapterCreator: {},
      members: {
        me: {
          voice: {},
        },
      },
    };
    Object.defineProperty(guild.members.me.voice, "channelId", {
      get: () => this.voiceGateway.getJoinedChannel(this.guildId) ?? null,
    });

    this.guild = guild;
    this.member = {
      voice: {
        channelId: this.voiceChannelId,
        channel: {
          id: this.voiceChannelId,
          name: this.voiceChannelName,
          guild,
        },
      },
    };
  }

  async sendJoin(): Promise<FakeChatInputInteraction> {
    return this.sendCommand("join");
  }

  async sendPlay(source: string): Promise<FakeChatInputInteraction> {
    return this.sendCommand("play", { query: source });
  }

  async sendSkip(): Promise<FakeChatInputInteraction> {
    return this.sendCommand("skip");
  }

  async getQueue() {
    return this.playbackQueueService.getQueue(this.guildId);
  }

  private async sendCommand(
    commandName: string,
    options: Record<string, string | number | undefined> = {},
  ): Promise<FakeChatInputInteraction> {
    const interaction = new FakeChatInputInteraction(
      commandName,
      this.guildId,
      this.guild,
      this.member,
      options,
    );

    await this.handler.handle(interaction as never);
    return interaction;
  }
}

function getEmbedPayload(interaction: FakeChatInputInteraction): any {
  const payload = interaction.getLatestPayload() as any;

  if (typeof payload === "string") {
    return {
      content: payload,
      embed: undefined,
    };
  }

  const embed = payload?.embeds?.[0];
  return {
    content: payload?.content,
    embed: typeof embed?.toJSON === "function" ? embed.toJSON() : embed,
  };
}

function getFieldValue(embed: any, fieldName: string): string | undefined {
  return embed?.fields?.find((field: any) => field.name === fieldName)?.value;
}

describe("Playback command flow integration", () => {
  it("joins, queues repeated /play requests, and skips to the next queued song without idling", async () => {
    const firstSong = {
      source: "https://www.youtube.com/watch?v=track-1",
      title: "Lofi Rain",
    };
    const secondSong = {
      source: "https://www.youtube.com/watch?v=track-2",
      title: "Night Drive",
    };
    const thirdSong = {
      source: "https://www.youtube.com/watch?v=track-3",
      title: "Sunrise Echo",
    };
    const harness = new PlaybackCommandHarness([
      firstSong,
      secondSong,
      thirdSong,
    ]);

    const joinInteraction = await harness.sendJoin();
    const joinReply = getEmbedPayload(joinInteraction);

    expect(joinReply.embed.title).toBe("Joined voice channel");
    expect(joinReply.embed.description).toContain("Study Hall");
    expect(harness.voiceGateway.joinCalls).toHaveLength(1);
    expect(harness.voiceGateway.getJoinedChannel(harness.guildId)).toBe(
      harness.voiceChannelId,
    );

    const firstPlayInteraction = await harness.sendPlay(firstSong.source);
    const firstPlayReply = getEmbedPayload(firstPlayInteraction);
    let queue = await harness.getQueue();

    expect(firstPlayReply.embed.title).toBe("Now playing");
    expect(getFieldValue(firstPlayReply.embed, "Queue position")).toBe(
      "Playing now",
    );
    expect(harness.streamResolver.describeCalls).toEqual([]);
    expect(harness.streamResolver.resolveCalls).toEqual([firstSong.source]);
    expect(harness.voiceGateway.playCalls.map((call) => call.title)).toEqual([
      firstSong.title,
    ]);
    expect(queue.current?.track.title).toBe(firstSong.title);
    expect(queue.upcoming).toHaveLength(0);
    expect(harness.voiceGateway.getCurrentTitle(harness.guildId)).toBe(
      firstSong.title,
    );

    const secondPlayInteraction = await harness.sendPlay(secondSong.source);
    const secondPlayReply = getEmbedPayload(secondPlayInteraction);
    queue = await harness.getQueue();

    expect(secondPlayReply.embed.title).toBe("Added to queue");
    expect(getFieldValue(secondPlayReply.embed, "Queue position")).toBe("#1");
    expect(harness.streamResolver.describeCalls).toEqual([secondSong.source]);
    expect(harness.streamResolver.resolveCalls).toEqual([firstSong.source]);
    expect(queue.current?.track.title).toBe(firstSong.title);
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      secondSong.title,
    ]);
    expect(queue.upcoming[0].playbackSource).toBe(secondSong.source);

    const thirdPlayInteraction = await harness.sendPlay(thirdSong.source);
    const thirdPlayReply = getEmbedPayload(thirdPlayInteraction);
    queue = await harness.getQueue();

    expect(thirdPlayReply.embed.title).toBe("Added to queue");
    expect(getFieldValue(thirdPlayReply.embed, "Queue position")).toBe("#2");
    expect(harness.streamResolver.describeCalls).toEqual([
      secondSong.source,
      thirdSong.source,
    ]);
    expect(harness.streamResolver.resolveCalls).toEqual([firstSong.source]);
    expect(queue.current?.track.title).toBe(firstSong.title);
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      secondSong.title,
      thirdSong.title,
    ]);
    expect(queue.upcoming.map((item) => item.playbackSource)).toEqual([
      secondSong.source,
      thirdSong.source,
    ]);

    const skipInteraction = await harness.sendSkip();
    const skipReply = getEmbedPayload(skipInteraction);
    queue = await harness.getQueue();

    expect(skipReply.embed.title).toBe("Skipped");
    expect(skipReply.embed.description).toContain(secondSong.title);
    expect(harness.streamResolver.describeCalls).toEqual([
      secondSong.source,
      thirdSong.source,
    ]);
    expect(harness.streamResolver.resolveCalls).toEqual([
      firstSong.source,
      secondSong.source,
    ]);
    expect(harness.voiceGateway.playCalls.map((call) => call.title)).toEqual([
      firstSong.title,
      secondSong.title,
    ]);
    expect(harness.voiceGateway.stopCalls).toEqual([]);
    expect(harness.voiceGateway.getCurrentTitle(harness.guildId)).toBe(
      secondSong.title,
    );
    expect(queue.status).toBe("playing");
    expect(queue.current?.track.title).toBe(secondSong.title);
    expect(queue.current?.playbackSource).toBe(secondSong.source);
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      thirdSong.title,
    ]);
    expect(queue.upcoming[0].playbackSource).toBe(thirdSong.source);
  });
});

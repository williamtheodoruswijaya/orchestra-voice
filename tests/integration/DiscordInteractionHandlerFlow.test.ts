import { describe, expect, it } from "vitest";
import { GuildPlaybackSettingsService } from "../../src/application/services/GuildPlaybackSettingsService";
import { PlaybackQueueService } from "../../src/application/services/PlaybackQueueService";
import type {
  MusicCatalogPort,
  PlaylistLookupResult,
} from "../../src/application/ports/outbound/MusicCatalogPort";
import type {
  AudioSourceDescriptor,
  ResolvedAudioSource,
  StreamResolverPort,
} from "../../src/application/ports/outbound/StreamResolverPort";
import type { SearchProvider } from "../../src/application/ports/outbound/SearchSessionRepositoryPort";
import type {
  JoinVoiceRequest,
  PlayAudioRequest,
  VoiceGatewayPort,
} from "../../src/application/ports/outbound/VoiceGatewayPort";
import { ClearQueue } from "../../src/application/use-cases/ClearQueue";
import { EnqueueTrack } from "../../src/application/use-cases/EnqueueTrack";
import { GetPlaybackSettings } from "../../src/application/use-cases/GetPlaybackSettings";
import { GetQueue } from "../../src/application/use-cases/GetQueue";
import { GetSelectedTrack } from "../../src/application/use-cases/GetSelectedTrack";
import { JoinVoiceChannel } from "../../src/application/use-cases/JoinVoiceChannel";
import { LeaveVoiceChannel } from "../../src/application/use-cases/LeaveVoiceChannel";
import { LoopCurrentTrack } from "../../src/application/use-cases/LoopCurrentTrack";
import { LoopQueue } from "../../src/application/use-cases/LoopQueue";
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
  searchCalls = 0;

  constructor(private readonly playlists = new Map<string, PlaylistLookupResult>()) {}

  async search(): Promise<Track[]> {
    this.searchCalls += 1;
    return [];
  }

  async getPlaylist(source: string): Promise<PlaylistLookupResult | undefined> {
    return this.playlists.get(source);
  }
}

class ScenarioStreamResolver implements StreamResolverPort {
  readonly describeCalls: string[] = [];
  readonly resolveCalls: Array<string | Track> = [];

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
    this.resolveCalls.push(source);

    if (typeof source !== "string") {
      if (
        source.provider === "direct" &&
        source.pageUrl &&
        this.isYouTubeUrl(source.pageUrl)
      ) {
        throw new Error(
          "Queued direct metadata URLs are not directly playable audio.",
        );
      }

      return {
        title: source.title,
        sourceUrl: source.pageUrl,
        url: source.pageUrl ?? `https://audio.example/${encodeURIComponent(source.title)}.mp3`,
      };
    }

    const fixture = this.fixtures.get(source);
    const title = fixture?.title ?? source;

    return {
      title,
      sourceUrl: fixture?.source ?? source,
      url: `https://audio.example/${encodeURIComponent(title)}.mp3`,
    };
  }

  private isYouTubeUrl(url: string): boolean {
    return /youtu\.be|youtube\.com/i.test(url);
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
  readonly user = { id: "689657830273187943" };
  readonly options: {
    getString: (name: string) => string | null;
    getInteger: (name: string) => number | null;
  };
  private deferPayload?: unknown;
  private latestPayload?: unknown;

  constructor(
    readonly commandName: string,
    readonly guildId: string,
    readonly guild: any,
    readonly member: any,
    optionValues: Record<string, string | number | undefined> = {},
  ) {
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

  async deferReply(payload?: unknown): Promise<void> {
    this.deferred = true;
    this.deferPayload = payload;
  }

  async reply(payload: unknown): Promise<unknown> {
    this.replied = true;
    this.latestPayload = payload;
    return payload;
  }

  async editReply(payload: unknown): Promise<unknown> {
    this.replied = true;
    this.latestPayload = payload;
    return payload;
  }

  getPayload(): unknown {
    return this.latestPayload;
  }

  getDeferPayload(): unknown {
    return this.deferPayload;
  }
}

class InteractionHarness {
  readonly guildId = "guild-a";
  readonly voiceChannelId = "voice-a";
  readonly voiceChannelName = "Study Hall";
  readonly voiceGateway = new ScenarioVoiceGateway();
  readonly streamResolver: ScenarioStreamResolver;
  readonly playbackQueueService: PlaybackQueueService;
  readonly handler: DiscordInteractionHandler;
  readonly catalog: EmptyMusicCatalog;
  readonly guild: any;
  readonly member: any;

  constructor(
    fixtures: SongFixture[],
    options: { playlists?: Map<string, PlaylistLookupResult> } = {},
  ) {
    const fixtureMap = new Map(fixtures.map((fixture) => [fixture.source, fixture]));
    const catalog = new EmptyMusicCatalog(options.playlists);
    this.catalog = catalog;
    const searchSessions = new InMemorySearchSessionRepository();
    const queueRepository = new InMemoryGuildQueueRepository();
    const settingsRepository = new InMemoryGuildPlaybackSettingsRepository();
    const settingsService = new GuildPlaybackSettingsService(settingsRepository);
    this.streamResolver = new ScenarioStreamResolver(fixtureMap);
    this.playbackQueueService = new PlaybackQueueService(
      queueRepository,
      this.streamResolver,
      this.voiceGateway,
      undefined,
      undefined,
      {
        relatedCatalog: catalog,
        playlistCatalog: catalog,
        settingsRepository,
      },
    );

    const searchTracks = {
      all: new SearchTracks(catalog),
      youtube: new SearchTracks(catalog),
      spotify: new SearchTracks(catalog),
    } as Record<SearchProvider, SearchTracks>;
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
      loopCurrentTrack: new LoopCurrentTrack(this.playbackQueueService),
      loopQueue: new LoopQueue(this.playbackQueueService),
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

  async sendLoop(): Promise<FakeChatInputInteraction> {
    return this.sendCommand("loop");
  }

  async sendLoopQueue(): Promise<FakeChatInputInteraction> {
    return this.sendCommand("loop", { scope: "queue" });
  }

  async sendQueue(): Promise<FakeChatInputInteraction> {
    return this.sendCommand("queue");
  }

  async sendClearQueue(): Promise<FakeChatInputInteraction> {
    return this.sendCommand("clearqueue");
  }

  async sendAutoplayRelated(): Promise<FakeChatInputInteraction> {
    return this.sendCommand("autoplay", { mode: "related" });
  }

  async getQueue() {
    return this.playbackQueueService.getQueue(this.guildId);
  }

  private async sendCommand(
    commandName: string,
    optionValues: Record<string, string | number | undefined> = {},
  ): Promise<FakeChatInputInteraction> {
    const interaction = new FakeChatInputInteraction(
      commandName,
      this.guildId,
      this.guild,
      this.member,
      optionValues,
    );

    await this.handler.handle(interaction as never);
    return interaction;
  }
}

function getPayload(interaction: FakeChatInputInteraction): any {
  const payload = interaction.getPayload() as any;

  if (typeof payload === "string") {
    return { content: payload };
  }

  return {
    content: payload?.content,
    embeds: payload?.embeds?.map((embed: any) =>
      typeof embed?.toJSON === "function" ? embed.toJSON() : embed,
    ),
  };
}

function expectPublicReply(interaction: FakeChatInputInteraction): void {
  const deferPayload = interaction.getDeferPayload() as
    | { flags?: unknown }
    | undefined;

  expect(deferPayload?.flags).toBeUndefined();
}

function buildSongFixtures(count: number): SongFixture[] {
  return Array.from({ length: count }, (_, index) => ({
    source: `https://www.youtube.com/watch?v=track-${index + 1}`,
    title: `Long Queue Song ${index + 1} ` + "x".repeat(60),
  }));
}

function trackFromFixture(fixture: SongFixture, index: number): Track {
  const videoId = `playlist-track-${index + 1}`;

  return {
    id: `youtube:${videoId}`,
    provider: "youtube",
    providerTrackId: videoId,
    title: fixture.title,
    artist: "Playlist Channel",
    pageUrl: fixture.source,
  };
}

describe("Discord interaction handler integration", () => {
  it("drains a three-track /play queue to idle when queue-loop is off", async () => {
    const [firstSong, secondSong, thirdSong] = buildSongFixtures(3);
    const harness = new InteractionHarness([firstSong, secondSong, thirdSong]);

    await harness.sendJoin();
    await harness.sendPlay(firstSong.source);
    await harness.sendPlay(secondSong.source);
    await harness.sendPlay(thirdSong.source);

    await harness.voiceGateway.finishCurrentTrack(harness.guildId);
    await harness.voiceGateway.finishCurrentTrack(harness.guildId);
    await harness.voiceGateway.finishCurrentTrack(harness.guildId);

    const queue = await harness.getQueue();
    expect(queue.current).toBeUndefined();
    expect(queue.upcoming).toHaveLength(0);
    expect(queue.status).toBe("idle");
    expect(harness.voiceGateway.getCurrentTitle(harness.guildId)).toBeUndefined();
    expect(harness.voiceGateway.playCalls.map((call) => call.title)).toEqual([
      firstSong.title,
      secondSong.title,
      thirdSong.title,
    ]);
  });

  it("restarts from the first track after /loop queue when the last track ends", async () => {
    const [firstSong, secondSong, thirdSong] = buildSongFixtures(3);
    const harness = new InteractionHarness([firstSong, secondSong, thirdSong]);

    await harness.sendJoin();
    await harness.sendPlay(firstSong.source);
    await harness.sendPlay(secondSong.source);
    await harness.sendPlay(thirdSong.source);

    const loopInteraction = await harness.sendLoopQueue();
    const loopPayload = getPayload(loopInteraction);

    expectPublicReply(loopInteraction);
    expect(loopPayload.embeds[0].title).toBe("Queue Loop ON");

    await harness.voiceGateway.finishCurrentTrack(harness.guildId);
    await harness.voiceGateway.finishCurrentTrack(harness.guildId);
    await harness.voiceGateway.finishCurrentTrack(harness.guildId);

    const queue = await harness.getQueue();
    expect(queue.queueLoop).toBe(true);
    expect(queue.current?.track.title).toBe(firstSong.title);
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      secondSong.title,
      thirdSong.title,
    ]);
    expect(harness.voiceGateway.playCalls.map((call) => call.title)).toEqual([
      firstSong.title,
      secondSong.title,
      thirdSong.title,
      firstSong.title,
    ]);
  });

  it("wraps to the first track when /skip is used on the last item with queue-loop on", async () => {
    const [firstSong, secondSong, thirdSong] = buildSongFixtures(3);
    const harness = new InteractionHarness([firstSong, secondSong, thirdSong]);

    await harness.sendJoin();
    await harness.sendPlay(firstSong.source);
    await harness.sendPlay(secondSong.source);
    await harness.sendPlay(thirdSong.source);
    await harness.sendLoopQueue();
    await harness.voiceGateway.finishCurrentTrack(harness.guildId);
    await harness.voiceGateway.finishCurrentTrack(harness.guildId);

    const skipInteraction = await harness.sendSkip();
    const skipPayload = getPayload(skipInteraction);
    const queue = await harness.getQueue();

    expectPublicReply(skipInteraction);
    expect(skipPayload.embeds[0].title).toBe("Skipped");
    expect(skipPayload.embeds[0].description).toContain(firstSong.title);
    expect(queue.current?.track.title).toBe(firstSong.title);
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      secondSong.title,
      thirdSong.title,
    ]);
    expect(harness.voiceGateway.playCalls.map((call) => call.title)).toEqual([
      firstSong.title,
      secondSong.title,
      thirdSong.title,
      firstSong.title,
    ]);
  });

  it("turns queue-loop off when /clearqueue clears upcoming items", async () => {
    const [firstSong, secondSong, thirdSong] = buildSongFixtures(3);
    const harness = new InteractionHarness([firstSong, secondSong, thirdSong]);

    await harness.sendJoin();
    await harness.sendPlay(firstSong.source);
    await harness.sendPlay(secondSong.source);
    await harness.sendPlay(thirdSong.source);
    await harness.sendLoopQueue();

    const clearInteraction = await harness.sendClearQueue();
    const queue = await harness.getQueue();

    expectPublicReply(clearInteraction);
    expect(queue.current?.track.title).toBe(firstSong.title);
    expect(queue.upcoming).toHaveLength(0);
    expect(queue.queueLoop).toBe(false);
  });

  it("shows an error embed when /loop queue is used on an empty queue", async () => {
    const harness = new InteractionHarness([]);

    const interaction = await harness.sendLoopQueue();
    const payload = getPayload(interaction);

    expectPublicReply(interaction);
    expect(payload.embeds[0].title).toBe("Cannot Enable Queue Loop");
    expect(payload.embeds[0].description).toBe(
      "The queue is empty. Add tracks with /play first.",
    );
  });

  it("uses playback voice-channel validation for /loop queue", async () => {
    const harness = new InteractionHarness([]);
    await harness.sendJoin();
    harness.member.voice.channelId = null;

    const interaction = await harness.sendLoopQueue();
    const payload = getPayload(interaction);

    expect(payload.content).toBe(
      "You need to join my voice channel before managing playback.",
    );
  });

  it("does not trigger related autoplay when queue-loop handles continuation", async () => {
    const [firstSong, secondSong, thirdSong] = buildSongFixtures(3);
    const harness = new InteractionHarness([firstSong, secondSong, thirdSong]);

    await harness.sendJoin();
    await harness.sendAutoplayRelated();
    await harness.sendPlay(firstSong.source);
    await harness.sendPlay(secondSong.source);
    await harness.sendPlay(thirdSong.source);
    await harness.sendLoopQueue();
    await harness.voiceGateway.finishCurrentTrack(harness.guildId);
    await harness.voiceGateway.finishCurrentTrack(harness.guildId);
    await harness.voiceGateway.finishCurrentTrack(harness.guildId);

    const queue = await harness.getQueue();
    expect(queue.current?.track.title).toBe(firstSong.title);
    expect(harness.catalog.searchCalls).toBe(0);
  });

  it("lets track-loop take priority while queue-loop waits", async () => {
    const [firstSong, secondSong, thirdSong] = buildSongFixtures(3);
    const harness = new InteractionHarness([firstSong, secondSong, thirdSong]);

    await harness.sendJoin();
    await harness.sendPlay(firstSong.source);
    await harness.sendPlay(secondSong.source);
    await harness.sendPlay(thirdSong.source);
    await harness.sendLoopQueue();
    await harness.sendLoop();
    await harness.voiceGateway.finishCurrentTrack(harness.guildId);

    const queue = await harness.getQueue();
    expect(queue.current?.track.title).toBe(firstSong.title);
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      secondSong.title,
      thirdSong.title,
    ]);
    expect(queue.loopCurrent).toBe(true);
    expect(queue.queueLoop).toBe(true);
    expect(harness.voiceGateway.playCalls.map((call) => call.title)).toEqual([
      firstSong.title,
      firstSong.title,
    ]);
  });

  it("joins, queues song #2, skips to it, queues song #3, and autoplays song #3 after song #2 ends", async () => {
    const [firstSong, secondSong, thirdSong] = buildSongFixtures(3);
    const harness = new InteractionHarness([firstSong, secondSong, thirdSong]);

    const joinInteraction = await harness.sendJoin();
    const joinPayload = getPayload(joinInteraction);

    expectPublicReply(joinInteraction);
    expect(joinPayload.embeds[0].title).toBe("Joined voice channel");
    expect(harness.voiceGateway.getJoinedChannel(harness.guildId)).toBe(
      harness.voiceChannelId,
    );

    const firstPlayInteraction = await harness.sendPlay(firstSong.source);
    const firstPlayPayload = getPayload(firstPlayInteraction);

    expectPublicReply(firstPlayInteraction);
    expect(firstPlayPayload.embeds[0].title).toBe("Now playing");
    expect(harness.voiceGateway.getCurrentTitle(harness.guildId)).toBe(
      firstSong.title,
    );

    const secondPlayInteraction = await harness.sendPlay(secondSong.source);
    const secondPlayPayload = getPayload(secondPlayInteraction);
    let queue = await harness.getQueue();

    expectPublicReply(secondPlayInteraction);
    expect(secondPlayPayload.embeds[0].title).toBe("Added to queue");
    expect(queue.current?.track.title).toBe(firstSong.title);
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      secondSong.title,
    ]);

    const skipInteraction = await harness.sendSkip();
    const skipPayload = getPayload(skipInteraction);
    queue = await harness.getQueue();

    expectPublicReply(skipInteraction);
    expect(skipPayload.embeds[0].title).toBe("Skipped");
    expect(skipPayload.embeds[0].description).toContain(secondSong.title);
    expect(harness.voiceGateway.getCurrentTitle(harness.guildId)).toBe(
      secondSong.title,
    );
    expect(queue.current?.track.title).toBe(secondSong.title);
    expect(queue.upcoming).toHaveLength(0);

    const thirdPlayInteraction = await harness.sendPlay(thirdSong.source);
    const thirdPlayPayload = getPayload(thirdPlayInteraction);
    queue = await harness.getQueue();

    expectPublicReply(thirdPlayInteraction);
    expect(thirdPlayPayload.embeds[0].title).toBe("Added to queue");
    expect(queue.current?.track.title).toBe(secondSong.title);
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      thirdSong.title,
    ]);

    await harness.voiceGateway.finishCurrentTrack(harness.guildId);

    queue = await harness.getQueue();

    expect(harness.streamResolver.describeCalls).toEqual([
      secondSong.source,
      thirdSong.source,
    ]);
    expect(harness.streamResolver.resolveCalls).toHaveLength(3);
    expect(harness.streamResolver.resolveCalls[0]).toBe(firstSong.source);
    expect(harness.streamResolver.resolveCalls[1]).toBe(secondSong.source);
    expect(harness.streamResolver.resolveCalls[2]).toBe(thirdSong.source);
    expect(harness.voiceGateway.playCalls.map((call) => call.title)).toEqual([
      firstSong.title,
      secondSong.title,
      thirdSong.title,
    ]);
    expect(harness.voiceGateway.getCurrentTitle(harness.guildId)).toBe(
      thirdSong.title,
    );
    expect(queue.status).toBe("playing");
    expect(queue.current?.track.title).toBe(thirdSong.title);
    expect(queue.current?.playbackSource).toBe(thirdSong.source);
    expect(queue.upcoming).toHaveLength(0);
  });

  it("renders /queue publicly and safely for up to 20 queued songs without exceeding embed field limits", async () => {
    const fixtures = buildSongFixtures(21);
    const harness = new InteractionHarness(fixtures);

    await harness.sendJoin();
    await harness.sendPlay(fixtures[0].source);

    for (const fixture of fixtures.slice(1)) {
      await harness.sendPlay(fixture.source);
    }

    const queueInteraction = await harness.sendQueue();
    const queuePayload = getPayload(queueInteraction);
    const [embed] = queuePayload.embeds;
    const upNextContent = embed.fields
      .filter((field: { name: string }) => field.name.startsWith("Up next"))
      .map((field: { value: string }) => field.value)
      .join("\n");

    expectPublicReply(queueInteraction);
    expect(typeof queuePayload.content).not.toBe("string");
    expect(embed.title).toBe("Queue");
    expect(
      embed.fields.every((field: { value: string }) => field.value.length <= 1024),
    ).toBe(true);
    expect(upNextContent).toContain("20.");
    expect(upNextContent).not.toContain("...and");
  });

  it("toggles /loop for the current song and leaves upcoming items waiting", async () => {
    const [firstSong, secondSong] = buildSongFixtures(2);
    const harness = new InteractionHarness([firstSong, secondSong]);

    await harness.sendJoin();
    await harness.sendPlay(firstSong.source);
    await harness.sendPlay(secondSong.source);

    const loopOnInteraction = await harness.sendLoop();
    const loopOnPayload = getPayload(loopOnInteraction);
    let queue = await harness.getQueue();

    expectPublicReply(loopOnInteraction);
    expect(loopOnPayload.embeds[0].title).toBe("Loop enabled");
    expect(loopOnPayload.embeds[0].description).toContain(firstSong.title);
    expect(queue.loopCurrent).toBe(true);

    await harness.voiceGateway.finishCurrentTrack(harness.guildId);
    queue = await harness.getQueue();

    expect(harness.voiceGateway.playCalls.map((call) => call.title)).toEqual([
      firstSong.title,
      firstSong.title,
    ]);
    expect(queue.current?.track.title).toBe(firstSong.title);
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      secondSong.title,
    ]);

    const loopOffInteraction = await harness.sendLoop();
    const loopOffPayload = getPayload(loopOffInteraction);

    expectPublicReply(loopOffInteraction);
    expect(loopOffPayload.embeds[0].title).toBe("Loop disabled");

    await harness.voiceGateway.finishCurrentTrack(harness.guildId);
    queue = await harness.getQueue();

    expect(harness.voiceGateway.playCalls.map((call) => call.title)).toEqual([
      firstSong.title,
      firstSong.title,
      secondSong.title,
    ]);
    expect(queue.loopCurrent).toBe(false);
    expect(queue.current?.track.title).toBe(secondSong.title);
    expect(queue.upcoming).toHaveLength(0);
  });

  it("joins, plays, queues, skips, loops the current song 10 times, then continues after loop is disabled", async () => {
    const [firstSong, loopedSong, nextSong] = buildSongFixtures(3);
    const harness = new InteractionHarness([firstSong, loopedSong, nextSong]);

    const joinInteraction = await harness.sendJoin();
    const joinPayload = getPayload(joinInteraction);

    expectPublicReply(joinInteraction);
    expect(joinPayload.embeds[0].title).toBe("Joined voice channel");
    expect(harness.voiceGateway.getJoinedChannel(harness.guildId)).toBe(
      harness.voiceChannelId,
    );

    const firstPlayInteraction = await harness.sendPlay(firstSong.source);
    const firstPlayPayload = getPayload(firstPlayInteraction);

    expectPublicReply(firstPlayInteraction);
    expect(firstPlayPayload.embeds[0].title).toBe("Now playing");
    expect(harness.voiceGateway.getCurrentTitle(harness.guildId)).toBe(
      firstSong.title,
    );

    const queuedPlayInteraction = await harness.sendPlay(loopedSong.source);
    const queuedPlayPayload = getPayload(queuedPlayInteraction);
    let queue = await harness.getQueue();

    expectPublicReply(queuedPlayInteraction);
    expect(queuedPlayPayload.embeds[0].title).toBe("Added to queue");
    expect(queue.current?.track.title).toBe(firstSong.title);
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      loopedSong.title,
    ]);

    const skipInteraction = await harness.sendSkip();
    const skipPayload = getPayload(skipInteraction);
    queue = await harness.getQueue();

    expectPublicReply(skipInteraction);
    expect(skipPayload.embeds[0].title).toBe("Skipped");
    expect(skipPayload.embeds[0].description).toContain(loopedSong.title);
    expect(harness.voiceGateway.getCurrentTitle(harness.guildId)).toBe(
      loopedSong.title,
    );
    expect(queue.current?.track.title).toBe(loopedSong.title);
    expect(queue.upcoming).toHaveLength(0);

    const nextPlayInteraction = await harness.sendPlay(nextSong.source);
    const nextPlayPayload = getPayload(nextPlayInteraction);
    queue = await harness.getQueue();

    expectPublicReply(nextPlayInteraction);
    expect(nextPlayPayload.embeds[0].title).toBe("Added to queue");
    expect(queue.current?.track.title).toBe(loopedSong.title);
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      nextSong.title,
    ]);

    const loopOnInteraction = await harness.sendLoop();
    const loopOnPayload = getPayload(loopOnInteraction);

    expectPublicReply(loopOnInteraction);
    expect(loopOnPayload.embeds[0].title).toBe("Loop enabled");
    expect(loopOnPayload.embeds[0].description).toContain(loopedSong.title);

    for (let loopCount = 1; loopCount <= 10; loopCount += 1) {
      await harness.voiceGateway.finishCurrentTrack(harness.guildId);
      queue = await harness.getQueue();

      expect(harness.voiceGateway.getCurrentTitle(harness.guildId)).toBe(
        loopedSong.title,
      );
      expect(queue.loopCurrent).toBe(true);
      expect(queue.current?.track.title).toBe(loopedSong.title);
      expect(queue.upcoming.map((item) => item.track.title)).toEqual([
        nextSong.title,
      ]);
    }

    expect(harness.voiceGateway.playCalls.map((call) => call.title)).toEqual([
      firstSong.title,
      loopedSong.title,
      ...Array.from({ length: 10 }, () => loopedSong.title),
    ]);

    const loopOffInteraction = await harness.sendLoop();
    const loopOffPayload = getPayload(loopOffInteraction);

    expectPublicReply(loopOffInteraction);
    expect(loopOffPayload.embeds[0].title).toBe("Loop disabled");

    await harness.voiceGateway.finishCurrentTrack(harness.guildId);
    queue = await harness.getQueue();

    expect(harness.voiceGateway.getCurrentTitle(harness.guildId)).toBe(
      nextSong.title,
    );
    expect(queue.loopCurrent).toBe(false);
    expect(queue.current?.track.title).toBe(nextSong.title);
    expect(queue.upcoming).toHaveLength(0);
    expect(harness.voiceGateway.playCalls.map((call) => call.title)).toEqual([
      firstSong.title,
      loopedSong.title,
      ...Array.from({ length: 10 }, () => loopedSong.title),
      nextSong.title,
    ]);
  });

  it("plays every song from a YouTube playlist link through /play", async () => {
    const playlistUrl =
      "https://www.youtube.com/playlist?list=PL-orchestra-voice";
    const playlistFixtures = buildSongFixtures(5);
    const playlistTracks = playlistFixtures.map(trackFromFixture);
    const harness = new InteractionHarness(playlistFixtures, {
      playlists: new Map([
        [
          playlistUrl,
          {
            title: "Focus playlist",
            sourceUrl: playlistUrl,
            tracks: playlistTracks,
          },
        ],
      ]),
    });

    await harness.sendJoin();

    const playInteraction = await harness.sendPlay(playlistUrl);
    const playPayload = getPayload(playInteraction);
    let queue = await harness.getQueue();

    expectPublicReply(playInteraction);
    expect(playPayload.embeds[0].title).toBe("Playlist started");
    expect(playPayload.embeds[0].description).toContain(playlistTracks[0].title);
    expect(harness.voiceGateway.getCurrentTitle(harness.guildId)).toBe(
      playlistTracks[0].title,
    );
    expect(queue.current?.track.title).toBe(playlistTracks[0].title);
    expect(queue.upcoming.map((item) => item.track.title)).toEqual(
      playlistTracks.slice(1).map((track) => track.title),
    );

    for (const expectedTrack of playlistTracks.slice(1)) {
      await harness.voiceGateway.finishCurrentTrack(harness.guildId);
      queue = await harness.getQueue();

      expect(harness.voiceGateway.getCurrentTitle(harness.guildId)).toBe(
        expectedTrack.title,
      );
      expect(queue.current?.track.title).toBe(expectedTrack.title);
    }

    expect(queue.upcoming).toHaveLength(0);
    expect(harness.voiceGateway.playCalls.map((call) => call.title)).toEqual(
      playlistTracks.map((track) => track.title),
    );
    expect(harness.streamResolver.resolveCalls).toEqual(playlistTracks);
  });
});

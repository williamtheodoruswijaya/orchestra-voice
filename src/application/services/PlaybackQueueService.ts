import { randomUUID } from "node:crypto";
import {
  GuildQueue,
  QueueItem,
  QueueState,
} from "../../domain/entities/GuildQueue";
import type { Track } from "../../domain/entities/Track";
import { TrackSimilarityScorer } from "../../domain/services/TrackSimilarityScorer";
import type { GuildPlaybackSettingsRepositoryPort } from "../ports/outbound/GuildPlaybackSettingsRepositoryPort";
import type { MusicCatalogPort } from "../ports/outbound/MusicCatalogPort";
import type { QueueRepositoryPort } from "../ports/outbound/QueueRepositoryPort";
import type {
  ResolvedAudioSource,
  StreamResolverPort,
} from "../ports/outbound/StreamResolverPort";
import type { VoiceGatewayPort } from "../ports/outbound/VoiceGatewayPort";

interface QueueRequestContext {
  guildId: string;
  requestedBy?: string;
}

export interface EnqueueTrackInput extends QueueRequestContext {
  track: Track;
}

export interface PlayNowInput extends QueueRequestContext {
  source: string | Track;
}

export interface QueueMutationResult {
  queue: QueueState;
}

export interface EnqueueTrackResult extends QueueMutationResult {
  item: QueueItem;
  queuePosition: number;
  startedPlayback: boolean;
  resolvedAudioSource?: ResolvedAudioSource;
}

export interface PlayNowResult extends QueueMutationResult {
  item: QueueItem;
  resolvedAudioSource: ResolvedAudioSource;
}

export interface AdvancePlaybackResult extends QueueMutationResult {
  nextItem?: QueueItem;
  resolvedAudioSource?: ResolvedAudioSource;
  autoplayStarted: boolean;
  relatedCandidate?: Track;
}

export interface RemoveQueueItemResult extends QueueMutationResult {
  removedItem: QueueItem;
}

export interface ClearQueueResult extends QueueMutationResult {
  removedCount: number;
}

type IdGenerator = () => string;
type Clock = () => number;

interface PlaybackQueueServiceOptions {
  relatedCatalog?: MusicCatalogPort;
  settingsRepository?: GuildPlaybackSettingsRepositoryPort;
  similarityScorer?: TrackSimilarityScorer;
  relatedScoreThreshold?: number;
}

export class PlaybackQueueService {
  private readonly relatedCatalog?: MusicCatalogPort;
  private readonly settingsRepository?: GuildPlaybackSettingsRepositoryPort;
  private readonly similarityScorer: TrackSimilarityScorer;
  private readonly relatedScoreThreshold: number;

  constructor(
    private readonly queueRepository: QueueRepositoryPort,
    private readonly streamResolver: StreamResolverPort,
    private readonly voiceGateway: VoiceGatewayPort,
    private readonly idGenerator: IdGenerator = randomUUID,
    private readonly clock: Clock = Date.now,
    options: PlaybackQueueServiceOptions = {},
  ) {
    this.relatedCatalog = options.relatedCatalog;
    this.settingsRepository = options.settingsRepository;
    this.similarityScorer =
      options.similarityScorer ?? new TrackSimilarityScorer();
    this.relatedScoreThreshold = options.relatedScoreThreshold ?? 0.18;
  }

  async playNow(input: PlayNowInput): Promise<PlayNowResult> {
    const resolvedAudioSource = await this.streamResolver.resolve(input.source);
    const queue = await this.queueRepository.getByGuildId(input.guildId);
    const item = this.createQueueItem(
      input.guildId,
      this.toTrack(input.source, resolvedAudioSource),
      input.requestedBy,
    );

    console.log(
      `Playing now in guild ${input.guildId}: ${item.track.title} (requested by ${item.requestedBy})`,
    );
    console.log(
      `Queue currently has ${queue.upcoming.length} upcoming items and status "${queue.status}".`,
    );

    const isPlaying = queue.current !== null;

    if (isPlaying) {
      queue.enqueue(item);
      await this.queueRepository.save(queue);

      return {
        item,
        queue: queue.toState(),
        resolvedAudioSource,
      };
    }

    queue.playNow(item);
    await this.queueRepository.save(queue);

    try {
      await this.voiceGateway.play({
        guildId: input.guildId,
        ...resolvedAudioSource,
      });
    } catch (error) {
      queue.rollbackCurrentToFront();
      await this.queueRepository.save(queue);
      throw error;
    }

    return {
      item,
      queue: queue.toState(),
      resolvedAudioSource,
    };
  }

  async enqueue(input: EnqueueTrackInput): Promise<EnqueueTrackResult> {
    const queue = await this.queueRepository.getByGuildId(input.guildId);
    const item = this.createQueueItem(
      input.guildId,
      input.track,
      input.requestedBy,
    );
    const queuePosition = queue.enqueue(item);

    if (queue.isActive) {
      await this.queueRepository.save(queue);
      return {
        item,
        queuePosition,
        startedPlayback: false,
        queue: queue.toState(),
      };
    }

    const nextItem = queue.startNext();
    await this.queueRepository.save(queue);

    try {
      const resolvedAudioSource = await this.playItem(input.guildId, nextItem!);
      await this.queueRepository.save(queue);

      return {
        item,
        queuePosition: 0,
        startedPlayback: true,
        queue: queue.toState(),
        resolvedAudioSource,
      };
    } catch (error) {
      queue.rollbackCurrentToFront();
      await this.queueRepository.save(queue);
      throw error;
    }
  }

  async advanceAfterCurrent(guildId: string): Promise<AdvancePlaybackResult> {
    const queue = await this.queueRepository.getByGuildId(guildId);

    if (!queue.current) {
      return {
        queue: queue.toState(),
        autoplayStarted: false,
      };
    }

    const finishedItem = queue.current;
    const nextItem = queue.finishCurrent();

    if (!nextItem) {
      const relatedCandidate = await this.findRelatedTrack(
        guildId,
        finishedItem.track,
      );

      if (!relatedCandidate) {
        await this.queueRepository.save(queue);
        return {
          queue: queue.toState(),
          autoplayStarted: false,
        };
      }

      const relatedItem = this.createQueueItem(guildId, relatedCandidate);
      queue.enqueue(relatedItem);
      queue.startNext();
      await this.queueRepository.save(queue);

      try {
        const resolvedAudioSource = await this.playItem(guildId, relatedItem);
        await this.queueRepository.save(queue);

        return {
          nextItem: relatedItem,
          resolvedAudioSource,
          queue: queue.toState(),
          autoplayStarted: true,
          relatedCandidate,
        };
      } catch (error) {
        queue.rollbackCurrentToFront();
        await this.queueRepository.save(queue);
        throw error;
      }
    }

    await this.queueRepository.save(queue);

    try {
      const resolvedAudioSource = await this.playItem(guildId, nextItem);
      await this.queueRepository.save(queue);

      return {
        nextItem,
        resolvedAudioSource,
        queue: queue.toState(),
        autoplayStarted: false,
      };
    } catch (error) {
      queue.rollbackCurrentToFront();
      await this.queueRepository.save(queue);
      throw error;
    }
  }

  async skip(guildId: string): Promise<AdvancePlaybackResult> {
    const queue = await this.queueRepository.getByGuildId(guildId);
    const nextItem = queue.skipCurrent();

    if (!nextItem) {
      await this.queueRepository.save(queue);
      await this.voiceGateway.stop(guildId);
      return {
        queue: queue.toState(),
        autoplayStarted: false,
      };
    }

    await this.queueRepository.save(queue);

    try {
      const resolvedAudioSource = await this.playItem(guildId, nextItem);
      await this.queueRepository.save(queue);

      return {
        nextItem,
        resolvedAudioSource,
        queue: queue.toState(),
        autoplayStarted: false,
      };
    } catch (error) {
      queue.rollbackCurrentToFront();
      await this.queueRepository.save(queue);
      throw error;
    }
  }

  async clearUpcoming(guildId: string): Promise<ClearQueueResult> {
    const queue = await this.queueRepository.getByGuildId(guildId);
    const removedCount = queue.clearUpcoming();
    await this.queueRepository.save(queue);

    return {
      removedCount,
      queue: queue.toState(),
    };
  }

  async removeUpcoming(
    guildId: string,
    position: number,
  ): Promise<RemoveQueueItemResult> {
    const queue = await this.queueRepository.getByGuildId(guildId);
    const removedItem = queue.removeUpcoming(position);
    await this.queueRepository.save(queue);

    return {
      removedItem,
      queue: queue.toState(),
    };
  }

  async getQueue(guildId: string): Promise<QueueState> {
    const queue = await this.queueRepository.getByGuildId(guildId);
    return queue.toState();
  }

  async getNowPlaying(guildId: string): Promise<QueueItem | undefined> {
    const queue = await this.queueRepository.getByGuildId(guildId);
    return queue.current;
  }

  async pause(guildId: string): Promise<QueueState> {
    const queue = await this.queueRepository.getByGuildId(guildId);
    queue.pause();

    const paused = await this.voiceGateway.pause(guildId);
    if (!paused) {
      throw new Error("Playback could not be paused.");
    }

    await this.queueRepository.save(queue);
    return queue.toState();
  }

  async resume(guildId: string): Promise<QueueState> {
    const queue = await this.queueRepository.getByGuildId(guildId);
    queue.resume();

    const resumed = await this.voiceGateway.resume(guildId);
    if (!resumed) {
      throw new Error("Playback could not be resumed.");
    }

    await this.queueRepository.save(queue);
    return queue.toState();
  }

  async stop(guildId: string): Promise<QueueState> {
    const queue = await this.queueRepository.getByGuildId(guildId);
    queue.stop();
    await this.queueRepository.save(queue);
    await this.voiceGateway.stop(guildId);
    return queue.toState();
  }

  private async playItem(
    guildId: string,
    item: QueueItem,
  ): Promise<ResolvedAudioSource> {
    const resolvedAudioSource = await this.streamResolver.resolve(item.track);
    await this.voiceGateway.play({
      guildId,
      ...resolvedAudioSource,
    });
    return resolvedAudioSource;
  }

  private async findRelatedTrack(
    guildId: string,
    reference: Track,
  ): Promise<Track | undefined> {
    if (!this.relatedCatalog || !this.settingsRepository) {
      return undefined;
    }

    const settings = await this.settingsRepository.getByGuildId(guildId);

    if (settings.autoplayMode !== "related") {
      return undefined;
    }

    const query = reference.artist
      ? `${reference.artist} ${reference.title}`
      : reference.title;
    const candidates = await this.relatedCatalog.search(query);
    const [bestCandidate] = this.similarityScorer.rank(
      reference,
      candidates,
      settings.mood,
    );

    if (!bestCandidate || bestCandidate.score < this.relatedScoreThreshold) {
      return undefined;
    }

    return bestCandidate.track;
  }

  private createQueueItem(
    guildId: string,
    track: Track,
    requestedBy?: string,
  ): QueueItem {
    return {
      id: this.idGenerator(),
      guildId,
      track,
      requestedBy,
      enqueuedAt: this.clock(),
    };
  }

  private toTrack(
    source: string | Track,
    resolved: ResolvedAudioSource,
  ): Track {
    if (typeof source !== "string") {
      return source;
    }

    return {
      id: `direct:${this.idGenerator()}`,
      provider: "direct",
      providerTrackId: source,
      title: resolved.title,
      pageUrl: resolved.sourceUrl ?? source,
    };
  }
}

import { randomUUID } from "node:crypto";
import {
  GuildQueue,
  QueueItem,
  QueueState,
} from "../../domain/entities/GuildQueue";
import type { Track } from "../../domain/entities/Track";
import { TrackSimilarityScorer } from "../../domain/services/TrackSimilarityScorer";
import type { GuildPlaybackSettingsRepositoryPort } from "../ports/outbound/GuildPlaybackSettingsRepositoryPort";
import type {
  MusicCatalogPort,
  MusicCatalogSearchResult,
  ProviderSearchStatus,
} from "../ports/outbound/MusicCatalogPort";
import type { QueueRepositoryPort } from "../ports/outbound/QueueRepositoryPort";
import type {
  AudioSourceDescriptor,
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
  queuePosition: number;
  startedPlayback: boolean;
  resolvedAudioSource: ResolvedAudioSource;
}

export type AutoplayContinuationStatus =
  | "not-needed"
  | "disabled"
  | "no-candidate"
  | "provider-unavailable"
  | "provider-on-cooldown"
  | "metadata-only"
  | "playback-failed"
  | "playable-continuation";

export interface AdvancePlaybackResult extends QueueMutationResult {
  nextItem?: QueueItem;
  resolvedAudioSource?: ResolvedAudioSource;
  autoplayStarted: boolean;
  autoplayStatus: AutoplayContinuationStatus;
  relatedCandidate?: Track;
  providerStatuses?: ProviderSearchStatus[];
  autoplayFailureMessage?: string;
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

interface RelatedTrackLookupResult {
  status:
    | "disabled"
    | "no-candidate"
    | "provider-unavailable"
    | "provider-on-cooldown"
    | "candidate";
  candidate?: Track;
  providerStatuses: ProviderSearchStatus[];
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
    const queue = await this.queueRepository.getByGuildId(input.guildId);

    if (queue.isActive) {
      const describedSource = await this.describeSource(input.source);
      const item = this.createQueueItem(
        input.guildId,
        this.toTrack(input.source, describedSource),
        input.requestedBy,
        typeof input.source === "string" ? input.source : undefined,
      );
      const queuePosition = queue.enqueue(item);
      await this.queueRepository.save(queue);

      return {
        item,
        queuePosition,
        startedPlayback: false,
        queue: queue.toState(),
        resolvedAudioSource: describedSource,
      };
    }

    const resolvedAudioSource = await this.streamResolver.resolve(input.source);
    const item = this.createQueueItem(
      input.guildId,
      this.toTrack(input.source, resolvedAudioSource),
      input.requestedBy,
      typeof input.source === "string" ? input.source : undefined,
    );
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
      queuePosition: 0,
      startedPlayback: true,
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
        autoplayStatus: "not-needed",
      };
    }

    const finishedItem = queue.current;
    const nextItem = queue.finishCurrent();

    if (!nextItem) {
      const relatedLookup = await this.findRelatedTrack(
        guildId,
        finishedItem.track,
      );

      if (!relatedLookup.candidate) {
        const autoplayStatus =
          relatedLookup.status === "candidate"
            ? "no-candidate"
            : relatedLookup.status;
        await this.queueRepository.save(queue);
        return {
          queue: queue.toState(),
          autoplayStarted: false,
          autoplayStatus,
          providerStatuses: relatedLookup.providerStatuses,
        };
      }

      const relatedItem = this.createQueueItem(guildId, relatedLookup.candidate);
      await this.queueRepository.save(queue);

      let resolvedAudioSource: ResolvedAudioSource;
      try {
        resolvedAudioSource = await this.streamResolver.resolve(
          relatedItem.track,
        );
      } catch (error) {
        await this.queueRepository.save(queue);
        return {
          queue: queue.toState(),
          autoplayStarted: false,
          autoplayStatus: "metadata-only",
          relatedCandidate: relatedLookup.candidate,
          providerStatuses: relatedLookup.providerStatuses,
          autoplayFailureMessage:
            error instanceof Error
              ? error.message
              : "The related metadata result could not be resolved to audio.",
        };
      }

      try {
        await this.voiceGateway.play({
          guildId,
          ...resolvedAudioSource,
        });

        queue.playNow(relatedItem);
        await this.queueRepository.save(queue);

        return {
          nextItem: relatedItem,
          resolvedAudioSource,
          queue: queue.toState(),
          autoplayStarted: true,
          autoplayStatus: "playable-continuation",
          relatedCandidate: relatedLookup.candidate,
          providerStatuses: relatedLookup.providerStatuses,
        };
      } catch (error) {
        await this.queueRepository.save(queue);
        return {
          queue: queue.toState(),
          autoplayStarted: false,
          autoplayStatus: "playback-failed",
          relatedCandidate: relatedLookup.candidate,
          resolvedAudioSource,
          providerStatuses: relatedLookup.providerStatuses,
          autoplayFailureMessage:
            error instanceof Error
              ? error.message
              : "The related track resolved to audio but playback did not start.",
        };
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
        autoplayStatus: "not-needed",
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
        autoplayStatus: "not-needed",
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
        autoplayStatus: "not-needed",
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
    const resolvedAudioSource = await this.streamResolver.resolve(
      item.playbackSource ?? item.track,
    );
    await this.voiceGateway.play({
      guildId,
      ...resolvedAudioSource,
    });
    return resolvedAudioSource;
  }

  private async describeSource(
    source: string | Track,
  ): Promise<AudioSourceDescriptor> {
    if (typeof source !== "string") {
      return {
        title: source.title,
        sourceUrl: source.pageUrl,
      };
    }

    if (this.streamResolver.describe) {
      return this.streamResolver.describe(source);
    }

    const resolvedAudioSource = await this.streamResolver.resolve(source);
    return {
      title: resolvedAudioSource.title,
      sourceUrl: resolvedAudioSource.sourceUrl,
    };
  }

  private async findRelatedTrack(
    guildId: string,
    reference: Track,
  ): Promise<RelatedTrackLookupResult> {
    if (!this.relatedCatalog || !this.settingsRepository) {
      return {
        status: "disabled",
        providerStatuses: [],
      };
    }

    const settings = await this.settingsRepository.getByGuildId(guildId);

    if (settings.autoplayMode !== "related") {
      return {
        status: "disabled",
        providerStatuses: [],
      };
    }

    const query = reference.artist
      ? `${reference.artist} ${reference.title}`
      : reference.title;
    const searchResult = await this.searchRelatedCatalog(query);
    const candidates = searchResult.tracks;
    const noCandidateStatus = this.getNoCandidateStatus(
      searchResult.providerStatuses,
    );

    if (candidates.length === 0) {
      return {
        status: noCandidateStatus,
        providerStatuses: searchResult.providerStatuses,
      };
    }

    const [bestCandidate] = this.similarityScorer.rank(
      reference,
      candidates,
      settings.mood,
    );

    if (!bestCandidate || bestCandidate.score < this.relatedScoreThreshold) {
      return {
        status: "no-candidate",
        providerStatuses: searchResult.providerStatuses,
      };
    }

    return {
      status: "candidate",
      candidate: bestCandidate.track,
      providerStatuses: searchResult.providerStatuses,
    };
  }

  private async searchRelatedCatalog(
    query: string,
  ): Promise<MusicCatalogSearchResult> {
    if (!this.relatedCatalog) {
      return {
        tracks: [],
        providerStatuses: [],
      };
    }

    if (this.relatedCatalog.searchDetailed) {
      return this.relatedCatalog.searchDetailed(query);
    }

    const tracks = await this.relatedCatalog.search(query);

    return {
      tracks,
      providerStatuses: [],
    };
  }

  private getNoCandidateStatus(
    statuses: ProviderSearchStatus[],
  ): RelatedTrackLookupResult["status"] {
    if (statuses.length === 0) {
      return "no-candidate";
    }

    const fulfilled = statuses.filter((status) => status.status === "fulfilled");

    if (fulfilled.length > 0) {
      return "no-candidate";
    }

    if (statuses.every((status) => status.status === "skipped")) {
      return "provider-on-cooldown";
    }

    return "provider-unavailable";
  }

  private createQueueItem(
    guildId: string,
    track: Track,
    requestedBy?: string,
    playbackSource?: string,
  ): QueueItem {
    return {
      id: this.idGenerator(),
      guildId,
      track,
      playbackSource,
      requestedBy,
      enqueuedAt: this.clock(),
    };
  }

  private toTrack(
    source: string | Track,
    resolved: AudioSourceDescriptor,
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

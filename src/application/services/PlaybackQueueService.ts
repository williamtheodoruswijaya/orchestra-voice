import { randomUUID } from "node:crypto";
import {
  GuildQueue,
  QueueItem,
  QueueState,
} from "../../domain/entities/GuildQueue";
import type { Track } from "../../domain/entities/Track";
import type { QueueRepositoryPort } from "../ports/outbound/QueueRepositoryPort";
import type { ResolvedAudioSource, StreamResolverPort } from "../ports/outbound/StreamResolverPort";
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
}

export interface RemoveQueueItemResult extends QueueMutationResult {
  removedItem: QueueItem;
}

export interface ClearQueueResult extends QueueMutationResult {
  removedCount: number;
}

type IdGenerator = () => string;
type Clock = () => number;

export class PlaybackQueueService {
  constructor(
    private readonly queueRepository: QueueRepositoryPort,
    private readonly streamResolver: StreamResolverPort,
    private readonly voiceGateway: VoiceGatewayPort,
    private readonly idGenerator: IdGenerator = randomUUID,
    private readonly clock: Clock = Date.now,
  ) {}

  async playNow(input: PlayNowInput): Promise<PlayNowResult> {
    const resolvedAudioSource = await this.streamResolver.resolve(input.source);
    const queue = await this.queueRepository.getByGuildId(input.guildId);
    const item = this.createQueueItem(
      input.guildId,
      this.toTrack(input.source, resolvedAudioSource),
      input.requestedBy,
    );

    queue.stop();
    queue.enqueue(item);
    queue.startNext();

    await this.voiceGateway.play({
      guildId: input.guildId,
      ...resolvedAudioSource,
    });
    await this.queueRepository.save(queue);

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
      queue.stop();
      await this.queueRepository.save(queue);
      throw error;
    }
  }

  async advanceAfterCurrent(guildId: string): Promise<AdvancePlaybackResult> {
    const queue = await this.queueRepository.getByGuildId(guildId);

    if (!queue.current) {
      return {
        queue: queue.toState(),
      };
    }

    const nextItem = queue.finishCurrent();

    if (!nextItem) {
      await this.queueRepository.save(queue);
      return {
        queue: queue.toState(),
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
      };
    } catch (error) {
      queue.stop();
      await this.queueRepository.save(queue);
      throw error;
    }
  }

  async skip(guildId: string): Promise<AdvancePlaybackResult> {
    const queue = await this.queueRepository.getByGuildId(guildId);
    const nextItem = queue.skipCurrent();

    if (!nextItem) {
      await this.voiceGateway.stop(guildId);
      await this.queueRepository.save(queue);
      return {
        queue: queue.toState(),
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
      };
    } catch (error) {
      queue.stop();
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
    await this.voiceGateway.stop(guildId);
    await this.queueRepository.save(queue);
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

  private toTrack(source: string | Track, resolved: ResolvedAudioSource): Track {
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

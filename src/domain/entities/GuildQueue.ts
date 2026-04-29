import type { Track } from "./Track";

export type PlaybackStatus = "idle" | "playing" | "paused";

export interface QueueItem {
  id: string;
  guildId: string;
  track: Track;
  playbackSource?: string;
  requestedBy?: string;
  enqueuedAt: number;
}

export interface QueueState {
  guildId: string;
  current?: QueueItem;
  upcoming: QueueItem[];
  status: PlaybackStatus;
  loopCurrent: boolean;
}

export class GuildQueue {
  private currentItem?: QueueItem;
  private upcomingItems: QueueItem[];
  private playbackStatus: PlaybackStatus;
  private currentLoopEnabled: boolean;

  constructor(
    public readonly guildId: string,
    state?: Partial<Omit<QueueState, "guildId">>,
  ) {
    this.currentItem = state?.current;
    this.upcomingItems = [...(state?.upcoming ?? [])];
    this.playbackStatus = state?.status ?? "idle";
    this.currentLoopEnabled =
      this.currentItem !== undefined ? (state?.loopCurrent ?? false) : false;
  }

  get current(): QueueItem | undefined {
    return this.currentItem;
  }

  get upcoming(): QueueItem[] {
    return [...this.upcomingItems];
  }

  get status(): PlaybackStatus {
    return this.playbackStatus;
  }

  get loopCurrent(): boolean {
    return this.currentLoopEnabled;
  }

  get isActive(): boolean {
    return this.currentItem !== undefined && this.playbackStatus !== "idle";
  }

  enqueue(item: QueueItem): number {
    this.upcomingItems.push(item);
    return this.upcomingItems.length;
  }

  playNow(item: QueueItem): void {
    this.currentItem = item;
    this.playbackStatus = "playing";
    this.currentLoopEnabled = false;
  }

  startNext(): QueueItem | undefined {
    const nextItem = this.upcomingItems.shift();

    this.currentItem = nextItem;
    this.playbackStatus = nextItem ? "playing" : "idle";
    this.currentLoopEnabled = false;

    return nextItem;
  }

  skipCurrent(): QueueItem | undefined {
    if (!this.currentItem) {
      throw new Error("There is nothing to skip.");
    }

    return this.startNext();
  }

  finishCurrent(): QueueItem | undefined {
    this.currentItem = undefined;
    this.playbackStatus = "idle";
    this.currentLoopEnabled = false;
    return this.startNext();
  }

  rollbackCurrentToFront(): QueueItem | undefined {
    if (!this.currentItem) {
      return undefined;
    }

    const failedItem = this.currentItem;
    this.currentItem = undefined;
    this.playbackStatus = "idle";
    this.currentLoopEnabled = false;
    this.upcomingItems.unshift(failedItem);

    return failedItem;
  }

  toggleCurrentLoop(): boolean {
    if (!this.currentItem) {
      throw new Error("There is nothing playing to loop.");
    }

    this.currentLoopEnabled = !this.currentLoopEnabled;
    return this.currentLoopEnabled;
  }

  removeUpcoming(position: number): QueueItem {
    if (!Number.isInteger(position) || position < 1) {
      throw new Error("Queue position must be 1 or higher.");
    }

    if (position > this.upcomingItems.length) {
      throw new Error(
        `Queue position must be between 1 and ${this.upcomingItems.length}.`,
      );
    }

    const [removedItem] = this.upcomingItems.splice(position - 1, 1);
    return removedItem;
  }

  clearUpcoming(): number {
    const removedCount = this.upcomingItems.length;
    this.upcomingItems = [];
    return removedCount;
  }

  stop(): void {
    this.currentItem = undefined;
    this.playbackStatus = "idle";
    this.currentLoopEnabled = false;
  }

  pause(): void {
    if (!this.currentItem || this.playbackStatus !== "playing") {
      throw new Error("There is nothing playing to pause.");
    }

    this.playbackStatus = "paused";
  }

  resume(): void {
    if (!this.currentItem || this.playbackStatus !== "paused") {
      throw new Error("There is nothing paused to resume.");
    }

    this.playbackStatus = "playing";
  }

  toState(): QueueState {
    return {
      guildId: this.guildId,
      current: this.currentItem,
      upcoming: [...this.upcomingItems],
      status: this.playbackStatus,
      loopCurrent: this.currentLoopEnabled,
    };
  }
}

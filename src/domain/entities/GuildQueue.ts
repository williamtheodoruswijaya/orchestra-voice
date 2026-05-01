import type { Track } from "./Track";

export type PlaybackStatus = "idle" | "playing" | "paused";

function fisherYatesShuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

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
  queueLoop: boolean;
  queueLoopItems: QueueItem[];
}

export class GuildQueue {
  private currentItem?: QueueItem;
  private upcomingItems: QueueItem[];
  private queueLoopItems: QueueItem[];
  private playbackStatus: PlaybackStatus;
  private currentLoopEnabled: boolean;
  private queueLoopEnabled: boolean;

  constructor(
    public readonly guildId: string,
    state?: Partial<Omit<QueueState, "guildId">>,
  ) {
    this.currentItem = state?.current;
    this.upcomingItems = [...(state?.upcoming ?? [])];
    this.queueLoopItems =
      state?.queueLoopItems !== undefined
        ? [...state.queueLoopItems]
        : [
            ...(this.currentItem ? [this.currentItem] : []),
            ...this.upcomingItems,
          ];
    this.playbackStatus = state?.status ?? "idle";
    this.currentLoopEnabled =
      this.currentItem !== undefined ? (state?.loopCurrent ?? false) : false;
    this.queueLoopEnabled = state?.queueLoop ?? false;
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

  isQueueLoopEnabled(): boolean {
    return this.queueLoopEnabled;
  }

  toggleQueueLoop(): boolean {
    this.queueLoopEnabled = !this.queueLoopEnabled;
    return this.queueLoopEnabled;
  }

  get isActive(): boolean {
    return this.currentItem !== undefined && this.playbackStatus !== "idle";
  }

  enqueue(item: QueueItem): number {
    this.upcomingItems.push(item);
    this.queueLoopItems.push(item);
    return this.upcomingItems.length;
  }

  playNow(item: QueueItem): void {
    this.currentItem = item;
    this.queueLoopItems = [item];
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

  advance(): QueueItem | null {
    if (this.currentLoopEnabled && this.currentItem) {
      return this.currentItem;
    }

    const nextItem = this.upcomingItems.shift() ?? null;

    this.currentItem = nextItem ?? undefined;
    this.playbackStatus = nextItem ? "playing" : "idle";
    this.currentLoopEnabled = false;

    if (nextItem) {
      return nextItem;
    }

    if (this.queueLoopEnabled && this.queueLoopItems.length > 0) {
      this.upcomingItems = [...this.queueLoopItems];
      const wrappedItem = this.upcomingItems.shift()!;
      this.currentItem = wrappedItem;
      this.playbackStatus = "playing";

      return wrappedItem;
    }

    return null;
  }

  skipCurrent(): QueueItem | undefined {
    if (!this.currentItem) {
      throw new Error("There is nothing to skip.");
    }

    this.currentLoopEnabled = false;
    return this.advance() ?? undefined;
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
    this.queueLoopItems = this.queueLoopItems.filter(
      (item) => item.id !== removedItem.id,
    );
    return removedItem;
  }

  shuffleUpcoming(
    shuffler: (items: QueueItem[]) => QueueItem[] = fisherYatesShuffle,
  ): number {
    if (this.upcomingItems.length <= 1) {
      return 0;
    }

    this.upcomingItems = shuffler([...this.upcomingItems]);
    this.queueLoopItems = [
      ...(this.currentItem ? [this.currentItem] : []),
      ...this.upcomingItems,
    ];

    return this.upcomingItems.length;
  }

  clearUpcoming(): number {
    const removedCount = this.upcomingItems.length;
    this.upcomingItems = [];
    this.queueLoopItems = this.currentItem ? [this.currentItem] : [];
    this.queueLoopEnabled = false;
    return removedCount;
  }

  stop(): void {
    this.currentItem = undefined;
    this.playbackStatus = "idle";
    this.currentLoopEnabled = false;
  }

  leave(): void {
    this.currentItem = undefined;
    this.upcomingItems = [];
    this.queueLoopItems = [];
    this.playbackStatus = "idle";
    this.currentLoopEnabled = false;
    this.queueLoopEnabled = false;
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
      queueLoop: this.queueLoopEnabled,
      queueLoopItems: [...this.queueLoopItems],
    };
  }
}

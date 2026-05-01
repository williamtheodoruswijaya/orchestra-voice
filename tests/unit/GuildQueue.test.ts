import { describe, expect, it } from "vitest";
import { GuildQueue, type QueueItem } from "../../src/domain/entities/GuildQueue";
import type { Track } from "../../src/domain/entities/Track";

function createTrack(id: string): Track {
  return {
    id: `youtube:${id}`,
    provider: "youtube",
    providerTrackId: id,
    title: `Track ${id}`,
    pageUrl: `https://www.youtube.com/watch?v=${id}`,
  };
}

function createQueueItem(id: string, guildId = "guild-a"): QueueItem {
  return {
    id: `queue-item-${id}`,
    guildId,
    track: createTrack(id),
    enqueuedAt: 1_700_000_000_000,
  };
}

describe("GuildQueue queue loop", () => {
  it("defaults queue-loop to off for a new guild", () => {
    const queue = new GuildQueue("guild-a");

    expect(queue.isQueueLoopEnabled()).toBe(false);
  });

  it("turns queue-loop on when toggled", () => {
    const queue = new GuildQueue("guild-a");

    const enabled = queue.toggleQueueLoop();

    expect(enabled).toBe(true);
    expect(queue.isQueueLoopEnabled()).toBe(true);
  });

  it("turns queue-loop back off when toggled again", () => {
    const queue = new GuildQueue("guild-a");

    queue.toggleQueueLoop();
    const disabled = queue.toggleQueueLoop();

    expect(disabled).toBe(false);
    expect(queue.isQueueLoopEnabled()).toBe(false);
  });

  it("returns null when advancing the last item with queue-loop off", () => {
    const queue = new GuildQueue("guild-a");
    queue.enqueue(createQueueItem("a"));
    queue.startNext();

    const nextItem = queue.advance();

    expect(nextItem).toBeNull();
    expect(queue.current).toBeUndefined();
    expect(queue.status).toBe("idle");
  });

  it("wraps to position 1 when advancing the last item with queue-loop on", () => {
    const queue = new GuildQueue("guild-a");
    queue.enqueue(createQueueItem("a"));
    queue.enqueue(createQueueItem("b"));
    queue.enqueue(createQueueItem("c"));
    queue.toggleQueueLoop();

    queue.startNext();
    queue.advance();
    queue.advance();
    const wrappedItem = queue.advance();

    expect(wrappedItem?.track.title).toBe("Track a");
    expect(queue.current?.track.title).toBe("Track a");
  });

  it("preserves the original queue order after queue-loop wraps", () => {
    const queue = new GuildQueue("guild-a");
    queue.enqueue(createQueueItem("a"));
    queue.enqueue(createQueueItem("b"));
    queue.enqueue(createQueueItem("c"));
    queue.toggleQueueLoop();

    queue.startNext();
    queue.advance();
    queue.advance();
    queue.advance();

    expect(queue.current?.track.title).toBe("Track a");
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track b",
      "Track c",
    ]);
  });

  it("replays the current item when track-loop and queue-loop are both on", () => {
    const queue = new GuildQueue("guild-a");
    queue.enqueue(createQueueItem("a"));
    queue.enqueue(createQueueItem("b"));
    queue.toggleQueueLoop();
    queue.startNext();
    queue.toggleCurrentLoop();

    const nextItem = queue.advance();

    expect(nextItem?.track.title).toBe("Track a");
    expect(queue.current?.track.title).toBe("Track a");
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track b",
    ]);
    expect(queue.loopCurrent).toBe(true);
  });

  it("wraps to position 1 when skipping the last item with queue-loop on", () => {
    const queue = new GuildQueue("guild-a");
    queue.enqueue(createQueueItem("a"));
    queue.enqueue(createQueueItem("b"));
    queue.toggleQueueLoop();

    queue.startNext();
    queue.advance();
    const skippedToItem = queue.skipCurrent();

    expect(skippedToItem?.track.title).toBe("Track a");
    expect(queue.current?.track.title).toBe("Track a");
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track b",
    ]);
  });

  it("ignores track-loop when skipping", () => {
    const queue = new GuildQueue("guild-a");
    queue.enqueue(createQueueItem("a"));
    queue.enqueue(createQueueItem("b"));
    queue.startNext();
    queue.toggleCurrentLoop();

    const skippedToItem = queue.skipCurrent();

    expect(skippedToItem?.track.title).toBe("Track b");
    expect(queue.current?.track.title).toBe("Track b");
    expect(queue.loopCurrent).toBe(false);
  });

  it("disables queue-loop when upcoming items are cleared", () => {
    const queue = new GuildQueue("guild-a");
    queue.enqueue(createQueueItem("a"));
    queue.enqueue(createQueueItem("b"));
    queue.startNext();
    queue.toggleQueueLoop();

    const removedCount = queue.clearUpcoming();

    expect(removedCount).toBe(1);
    expect(queue.current?.track.title).toBe("Track a");
    expect(queue.isQueueLoopEnabled()).toBe(false);
  });

  it("clears playback state and disables queue-loop when leaving", () => {
    const queue = new GuildQueue("guild-a");
    queue.enqueue(createQueueItem("a"));
    queue.enqueue(createQueueItem("b"));
    queue.startNext();
    queue.toggleQueueLoop();

    queue.leave();

    expect(queue.current).toBeUndefined();
    expect(queue.upcoming).toEqual([]);
    expect(queue.status).toBe("idle");
    expect(queue.isQueueLoopEnabled()).toBe(false);
  });

  it("does not disable queue-loop when stopping", () => {
    const queue = new GuildQueue("guild-a");
    queue.enqueue(createQueueItem("a"));
    queue.enqueue(createQueueItem("b"));
    queue.startNext();
    queue.toggleQueueLoop();

    queue.stop();

    expect(queue.current).toBeUndefined();
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track b",
    ]);
    expect(queue.status).toBe("idle");
    expect(queue.isQueueLoopEnabled()).toBe(true);
  });

  it("keeps queue-loop state isolated per guild", () => {
    const guildAQueue = new GuildQueue("guild-a");
    const guildBQueue = new GuildQueue("guild-b");

    guildAQueue.toggleQueueLoop();

    expect(guildAQueue.isQueueLoopEnabled()).toBe(true);
    expect(guildBQueue.isQueueLoopEnabled()).toBe(false);
  });

  it("tracks active state and direct playNow state", () => {
    const queue = new GuildQueue("guild-a");

    expect(queue.isActive).toBe(false);

    queue.playNow(createQueueItem("a"));

    expect(queue.isActive).toBe(true);
    expect(queue.current?.track.title).toBe("Track a");
    expect(queue.status).toBe("playing");
    expect(queue.loopCurrent).toBe(false);
  });

  it("removes upcoming items by valid position and rejects invalid positions", () => {
    const queue = new GuildQueue("guild-a");
    queue.enqueue(createQueueItem("a"));
    queue.enqueue(createQueueItem("b"));
    queue.enqueue(createQueueItem("c"));
    queue.startNext();

    expect(queue.removeUpcoming(1).track.title).toBe("Track b");
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track c",
    ]);
    expect(() => queue.removeUpcoming(0)).toThrow(
      "Queue position must be 1 or higher.",
    );
    expect(() => queue.removeUpcoming(2)).toThrow(
      "Queue position must be between 1 and 1.",
    );
  });

  it("keeps removed upcoming items out of future queue-loop wraps", () => {
    const queue = new GuildQueue("guild-a");
    queue.enqueue(createQueueItem("a"));
    queue.enqueue(createQueueItem("b"));
    queue.enqueue(createQueueItem("c"));
    queue.startNext();
    queue.toggleQueueLoop();

    queue.removeUpcoming(1);
    queue.advance();
    queue.advance();

    expect(queue.current?.track.title).toBe("Track a");
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track c",
    ]);
  });

  it("rolls current items back to the front and ignores rollback when idle", () => {
    const queue = new GuildQueue("guild-a");

    expect(queue.rollbackCurrentToFront()).toBeUndefined();

    queue.enqueue(createQueueItem("a"));
    queue.enqueue(createQueueItem("b"));
    queue.startNext();
    const failedItem = queue.rollbackCurrentToFront();

    expect(failedItem?.track.title).toBe("Track a");
    expect(queue.current).toBeUndefined();
    expect(queue.status).toBe("idle");
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track a",
      "Track b",
    ]);
  });

  it("pauses and resumes only in the matching playback states", () => {
    const queue = new GuildQueue("guild-a");

    expect(() => queue.pause()).toThrow("There is nothing playing to pause.");
    expect(() => queue.resume()).toThrow("There is nothing paused to resume.");

    queue.playNow(createQueueItem("a"));
    queue.pause();

    expect(queue.status).toBe("paused");
    expect(() => queue.pause()).toThrow("There is nothing playing to pause.");

    queue.resume();

    expect(queue.status).toBe("playing");
    expect(() => queue.resume()).toThrow("There is nothing paused to resume.");
  });

  it("finishes current playback through the legacy finishCurrent path", () => {
    const queue = new GuildQueue("guild-a");
    queue.enqueue(createQueueItem("a"));
    queue.enqueue(createQueueItem("b"));
    queue.startNext();

    const nextItem = queue.finishCurrent();

    expect(nextItem?.track.title).toBe("Track b");
    expect(queue.current?.track.title).toBe("Track b");
    expect(queue.status).toBe("playing");
  });

  it("rejects current-track loop when idle at the domain boundary", () => {
    const queue = new GuildQueue("guild-a");

    expect(() => queue.toggleCurrentLoop()).toThrow(
      "There is nothing playing to loop.",
    );
  });
});

describe("GuildQueue shuffleUpcoming", () => {
  it("returns 0 and keeps the queue unchanged when there are no upcoming items", () => {
    const queue = new GuildQueue("guild-a");

    const count = queue.shuffleUpcoming();

    expect(count).toBe(0);
    expect(queue.upcoming).toHaveLength(0);
  });

  it("returns 0 and leaves a single upcoming item in place", () => {
    const queue = new GuildQueue("guild-a");
    queue.enqueue(createQueueItem("a"));
    queue.startNext();
    queue.enqueue(createQueueItem("b"));

    const count = queue.shuffleUpcoming();

    expect(count).toBe(0);
    expect(queue.upcoming.map((item) => item.track.title)).toEqual(["Track b"]);
  });

  it("applies the provided shuffler function to the upcoming items", () => {
    const queue = new GuildQueue("guild-a");
    queue.enqueue(createQueueItem("a"));
    queue.enqueue(createQueueItem("b"));
    queue.enqueue(createQueueItem("c"));
    queue.startNext();

    const reverseShuffler = (items: QueueItem[]) => [...items].reverse();
    const count = queue.shuffleUpcoming(reverseShuffler);

    expect(count).toBe(2);
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track c",
      "Track b",
    ]);
  });

  it("preserves all items — no item is lost or duplicated after shuffle", () => {
    const queue = new GuildQueue("guild-a");
    queue.enqueue(createQueueItem("a"));
    queue.enqueue(createQueueItem("b"));
    queue.enqueue(createQueueItem("c"));
    queue.enqueue(createQueueItem("d"));
    queue.startNext();

    queue.shuffleUpcoming();

    const titles = new Set(queue.upcoming.map((item) => item.track.title));
    expect(titles).toEqual(
      new Set(["Track b", "Track c", "Track d"]),
    );
    expect(queue.upcoming).toHaveLength(3);
  });

  it("does not affect the currently playing item", () => {
    const queue = new GuildQueue("guild-a");
    queue.enqueue(createQueueItem("a"));
    queue.enqueue(createQueueItem("b"));
    queue.enqueue(createQueueItem("c"));
    queue.startNext();

    queue.shuffleUpcoming();

    expect(queue.current?.track.title).toBe("Track a");
  });

  it("updates queueLoopItems so queue-loop replays in shuffled order", () => {
    const queue = new GuildQueue("guild-a");
    queue.enqueue(createQueueItem("a"));
    queue.enqueue(createQueueItem("b"));
    queue.enqueue(createQueueItem("c"));
    queue.startNext();
    queue.toggleQueueLoop();

    const reverseShuffler = (items: QueueItem[]) => [...items].reverse();
    queue.shuffleUpcoming(reverseShuffler);

    // advance through b, c (reversed), then loop should restart with a, c, b
    queue.advance(); // plays c (reversed first)
    queue.advance(); // plays b (reversed second)
    const wrappedItem = queue.advance(); // wraps → a

    expect(wrappedItem?.track.title).toBe("Track a");
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track c",
      "Track b",
    ]);
  });

  it("shuffleUpcoming on a queue with no current item shuffles all items", () => {
    const queue = new GuildQueue("guild-a");
    queue.enqueue(createQueueItem("x"));
    queue.enqueue(createQueueItem("y"));

    const reverseShuffler = (items: QueueItem[]) => [...items].reverse();
    const count = queue.shuffleUpcoming(reverseShuffler);

    expect(count).toBe(2);
    expect(queue.upcoming.map((item) => item.track.title)).toEqual([
      "Track y",
      "Track x",
    ]);
  });
});

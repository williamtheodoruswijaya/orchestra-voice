import { describe, expect, it } from "vitest";
import { TrackSimilarityScorer } from "../../src/domain/services/TrackSimilarityScorer";
import type { Track } from "../../src/domain/entities/Track";

function track(id: string, title: string, artist = "Example Artist"): Track {
  return {
    id,
    provider: "youtube",
    providerTrackId: id,
    title,
    artist,
    pageUrl: `https://www.youtube.com/watch?v=${id}`,
  };
}

describe("TrackSimilarityScorer", () => {
  it("scores exact title and artist matches highly", () => {
    const scorer = new TrackSimilarityScorer();

    const score = scorer.score(
      track("a", "Midnight City", "M83"),
      track("b", "Midnight City", "M83"),
      "balanced",
    );

    expect(score).toBeGreaterThan(0.9);
  });

  it("normalizes noisy title modifiers", () => {
    const scorer = new TrackSimilarityScorer();

    const cleanScore = scorer.score(
      track("a", "Blue Monday", "New Order"),
      track("b", "Blue Monday Official Video HD", "New Order"),
      "balanced",
    );
    const unrelatedScore = scorer.score(
      track("a", "Blue Monday", "New Order"),
      track("c", "Friday Night", "Another Artist"),
      "balanced",
    );

    expect(cleanScore).toBeGreaterThan(unrelatedScore);
  });

  it("uses mood as a small ranking signal", () => {
    const scorer = new TrackSimilarityScorer();
    const reference = track("a", "Ocean", "Example Artist");
    const candidates = [
      track("b", "Ocean Ambient Study", "Example Artist"),
      track("c", "Ocean Dance Remix", "Example Artist"),
    ];

    const [focusBest] = scorer.rank(reference, candidates, "focus");
    const [upbeatBest] = scorer.rank(reference, candidates, "upbeat");

    expect(focusBest.track.title).toBe("Ocean Ambient Study");
    expect(upbeatBest.track.title).toBe("Ocean Dance Remix");
  });
});

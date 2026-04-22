import type { PlaybackMood } from "../entities/GuildPlaybackSettings";
import type { Track } from "../entities/Track";

const NOISY_TITLE_TOKENS = new Set([
  "audio",
  "official",
  "video",
  "lyrics",
  "lyric",
  "live",
  "remaster",
  "remastered",
  "sped",
  "slowed",
  "reverb",
  "hd",
]);

const MOOD_TOKENS: Record<PlaybackMood, string[]> = {
  balanced: [],
  focus: ["instrumental", "lofi", "ambient", "study", "acoustic"],
  chill: ["chill", "acoustic", "lofi", "soft", "slow"],
  upbeat: ["dance", "upbeat", "remix", "pop", "happy"],
};

export interface TrackSimilarityScore {
  track: Track;
  score: number;
}

export class TrackSimilarityScorer {
  score(reference: Track, candidate: Track, mood: PlaybackMood): number {
    if (reference.id === candidate.id) {
      return 0;
    }

    const referenceTitle = this.normalize(reference.title);
    const candidateTitle = this.normalize(candidate.title);
    const titleSimilarity = this.stringSimilarity(referenceTitle, candidateTitle);
    const tokenOverlap = this.tokenOverlap(referenceTitle, candidateTitle);
    const artistScore = this.artistScore(reference.artist, candidate.artist);
    const providerScore = reference.provider === candidate.provider ? 0.05 : 0;
    const moodScore = this.moodScore(candidateTitle, mood);

    return Number(
      (
        titleSimilarity * 0.35 +
        tokenOverlap * 0.3 +
        artistScore * 0.25 +
        providerScore +
        moodScore
      ).toFixed(4),
    );
  }

  rank(
    reference: Track,
    candidates: Track[],
    mood: PlaybackMood,
  ): TrackSimilarityScore[] {
    return candidates
      .map((track) => ({
        track,
        score: this.score(reference, track, mood),
      }))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  private normalize(input: string): string {
    return input
      .toLowerCase()
      .replace(/[\[\](){}|/\\:;'"!?.,_-]+/g, " ")
      .split(/\s+/)
      .filter((token) => token && !NOISY_TITLE_TOKENS.has(token))
      .join(" ")
      .trim();
  }

  private tokenOverlap(first: string, second: string): number {
    const firstTokens = new Set(first.split(/\s+/).filter(Boolean));
    const secondTokens = new Set(second.split(/\s+/).filter(Boolean));

    if (firstTokens.size === 0 || secondTokens.size === 0) {
      return 0;
    }

    const intersectionSize = [...firstTokens].filter((token) =>
      secondTokens.has(token),
    ).length;
    const unionSize = new Set([...firstTokens, ...secondTokens]).size;

    return intersectionSize / unionSize;
  }

  private artistScore(first?: string, second?: string): number {
    if (!first || !second) {
      return 0;
    }

    const normalizedFirst = this.normalize(first);
    const normalizedSecond = this.normalize(second);

    if (normalizedFirst === normalizedSecond) {
      return 1;
    }

    if (
      normalizedFirst.includes(normalizedSecond) ||
      normalizedSecond.includes(normalizedFirst)
    ) {
      return 0.65;
    }

    return this.tokenOverlap(normalizedFirst, normalizedSecond) * 0.5;
  }

  private moodScore(candidateTitle: string, mood: PlaybackMood): number {
    const moodTokens = MOOD_TOKENS[mood];

    if (moodTokens.length === 0) {
      return 0;
    }

    return moodTokens.some((token) => candidateTitle.includes(token)) ? 0.08 : 0;
  }

  private stringSimilarity(first: string, second: string): number {
    if (!first || !second) {
      return 0;
    }

    if (first === second) {
      return 1;
    }

    const distance = this.levenshteinDistance(first, second);
    return 1 - distance / Math.max(first.length, second.length);
  }

  private levenshteinDistance(first: string, second: string): number {
    const previous = Array.from({ length: second.length + 1 }, (_, index) => index);

    for (let i = 1; i <= first.length; i += 1) {
      let previousDiagonal = previous[0];
      previous[0] = i;

      for (let j = 1; j <= second.length; j += 1) {
        const temporary = previous[j];
        const cost = first[i - 1] === second[j - 1] ? 0 : 1;
        previous[j] = Math.min(
          previous[j] + 1,
          previous[j - 1] + 1,
          previousDiagonal + cost,
        );
        previousDiagonal = temporary;
      }
    }

    return previous[second.length];
  }
}

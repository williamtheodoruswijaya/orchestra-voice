export type TrackProvider = "spotify" | "youtube" | "direct";

export interface Track {
  id: string;
  provider: TrackProvider;
  providerTrackId: string;
  title: string;
  artist?: string;
  durationMs?: number;
  pageUrl?: string;
  artworkUrl?: string;
}
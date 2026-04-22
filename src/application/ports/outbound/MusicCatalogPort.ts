import { Track } from "../../../domain/entities/Track";
import type {
  MetadataProvider,
  ProviderFailure,
  ProviderFailureReason,
} from "../../services/ProviderFailureClassifier";

export type ProviderSearchStatus =
  | {
      provider: MetadataProvider;
      status: "fulfilled";
      resultCount: number;
    }
  | {
      provider: MetadataProvider;
      status: "failed";
      failure: ProviderFailure;
    }
  | {
      provider: MetadataProvider;
      status: "skipped";
      reason: "cooldown";
      failureReason: ProviderFailureReason;
      retryAfterMs: number;
      message: string;
    };

export interface MusicCatalogSearchResult {
  tracks: Track[];
  providerStatuses: ProviderSearchStatus[];
}

export interface MusicCatalogPort {
  search(query: string): Promise<Track[]>;
  searchDetailed?(query: string): Promise<MusicCatalogSearchResult>;
}

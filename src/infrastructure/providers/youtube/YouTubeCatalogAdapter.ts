import { Track } from "../../../domain/entities/Track";
import { MusicCatalogPort } from "../../../application/ports/outbound/MusicCatalogPort";
import {
  createMissingCredentialsFailure,
  createProviderHttpFailure,
} from "../../../application/services/ProviderFailureClassifier";

interface YouTubeSearchItem {
  id?: {
    videoId?: string;
  };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: {
      high?: { url?: string };
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
}

interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
}

export class YouTubeCatalogAdapter implements MusicCatalogPort {
  constructor(private readonly apiKey: string) {}

  async search(query: string): Promise<Track[]> {
    if (!this.apiKey) {
      throw createMissingCredentialsFailure("youtube", "search", [
        "YOUTUBE_API_KEY",
      ]);
    }

    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("maxResults", "5");
    url.searchParams.set("q", query);
    url.searchParams.set("key", this.apiKey);

    const response = await fetch(url.toString());

    if (!response.ok) {
      const errorText = await response.text();
      throw createProviderHttpFailure(
        "youtube",
        "search",
        response.status,
        errorText,
        response.headers.get("retry-after"),
      );
    }

    const data = (await response.json()) as YouTubeSearchResponse;
    const items = data.items ?? [];

    return items
      .filter((item) => item.id?.videoId && item.snippet?.title)
      .map((item) => {
        const videoId = item.id!.videoId!;
        const snippet = item.snippet!;

        return {
          id: `youtube:${videoId}`,
          provider: "youtube",
          providerTrackId: videoId,
          title: snippet.title ?? "Untitled",
          artist: snippet.channelTitle ?? "Unknown Channel",
          pageUrl: `https://www.youtube.com/watch?v=${videoId}`,
          artworkUrl:
            snippet.thumbnails?.high?.url ??
            snippet.thumbnails?.medium?.url ??
            snippet.thumbnails?.default?.url,
        } satisfies Track;
      });
  }
}

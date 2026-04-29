import { Track } from "../../../domain/entities/Track";
import {
  MusicCatalogPort,
  PlaylistLookupResult,
} from "../../../application/ports/outbound/MusicCatalogPort";
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

interface YouTubePlaylistItem {
  contentDetails?: {
    videoId?: string;
  };
  snippet?: {
    title?: string;
    channelTitle?: string;
    videoOwnerChannelTitle?: string;
    resourceId?: {
      videoId?: string;
    };
    thumbnails?: {
      high?: { url?: string };
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
}

interface YouTubePlaylistItemsResponse {
  nextPageToken?: string;
  items?: YouTubePlaylistItem[];
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

  async getPlaylist(source: string): Promise<PlaylistLookupResult | undefined> {
    const playlistId = this.getPlaylistId(source);

    if (!playlistId) {
      return undefined;
    }

    if (!this.apiKey) {
      throw createMissingCredentialsFailure("youtube", "playlist lookup", [
        "YOUTUBE_API_KEY",
      ]);
    }

    const tracks: Track[] = [];
    let nextPageToken: string | undefined;

    do {
      const response = await fetch(
        this.createPlaylistItemsUrl(playlistId, nextPageToken).toString(),
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw createProviderHttpFailure(
          "youtube",
          "playlist lookup",
          response.status,
          errorText,
          response.headers.get("retry-after"),
        );
      }

      const data = (await response.json()) as YouTubePlaylistItemsResponse;
      tracks.push(...this.toPlaylistTracks(data.items ?? []));
      nextPageToken = data.nextPageToken;
    } while (nextPageToken);

    return {
      title: "YouTube playlist",
      sourceUrl: source,
      tracks,
    };
  }

  private createPlaylistItemsUrl(
    playlistId: string,
    pageToken?: string,
  ): URL {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("key", this.apiKey);

    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    return url;
  }

  private toPlaylistTracks(items: YouTubePlaylistItem[]): Track[] {
    return items
      .map((item) => this.toPlaylistTrack(item))
      .filter((track): track is Track => track !== undefined);
  }

  private toPlaylistTrack(item: YouTubePlaylistItem): Track | undefined {
    const videoId =
      item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
    const title = item.snippet?.title;

    if (!videoId || !title || this.isUnavailablePlaylistTitle(title)) {
      return undefined;
    }

    return {
      id: `youtube:${videoId}`,
      provider: "youtube",
      providerTrackId: videoId,
      title,
      artist:
        item.snippet?.videoOwnerChannelTitle ??
        item.snippet?.channelTitle ??
        "Unknown Channel",
      pageUrl: `https://www.youtube.com/watch?v=${videoId}`,
      artworkUrl:
        item.snippet?.thumbnails?.high?.url ??
        item.snippet?.thumbnails?.medium?.url ??
        item.snippet?.thumbnails?.default?.url,
    };
  }

  private isUnavailablePlaylistTitle(title: string): boolean {
    const normalized = title.trim().toLowerCase();
    return normalized === "deleted video" || normalized === "private video";
  }

  private getPlaylistId(source: string): string | undefined {
    const parsedUrl = this.tryParseUrl(source);

    if (!parsedUrl || !this.isYouTubeUrl(parsedUrl)) {
      return undefined;
    }

    return parsedUrl.searchParams.get("list")?.trim() || undefined;
  }

  private isYouTubeUrl(url: URL): boolean {
    const hostname = url.hostname.toLowerCase();
    return (
      hostname === "youtu.be" ||
      hostname === "youtube.com" ||
      hostname.endsWith(".youtube.com") ||
      hostname === "youtube-nocookie.com" ||
      hostname.endsWith(".youtube-nocookie.com")
    );
  }

  private tryParseUrl(source: string): URL | undefined {
    try {
      return new URL(source);
    } catch {
      return undefined;
    }
  }
}

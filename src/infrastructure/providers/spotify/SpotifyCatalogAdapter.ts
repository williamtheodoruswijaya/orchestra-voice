import { Track } from "../../../domain/entities/Track";
import { MusicCatalogPort } from "../../../application/ports/outbound/MusicCatalogPort";

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SpotifyImage {
  url?: string;
}

interface SpotifyArtist {
  name?: string;
}

interface SpotifyAlbum {
  images?: SpotifyImage[];
}

interface SpotifyTrackItem {
  id?: string;
  name?: string;
  duration_ms?: number;
  artists?: SpotifyArtist[];
  album?: SpotifyAlbum;
  external_urls?: {
    spotify?: string;
  };
}

interface SpotifySearchResponse {
  tracks?: {
    items?: SpotifyTrackItem[];
  };
}

export class SpotifyCatalogAdapter implements MusicCatalogPort {
  private accessToken?: string;
  private accessTokenExpiresAt = 0;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly market: string = "ID",
  ) {}

  private async getAccessToken(): Promise<string> {
    const now = Date.now();

    if (this.accessToken && now < this.accessTokenExpiresAt) {
      return this.accessToken;
    }

    if (!this.clientId || !this.clientSecret) {
      throw new Error(
        "SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET is missing in .env",
      );
    }

    const basicAuth = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString("base64");

    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Spotify token request failed. HTTP ${response.status}. ${errorText}`,
      );
    }

    const data = (await response.json()) as SpotifyTokenResponse;

    this.accessToken = data.access_token;
    this.accessTokenExpiresAt = now + Math.max(data.expires_in - 60, 30) * 1000;

    return this.accessToken;
  }

  private toTrack(item: SpotifyTrackItem): Track {
    const artistNames =
      item.artists
        ?.map((artist) => artist.name)
        .filter(Boolean)
        .join(", ") ?? "Unknown Artist";

    return {
      id: `spotify:${item.id}`,
      provider: "spotify",
      providerTrackId: item.id!,
      title: item.name ?? "Untitled",
      artist: artistNames,
      durationMs: item.duration_ms,
      pageUrl: item.external_urls?.spotify,
      artworkUrl: item.album?.images?.[0]?.url,
    };
  }

  async search(query: string): Promise<Track[]> {
    const accessToken = await this.getAccessToken();

    const url = new URL("https://api.spotify.com/v1/search");
    url.searchParams.set("q", query);
    url.searchParams.set("type", "track");
    url.searchParams.set("limit", "5");
    url.searchParams.set("market", this.market);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Spotify search failed. HTTP ${response.status}. ${errorText}`,
      );
    }

    const data = (await response.json()) as SpotifySearchResponse;
    const items = data.tracks?.items ?? [];

    return items
      .filter((item) => item.id && item.name)
      .map((item) => this.toTrack(item));
  }

  async getTrackById(trackId: string): Promise<Track> {
    const accessToken = await this.getAccessToken();

    const url = new URL(
      `https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`,
    );
    url.searchParams.set("market", this.market);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Spotify track lookup failed. HTTP ${response.status}. ${errorText}`,
      );
    }

    const item = (await response.json()) as SpotifyTrackItem;

    if (!item.id || !item.name) {
      throw new Error("Spotify track response did not include a playable track.");
    }

    return this.toTrack(item);
  }
}

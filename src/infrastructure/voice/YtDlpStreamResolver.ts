import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import type { Track } from "../../domain/entities/Track";
import type {
  AudioSourceDescriptor,
  ResolvedAudioSource,
  StreamResolverPort,
} from "../../application/ports/outbound/StreamResolverPort";
import { SpotifyCatalogAdapter } from "../providers/spotify/SpotifyCatalogAdapter";

const SPOTIFY_TRACK_ID = /^[A-Za-z0-9]{22}$/;
const YT_DLP_TIMEOUT_MS = 20_000;
const YOUTUBE_AUDIO_FORMAT =
  "bestaudio[ext=webm][acodec=opus]/bestaudio[acodec=opus]/bestaudio";

interface YtDlpStreamResolverOptions {
  spotifyCatalog?: SpotifyCatalogAdapter;
  ytDlpPath?: string;
}

interface YtDlpProbeResult {
  title: string;
  sourceUrl?: string;
}

export class YtDlpStreamResolver implements StreamResolverPort {
  private readonly ytDlpPath: string;

  constructor(private readonly options: YtDlpStreamResolverOptions = {}) {
    this.ytDlpPath =
      options.ytDlpPath?.trim() || process.env.YT_DLP_PATH?.trim() || "yt-dlp";
  }

  async describe(source: string | Track): Promise<AudioSourceDescriptor> {
    if (typeof source !== "string") {
      return {
        title: this.formatTrackTitle(source),
        sourceUrl: source.pageUrl,
      };
    }

    const trimmedSource = source.trim();

    if (!trimmedSource) {
      throw new Error("Playback source cannot be empty.");
    }

    const parsedUrl = this.tryParseUrl(trimmedSource);
    const spotifyTrackId = this.getSpotifyTrackId(trimmedSource);

    if (spotifyTrackId) {
      const track = await this.getSpotifyTrack(spotifyTrackId);
      return {
        title: this.formatTrackTitle(track),
        sourceUrl: track.pageUrl,
      };
    }

    if (
      trimmedSource.startsWith("spotify:") ||
      (parsedUrl && this.isSpotifyUrl(parsedUrl))
    ) {
      throw new Error("Only Spotify track URLs are supported for playback.");
    }

    if (parsedUrl && !this.isYouTubeUrl(parsedUrl)) {
      return {
        title: trimmedSource,
        sourceUrl: trimmedSource,
      };
    }

    if (parsedUrl && this.isYouTubeUrl(parsedUrl)) {
      return this.probe(trimmedSource, trimmedSource);
    }

    return this.probe(`ytsearch1:${trimmedSource}`, trimmedSource);
  }

  async resolve(source: string | Track): Promise<ResolvedAudioSource> {
    if (typeof source !== "string") {
      return this.resolveTrack(source);
    }

    const trimmedSource = source.trim();

    if (!trimmedSource) {
      throw new Error("Playback source cannot be empty.");
    }

    const parsedUrl = this.tryParseUrl(trimmedSource);
    const spotifyTrackId = this.getSpotifyTrackId(trimmedSource);

    if (spotifyTrackId) {
      const track = await this.getSpotifyTrack(spotifyTrackId);
      return this.resolveSpotifyTrack(track);
    }

    if (
      trimmedSource.startsWith("spotify:") ||
      (parsedUrl && this.isSpotifyUrl(parsedUrl))
    ) {
      throw new Error("Only Spotify track URLs are supported for playback.");
    }

    if (parsedUrl && this.isYouTubeUrl(parsedUrl)) {
      return this.resolveWithYtDlp(trimmedSource, trimmedSource);
    }

    if (parsedUrl) {
      return {
        title: trimmedSource,
        sourceUrl: trimmedSource,
        url: trimmedSource,
      };
    }

    return this.resolveWithYtDlp(
      `ytsearch1:${trimmedSource}`,
      trimmedSource,
    );
  }

  private async resolveTrack(track: Track): Promise<ResolvedAudioSource> {
    if (track.provider === "spotify") {
      return this.resolveSpotifyTrack(track);
    }

    if (track.provider === "youtube" && track.pageUrl) {
      return this.resolveWithYtDlp(track.pageUrl, this.formatTrackTitle(track));
    }

    if (track.provider === "direct" && track.pageUrl) {
      return {
        title: this.formatTrackTitle(track),
        sourceUrl: track.pageUrl,
        url: track.pageUrl,
      };
    }

    throw new Error(`Cannot resolve a playable source for ${track.title}.`);
  }

  private async resolveSpotifyTrack(track: Track): Promise<ResolvedAudioSource> {
    const searchQuery = `${track.title} ${track.artist ?? ""} official audio`;
    return this.resolveWithYtDlp(
      `ytsearch1:${searchQuery}`,
      this.formatTrackTitle(track),
      track.pageUrl,
    );
  }

  private async resolveWithYtDlp(
    ytDlpInput: string,
    fallbackTitle: string,
    originalSourceUrl?: string,
  ): Promise<ResolvedAudioSource> {
    const probe = await this.probe(ytDlpInput, fallbackTitle);
    const title = originalSourceUrl ? fallbackTitle : probe.title;
    const stream = await this.createStream(ytDlpInput);

    return {
      title,
      sourceUrl: originalSourceUrl ?? probe.sourceUrl ?? ytDlpInput,
      stream,
    };
  }

  private async probe(
    ytDlpInput: string,
    fallbackTitle: string,
  ): Promise<YtDlpProbeResult> {
    const output = await this.runYtDlp([
      "--no-playlist",
      "--print",
      "title",
      "--print",
      "webpage_url",
      "--skip-download",
      ytDlpInput,
    ]);

    const [title, sourceUrl] = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    return {
      title: title || fallbackTitle,
      sourceUrl,
    };
  }

  private async createStream(ytDlpInput: string): Promise<PassThrough> {
    const stream = new PassThrough();
    const child = spawn(
      this.ytDlpPath,
      [
        "--no-playlist",
        "--format",
        YOUTUBE_AUDIO_FORMAT,
        "--output",
        "-",
        "--no-progress",
        ytDlpInput,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    let stderr = "";

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = this.truncateErrorOutput(stderr + chunk);
    });

    child.stdout.on("error", (error) => {
      stream.destroy(error);
    });
    child.stdout.pipe(stream, { end: false });

    child.once("close", (code) => {
      if (code === 0) {
        stream.end();
        return;
      }

      stream.destroy(
        new Error(`yt-dlp failed to stream audio. ${this.cleanError(stderr)}`),
      );
    });

    stream.once("close", () => {
      if (!child.killed) {
        child.kill();
      }
    });

    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", (error) => {
        stream.destroy(error);
        reject(this.toYtDlpError(error));
      });
    });

    return stream;
  }

  private async runYtDlp(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.ytDlpPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";
      let settled = false;

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (!child.killed) {
          child.kill();
        }
        reject(new Error("yt-dlp timed out while resolving the audio source."));
      }, YT_DLP_TIMEOUT_MS);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout = this.truncateErrorOutput(stdout + chunk);
      });
      child.stderr.on("data", (chunk: string) => {
        stderr = this.truncateErrorOutput(stderr + chunk);
      });

      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(this.toYtDlpError(error));
      });

      child.once("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);

        if (code === 0) {
          resolve(stdout);
          return;
        }

        reject(
          new Error(`yt-dlp failed to resolve audio. ${this.cleanError(stderr)}`),
        );
      });
    });
  }

  private async getSpotifyTrack(trackId: string): Promise<Track> {
    if (!this.options.spotifyCatalog) {
      throw new Error(
        "Spotify playback requires SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.",
      );
    }

    return this.options.spotifyCatalog.getTrackById(trackId);
  }

  private getSpotifyTrackId(source: string): string | undefined {
    if (source.startsWith("spotify:track:")) {
      const trackId = source.slice("spotify:track:".length);
      return SPOTIFY_TRACK_ID.test(trackId) ? trackId : undefined;
    }

    const parsedUrl = this.tryParseUrl(source);

    if (!parsedUrl || !parsedUrl.hostname.endsWith("spotify.com")) {
      return undefined;
    }

    const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
    const trackSegmentIndex = pathSegments.indexOf("track");
    const trackId = pathSegments[trackSegmentIndex + 1];

    if (!trackId || !SPOTIFY_TRACK_ID.test(trackId)) {
      return undefined;
    }

    return trackId;
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

  private isSpotifyUrl(url: URL): boolean {
    return url.hostname.toLowerCase().endsWith("spotify.com");
  }

  private tryParseUrl(source: string): URL | undefined {
    try {
      return new URL(source);
    } catch {
      return undefined;
    }
  }

  private formatTrackTitle(track: Track): string {
    return track.artist ? `${track.title} - ${track.artist}` : track.title;
  }

  private toYtDlpError(error: Error): Error {
    if ("code" in error && error.code === "ENOENT") {
      return new Error(
        "yt-dlp was not found. Install yt-dlp and make it available on PATH, or set YT_DLP_PATH in .env.",
      );
    }

    return error;
  }

  private cleanError(errorOutput: string): string {
    return errorOutput.trim() || "No additional error output was provided.";
  }

  private truncateErrorOutput(output: string): string {
    return output.length > 4_000 ? output.slice(-4_000) : output;
  }
}

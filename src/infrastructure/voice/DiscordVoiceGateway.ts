import { Readable } from "node:stream";
import {
  AudioPlayer,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
} from "@discordjs/voice";
import {
  JoinVoiceRequest,
  PlayAudioRequest,
  VoiceGatewayPort,
} from "../../application/ports/outbound/VoiceGatewayPort";

function validateAudioUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL provided.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed.");
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  const blockedHostnames = ["localhost", "ip6-localhost", "ip6-loopback"];
  if (blockedHostnames.includes(hostname)) {
    throw new Error("Requests to private or internal addresses are not allowed.");
  }

  const ipv4Parts = hostname.split(".");
  if (
    ipv4Parts.length === 4 &&
    ipv4Parts.every((p) => /^\d+$/.test(p))
  ) {
    const octets = ipv4Parts.map(Number);
    if (octets.some((o) => o > 255)) {
      throw new Error("Invalid IP address.");
    }
    const [a, b] = octets;
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    ) {
      throw new Error(
        "Requests to private or internal addresses are not allowed.",
      );
    }
  }

  if (
    hostname === "::1" ||
    hostname === "::" ||
    /^fe80:[0-9a-f:]+$/i.test(hostname) ||
    /^f[cd][0-9a-f]{2}:[0-9a-f:]+$/i.test(hostname)
  ) {
    throw new Error("Requests to private or internal addresses are not allowed.");
  }

  return parsed;
}

export class DiscordVoiceGateway implements VoiceGatewayPort {
  private readonly players = new Map<string, AudioPlayer>();
  private readonly playbackFinishedListeners: Array<
    (guildId: string) => void | Promise<void>
  > = [];

  private getOrCreatePlayer(guildId: string): AudioPlayer {
    const existingPlayer = this.players.get(guildId);

    if (existingPlayer) {
      return existingPlayer;
    }

    const player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
      },
    });

    player.on(AudioPlayerStatus.Playing, () => {
      console.log(`[Voice:${guildId}] Audio started playing.`);
    });

    player.on(AudioPlayerStatus.Idle, () => {
      console.log(`[Voice:${guildId}] Audio player is idle.`);
      void this.notifyPlaybackFinished(guildId);
    });

    player.on("error", (error) => {
      console.error(`[Voice:${guildId}] Audio player error:`, error.message);
    });

    this.players.set(guildId, player);
    return player;
  }

  private async notifyPlaybackFinished(guildId: string): Promise<void> {
    await Promise.all(
      this.playbackFinishedListeners.map(async (listener) => listener(guildId)),
    );
  }

  async join(request: JoinVoiceRequest): Promise<void> {
    const existingConnection = getVoiceConnection(request.guildId);

    if (existingConnection) {
      const currentChannelId = existingConnection.joinConfig.channelId;

      if (currentChannelId === request.channelId) {
        const player = this.getOrCreatePlayer(request.guildId);
        existingConnection.subscribe(player);
        return;
      }

      existingConnection.destroy();
    }

    const connection = joinVoiceChannel({
      guildId: request.guildId,
      channelId: request.channelId,
      adapterCreator: request.adapterCreator,
      selfDeaf: true,
    });

    if (process.env.DISCORD_VOICE_DEBUG === "true") {
      connection.on("stateChange", (oldState, newState) => {
        console.log(
          `[Voice:${request.guildId}] ${oldState.status} -> ${newState.status}`,
        );
      });
    }

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch {
      connection.destroy();
      throw new Error(
        "Failed to join the voice channel. Check bot permissions, channel access, and network/firewall.",
      );
    }

    const player = this.getOrCreatePlayer(request.guildId);
    connection.subscribe(player);
  }

  async play(request: PlayAudioRequest): Promise<void> {
    const connection = getVoiceConnection(request.guildId);

    if (!connection) {
      throw new Error(
        "Bot is not connected to a voice channel yet. Use /join first.",
      );
    }

    let input: Readable | string;

    if (request.stream) {
      input = request.stream;
    } else if (request.url) {
      input = validateAudioUrl(request.url).toString();
    } else {
      throw new Error("No playable audio source was resolved.");
    }

    const resource = createAudioResource(input, {
      inputType: StreamType.Arbitrary,
      metadata: {
        title: request.title,
        sourceUrl: request.sourceUrl,
      },
    });

    const player = this.getOrCreatePlayer(request.guildId);
    connection.subscribe(player);
    player.play(resource);

    try {
      await entersState(player, AudioPlayerStatus.Playing, 20_000);
    } catch {
      throw new Error(
        "Audio source was resolved, but playback did not start. Check yt-dlp, ffmpeg, and the source URL.",
      );
    }
  }

  async leave(guildId: string): Promise<void> {
    const player = this.players.get(guildId);

    if (player) {
      player.stop(true);
      this.players.delete(guildId);
    }

    const connection = getVoiceConnection(guildId);

    if (connection) {
      connection.destroy();
    }
  }

  async stop(guildId: string): Promise<void> {
    const player = this.players.get(guildId);

    if (player) {
      player.stop(true);
    }
  }

  async pause(guildId: string): Promise<boolean> {
    const player = this.players.get(guildId);
    return player?.pause() ?? false;
  }

  async resume(guildId: string): Promise<boolean> {
    const player = this.players.get(guildId);
    return player?.unpause() ?? false;
  }

  onPlaybackFinished(
    listener: (guildId: string) => void | Promise<void>,
  ): void {
    this.playbackFinishedListeners.push(listener);
  }
}

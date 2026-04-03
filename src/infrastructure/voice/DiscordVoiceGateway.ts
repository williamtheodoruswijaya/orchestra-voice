import {
  AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  demuxProbe,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import {
  JoinVoiceRequest,
  PlayAudioRequest,
  VoiceGatewayPort,
} from "../../application/ports/outbound/VoiceGatewayPort";
import { Readable } from "node:stream";

const FETCH_TIMEOUT_MS = 10_000;
// Covers RFC-1918, loopback, link-local (IPv4 + IPv6), and IPv6 ULA ranges.
// Note: hostname-only validation cannot fully prevent DNS-rebinding attacks.
const PRIVATE_IP_PATTERN =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|[fF][cCdD][0-9a-fA-F]{2}:|[fF][eE]80:)/i;

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

  const hostname = parsed.hostname;
  if (PRIVATE_IP_PATTERN.test(hostname)) {
    throw new Error("URLs pointing to private or loopback addresses are not allowed.");
  }

  return parsed;
}

export class DiscordVoiceGateway implements VoiceGatewayPort {
  private readonly players = new Map<string, AudioPlayer>();

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
    });

    player.on("error", (error) => {
      console.error(`[Voice:${guildId}] Audio player error:`, error.message);
    });

    this.players.set(guildId, player);
    return player;
  }

  async join(request: JoinVoiceRequest): Promise<void> {
    const existingConnection = getVoiceConnection(request.guildId);

    if (existingConnection) {
      existingConnection.destroy();
    }

    const connection = joinVoiceChannel({
      guildId: request.guildId,
      channelId: request.channelId,
      adapterCreator: request.adapterCreator,
      selfDeaf: true,
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

    const player = this.getOrCreatePlayer(request.guildId);
    connection.subscribe(player);
  }

  async play(request: PlayAudioRequest): Promise<void> {
    const connection = getVoiceConnection(request.guildId);

    if (!connection) {
      throw new Error("Bot is not connected to a voice channel in this guild.");
    }

    const validatedUrl = validateAudioUrl(request.url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(validatedUrl.toString(), { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch audio from URL: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("Response body is null.");
    }

    const inputStream = Readable.fromWeb(
      response.body as ReadableStream<Uint8Array>,
    );
    const { stream, type } = await demuxProbe(inputStream);

    const resource = createAudioResource(stream, {
      inputType: type,
      metadata: { title: request.title ?? request.url },
    });

    const player = this.getOrCreatePlayer(request.guildId);
    connection.subscribe(player);
    player.play(resource);
  }

  async leave(guildId: string): Promise<void> {
    const player = this.players.get(guildId);
    if (player) {
      player.stop();
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
}

import { Readable } from "node:stream";
import {
  AudioPlayer,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  demuxProbe,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
} from "@discordjs/voice";
import {
  JoinVoiceRequest,
  PlayAudioRequest,
  VoiceGatewayPort,
} from "../../application/ports/outbound/VoiceGatewayPort";

const AUDIO_FETCH_TIMEOUT_MS = 10_000;

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
    const [a, b] = ipv4Parts.map(Number);
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
    hostname.startsWith("fe80:") ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd")
  ) {
    throw new Error("Requests to private or internal addresses are not allowed.");
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

    const validatedUrl = validateAudioUrl(request.url);

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      AUDIO_FETCH_TIMEOUT_MS,
    );

    let response: Response;
    try {
      response = await fetch(validatedUrl.toString(), {
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Audio fetch timed out. Please try again.");
      }
      throw new Error(
        `Failed to fetch audio URL. ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(
        `Failed to fetch audio URL. HTTP status: ${response.status}`,
      );
    }

    if (!response.body) {
      throw new Error("Audio response does not contain a readable body.");
    }

    const inputStream = Readable.fromWeb(
      response.body as unknown as Parameters<typeof Readable.fromWeb>[0],
    );
    const { stream, type } = await demuxProbe(inputStream);

    const resource = createAudioResource(stream, {
      inputType: type,
      metadata: {
        title: request.title ?? request.url,
      },
    });

    const player = this.getOrCreatePlayer(request.guildId);
    connection.subscribe(player);
    player.play(resource);
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
}

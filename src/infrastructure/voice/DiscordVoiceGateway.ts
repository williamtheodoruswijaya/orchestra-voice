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

    connection.on("stateChange", (oldState, newState) => {
      console.log(
        `[Voice:${request.guildId}] ${oldState.status} -> ${newState.status}`,
      );
    });

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

    const response = await fetch(request.url);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch audio URL. HTTP status: ${response.status}`,
      );
    }

    if (!response.body) {
      throw new Error("Audio response does not contain a readable body.");
    }

    const inputStream = Readable.fromWeb(
      response.body as unknown as ReadableStream<Uint8Array>,
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

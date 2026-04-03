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

    const response = await fetch(request.url);

    if (!response.ok) {
      throw new Error(`Failed to fetch audio from URL: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("Response body is null.");
    }

    const inputStream = Readable.fromWeb(response.body as any);
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

import {
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import {
  JoinVoiceRequest,
  VoiceGatewayPort,
} from "../../application/ports/outbound/VoiceGatewayPort";

export class DiscordVoiceGateway implements VoiceGatewayPort {
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
  }

  async leave(guildId: string): Promise<void> {
    const connection = getVoiceConnection(guildId);

    if (connection) {
      connection.destroy();
    }
  }

  async stop(_guildId: string): Promise<void> {
    // Nanti akan kita isi saat audio player sudah dibuat.
  }
}

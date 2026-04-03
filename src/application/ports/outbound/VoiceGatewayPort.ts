import type { DiscordGatewayAdapterCreator } from "@discordjs/voice";

export interface JoinVoiceRequest {
  guildId: string;
  channelId: string;
  adapterCreator: DiscordGatewayAdapterCreator;
}

export interface PlayAudioRequest {
  guildId: string;
  url: string;
  title?: string;
}

export interface VoiceGatewayPort {
  join(request: JoinVoiceRequest): Promise<void>;
  play(request: PlayAudioRequest): Promise<void>;
  leave(guildId: string): Promise<void>;
  stop(guildId: string): Promise<void>;
}

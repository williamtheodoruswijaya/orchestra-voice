import type { DiscordGatewayAdapterCreator } from "@discordjs/voice";
import type { Readable } from "node:stream";

export interface JoinVoiceRequest {
  guildId: string;
  channelId: string;
  adapterCreator: DiscordGatewayAdapterCreator;
}

export interface PlayAudioRequest {
  guildId: string;
  title: string;
  sourceUrl?: string;
  stream?: Readable;
  url?: string;
}

export interface VoiceGatewayPort {
  join(request: JoinVoiceRequest): Promise<void>;
  play(request: PlayAudioRequest): Promise<void>;
  leave(guildId: string): Promise<void>;
  stop(guildId: string): Promise<void>;
}

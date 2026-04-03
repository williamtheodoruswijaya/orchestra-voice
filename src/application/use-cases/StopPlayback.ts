import { VoiceGatewayPort } from "../ports/outbound/VoiceGatewayPort";

export class StopPlayback {
  constructor(private readonly voiceGateway: VoiceGatewayPort) {}

  async execute(guildId: string): Promise<void> {
    await this.voiceGateway.stop(guildId);
  }
}

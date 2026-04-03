import { VoiceGatewayPort } from "../ports/outbound/VoiceGatewayPort";

export class LeaveVoiceChannel {
  constructor(private readonly voiceGateway: VoiceGatewayPort) {}

  async execute(guildId: string): Promise<void> {
    await this.voiceGateway.leave(guildId);
  }
}

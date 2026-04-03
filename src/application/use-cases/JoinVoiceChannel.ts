import {
  JoinVoiceRequest,
  VoiceGatewayPort,
} from "../ports/outbound/VoiceGatewayPort";

export class JoinVoiceChannel {
  constructor(private readonly voiceGateway: VoiceGatewayPort) {}

  async execute(request: JoinVoiceRequest): Promise<void> {
    await this.voiceGateway.join(request);
  }
}

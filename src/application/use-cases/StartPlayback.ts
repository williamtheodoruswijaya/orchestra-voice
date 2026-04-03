import {
  PlayAudioRequest,
  VoiceGatewayPort,
} from "../ports/outbound/VoiceGatewayPort";

export class StartPlayback {
  constructor(private readonly voiceGateway: VoiceGatewayPort) {}

  async execute(request: PlayAudioRequest): Promise<void> {
    await this.voiceGateway.play(request);
  }
}

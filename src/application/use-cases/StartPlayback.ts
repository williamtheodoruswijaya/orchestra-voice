import {
  VoiceGatewayPort,
} from "../ports/outbound/VoiceGatewayPort";
import type { Track } from "../../domain/entities/Track";
import type {
  ResolvedAudioSource,
  StreamResolverPort,
} from "../ports/outbound/StreamResolverPort";

interface StartPlaybackInput {
  guildId: string;
  source: string | Track;
}

export class StartPlayback {
  constructor(
    private readonly voiceGateway: VoiceGatewayPort,
    private readonly streamResolver: StreamResolverPort,
  ) {}

  async execute(input: StartPlaybackInput): Promise<ResolvedAudioSource> {
    const resolvedAudioSource = await this.streamResolver.resolve(input.source);

    await this.voiceGateway.play({
      guildId: input.guildId,
      ...resolvedAudioSource,
    });

    return resolvedAudioSource;
  }
}

import { StreamResolverPort } from "../ports/outbound/StreamResolverPort";
import { VoiceGatewayPort } from "../ports/outbound/VoiceGatewayPort";
import {
  AdvancePlaybackResult,
  PlaybackQueueService,
} from "../services/PlaybackQueueService";

export class SkipTrack {
  constructor(
    private readonly playbackQueueService: PlaybackQueueService,
    private readonly voiceGateway: VoiceGatewayPort,
    private readonly streamResolver: StreamResolverPort,
  ) {}

  async execute(guildId: string): Promise<AdvancePlaybackResult> {
    const result = await this.playbackQueueService.skip(guildId);
    const nextTrack = result.nextItem?.track;
    if (nextTrack) {
      try {
        const trackSource = (nextTrack as unknown as { source: string }).source;
        const resolvedAudioSource =
          await this.streamResolver.resolve(trackSource);

        await this.voiceGateway.play({
          guildId: guildId,
          ...resolvedAudioSource,
        });
      } catch (error) {
        console.error("Gagal memutar lagu setelah di-skip:", error);
        // Opsional: Kamu bisa panggil skip lagi di sini kalau error, agar lanjut ke lagu depannya
      }
    } else {
      // 3. Jika antrean habis setelah di-skip, hentikan player
      this.voiceGateway.stop(guildId); // atau this.voiceGateway.disconnect(guildId)
    }
    return result;
  }
}

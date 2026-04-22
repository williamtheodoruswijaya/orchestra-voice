import type { Readable } from "node:stream";
import type { Track } from "../../../domain/entities/Track";

export interface ResolvedAudioSource {
  title: string;
  sourceUrl?: string;
  stream?: Readable;
  url?: string;
}

export interface StreamResolverPort {
  resolve(source: string | Track): Promise<ResolvedAudioSource>;
}

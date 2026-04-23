import type { Readable } from "node:stream";
import type { Track } from "../../../domain/entities/Track";

export interface AudioSourceDescriptor {
  title: string;
  sourceUrl?: string;
}

export interface ResolvedAudioSource {
  title: string;
  sourceUrl?: string;
  stream?: Readable;
  url?: string;
}

export interface StreamResolverPort {
  describe?(source: string | Track): Promise<AudioSourceDescriptor>;
  resolve(source: string | Track): Promise<ResolvedAudioSource>;
}

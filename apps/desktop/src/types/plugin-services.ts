export interface CompilerFile {
  name: string;
  bytes: Uint8Array;
}

export type CompilerRequest =
  | { kind: "tailwind"; source: string; language: string }
  | {
      kind: "ffmpeg";
      files: CompilerFile[];
      args: string[];
      outputs: { name: string; mimeType: string }[];
    };

export type CompilerReply<T> =
  { ok: true; value: T } | { ok: false; name: string; message: string };

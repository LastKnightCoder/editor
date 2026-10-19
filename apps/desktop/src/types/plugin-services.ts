export interface CompilerFile {
  name: string;
  bytes: Uint8Array;
}

export type CompilerRequest =
  | { kind: "tailwind"; source: string; language: string }
  | { kind: "typst"; source: string; inputs: Record<string, string>; files: CompilerFile[] }
  | {
      kind: "ffmpeg";
      files: CompilerFile[];
      args: string[];
      outputs: { name: string; mimeType: string }[];
    };

export type CompilerReply<T> =
  { ok: true; value: T } | { ok: false; name: string; message: string };

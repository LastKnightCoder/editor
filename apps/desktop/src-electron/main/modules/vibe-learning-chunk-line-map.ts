import { smartChunkWithRanges } from "../utils/smart-chunk";

export interface ChunkLineMapItem {
  text: string;
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
  charCount: number;
}

export interface ChunkLineMapOptions {
  minLength: number;
  maxLength: number;
  overlap: number;
  splitter: "sentence" | "paragraph";
}

export const buildChunkLineMap = (
  markdown: string,
  options: ChunkLineMapOptions,
): ChunkLineMapItem[] => {
  return smartChunkWithRanges(markdown, options);
};

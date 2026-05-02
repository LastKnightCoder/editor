import { smartChunk } from "../utils/smart-chunk";

export interface ChunkLineMapItem {
  text: string;
  startLine: number;
  endLine: number;
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
  const chunks = smartChunk(markdown, options);
  const lines = markdown.split("\n");
  const items: ChunkLineMapItem[] = [];
  let cursor = 0;

  for (const chunkText of chunks) {
    const chunkLength = chunkText.length;
    const startOffset = markdown.indexOf(chunkText, cursor);
    const resolvedStart = startOffset >= 0 ? startOffset : cursor;
    const endOffset = resolvedStart + chunkLength;
    const startLine = markdown.slice(0, resolvedStart).split("\n").length;
    const endLine = markdown.slice(0, endOffset).split("\n").length;

    items.push({
      text: chunkText,
      startLine,
      endLine: Math.min(endLine, lines.length),
    });

    cursor = endOffset;
  }

  return items;
};

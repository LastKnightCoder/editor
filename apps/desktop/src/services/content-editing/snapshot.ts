import { Descendant } from "slate";
import { getMarkdownWithPositions } from "@/utils/markdown-helper";
import type { ContentSnapshot, MarkdownPoint, SnapshotSource } from "./types";

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export const hashMarkdown = (text: string): string => {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = (hash * FNV_PRIME) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

export const buildLineOffsets = (markdown: string): number[] => {
  const offsets: number[] = [0];
  for (let i = 0; i < markdown.length; i += 1) {
    if (markdown[i] === "\n") {
      offsets.push(i + 1);
    }
  }
  return offsets;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const markdownPointToOffset = (
  point: MarkdownPoint,
  lineOffsets: number[],
  markdownLength: number,
): number => {
  if (lineOffsets.length === 0) return 0;
  const line = clamp(point.line, 0, lineOffsets.length - 1);
  const lineStart = lineOffsets[line];
  const nextLineStart =
    line + 1 < lineOffsets.length ? lineOffsets[line + 1] : markdownLength;
  const maxCh = Math.max(0, nextLineStart - lineStart);
  const ch = clamp(point.ch, 0, maxCh);
  return clamp(lineStart + ch, 0, markdownLength);
};

export const offsetToMarkdownPoint = (
  offset: number,
  lineOffsets: number[],
): MarkdownPoint => {
  if (lineOffsets.length === 0) {
    return { line: 0, ch: 0 };
  }

  const safeOffset = Math.max(0, offset);
  let line = 0;
  for (let i = 0; i < lineOffsets.length; i += 1) {
    if (lineOffsets[i] > safeOffset) {
      break;
    }
    line = i;
  }
  return {
    line,
    ch: safeOffset - lineOffsets[line],
  };
};

export const createContentSnapshot = (
  content: Descendant[],
  source: SnapshotSource,
): ContentSnapshot => {
  const { markdown, positionMap } = getMarkdownWithPositions(content);
  const lineOffsets = buildLineOffsets(markdown);
  const hash = hashMarkdown(markdown);
  const createdAt = Date.now();

  return {
    id: `${createdAt}-${hash}`,
    createdAt,
    content,
    markdown,
    hash,
    lineOffsets,
    positionMap,
    source,
  };
};

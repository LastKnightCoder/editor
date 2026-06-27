export interface SmartChunkOptions {
  minLength?: number;
  maxLength?: number;
  overlap?: number;
  splitter?: "paragraph" | "sentence";
}

export interface SmartChunkRange {
  text: string;
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
  charCount: number;
}

interface BreakPoint {
  pos: number;
  score: number;
}

interface CodeFenceRegion {
  start: number;
  end: number;
}

const DEFAULT_MIN_LENGTH = 500;
const DEFAULT_MAX_LENGTH = 2000;
const DEFAULT_WINDOW = 800;

const PARAGRAPH_BREAK_PATTERNS: Array<[RegExp, number]> = [
  [/\n#{1}(?!#)/g, 100],
  [/\n#{2}(?!#)/g, 90],
  [/\n#{3}(?!#)/g, 80],
  [/\n```/g, 80],
  [/\n(?:---|\*\*\*|___)\s*\n/g, 60],
  [/\n\n+/g, 30],
  [/\n[-*]\s/g, 10],
  [/\n\d+\.\s/g, 10],
  [/\n/g, 2],
];

const SENTENCE_BREAK_PATTERNS: Array<[RegExp, number]> = [
  [/[。！？!?]+(?:\s+|$)/g, 90],
  [/[.;；]+(?:\s+|$)/g, 60],
  [/\n\n+/g, 50],
  [/\n/g, 20],
  [/[，,:：]+(?:\s+|$)/g, 5],
];

export function smartChunk(
  content: string,
  options: SmartChunkOptions = {},
): string[] {
  return smartChunkWithRanges(content, options).map((chunk) => chunk.text);
}

export function smartChunkWithRanges(
  content: string,
  options: SmartChunkOptions = {},
): SmartChunkRange[] {
  const rawContent = content || "";
  const leadingTrimLength = rawContent.length - rawContent.trimStart().length;
  const normalizedContent = rawContent.trim();
  if (!normalizedContent) {
    return [];
  }

  const maxLength = Math.max(1, options.maxLength || DEFAULT_MAX_LENGTH);
  const minLength = Math.max(
    1,
    Math.min(options.minLength || DEFAULT_MIN_LENGTH, maxLength),
  );
  const overlap = Math.max(0, Math.min(options.overlap || 0, maxLength - 1));
  const windowSize = Math.max(
    120,
    Math.min(DEFAULT_WINDOW, Math.floor(maxLength * 0.35)),
  );
  const splitter = options.splitter || "paragraph";

  if (normalizedContent.length <= maxLength) {
    return [
      buildRangeChunk(
        normalizedContent,
        leadingTrimLength,
        leadingTrimLength + normalizedContent.length,
        rawContent,
      ),
    ];
  }

  const breakPoints = scanBreakPoints(normalizedContent, splitter);
  const codeFences = findCodeFences(normalizedContent);

  const chunks: SmartChunkRange[] = [];
  let charPos = 0;

  while (charPos < normalizedContent.length) {
    const targetEnd = Math.min(charPos + maxLength, normalizedContent.length);
    let endPos = targetEnd;

    if (targetEnd < normalizedContent.length) {
      const bestCutoff = findBestCutoff(
        breakPoints,
        targetEnd,
        windowSize,
        codeFences,
        charPos,
      );
      if (bestCutoff > charPos && bestCutoff <= targetEnd) {
        endPos = bestCutoff;
      }
    }

    if (endPos <= charPos) {
      endPos = Math.min(charPos + maxLength, normalizedContent.length);
    }

    const rawChunkText = normalizedContent.slice(charPos, endPos);
    const trimStartOffset =
      rawChunkText.length - rawChunkText.trimStart().length;
    const trimEndOffset = rawChunkText.trimEnd().length;
    const chunkText = rawChunkText.trim();
    if (chunkText) {
      const sourceStart = leadingTrimLength + charPos + trimStartOffset;
      const sourceEnd = leadingTrimLength + charPos + trimEndOffset;
      chunks.push(
        buildRangeChunk(chunkText, sourceStart, sourceEnd, rawContent),
      );
    }

    if (endPos >= normalizedContent.length) {
      break;
    }

    const nextPos = endPos - overlap;
    charPos = nextPos > charPos ? nextPos : endPos;
  }

  return mergeSmallChunks(chunks, minLength, maxLength);
}

function buildRangeChunk(
  text: string,
  startOffset: number,
  endOffset: number,
  source: string,
): SmartChunkRange {
  return {
    text,
    startOffset,
    endOffset,
    startLine: offsetToLine(source, startOffset),
    endLine: offsetToLine(source, endOffset),
    charCount: endOffset - startOffset,
  };
}

function offsetToLine(source: string, offset: number): number {
  const safeOffset = Math.max(0, Math.min(offset, source.length));
  let line = 1;
  for (let index = 0; index < safeOffset; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1;
    }
  }
  return line;
}

function scanBreakPoints(
  content: string,
  splitter: "paragraph" | "sentence",
): BreakPoint[] {
  const patterns =
    splitter === "sentence"
      ? SENTENCE_BREAK_PATTERNS
      : PARAGRAPH_BREAK_PATTERNS;
  const points = new Map<number, BreakPoint>();

  for (const [pattern, score] of patterns) {
    for (const match of content.matchAll(pattern)) {
      const pos = match.index;
      if (typeof pos !== "number") continue;
      const endPos = pos + match[0].length;
      const existing = points.get(endPos);
      if (!existing || score > existing.score) {
        points.set(endPos, {
          pos: endPos,
          score,
        });
      }
    }
  }

  return Array.from(points.values()).sort(
    (left, right) => left.pos - right.pos,
  );
}

function findCodeFences(content: string): CodeFenceRegion[] {
  const regions: CodeFenceRegion[] = [];
  const fencePattern = /\n```/g;
  let inFence = false;
  let fenceStart = 0;

  for (const match of content.matchAll(fencePattern)) {
    const pos = match.index;
    if (typeof pos !== "number") continue;
    if (!inFence) {
      fenceStart = pos;
      inFence = true;
    } else {
      regions.push({
        start: fenceStart,
        end: pos + match[0].length,
      });
      inFence = false;
    }
  }

  if (inFence) {
    regions.push({
      start: fenceStart,
      end: content.length,
    });
  }
  return regions;
}

function findBestCutoff(
  breakPoints: BreakPoint[],
  targetPos: number,
  windowSize: number,
  codeFences: CodeFenceRegion[],
  chunkStart: number,
): number {
  const windowStart = Math.max(chunkStart + 1, targetPos - windowSize);
  let bestPos = targetPos;
  let bestScore = -1;

  for (const point of breakPoints) {
    if (point.pos < windowStart) continue;
    if (point.pos > targetPos) break;
    if (isInsideCodeFence(point.pos, codeFences)) continue;

    const distance = targetPos - point.pos;
    const normalizedDistance = distance / Math.max(windowSize, 1);
    const distancePenalty = 0.7 * normalizedDistance * normalizedDistance;
    const finalScore = point.score * (1 - distancePenalty);
    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestPos = point.pos;
    }
  }

  return bestPos;
}

function isInsideCodeFence(
  pos: number,
  codeFences: CodeFenceRegion[],
): boolean {
  return codeFences.some((region) => pos > region.start && pos < region.end);
}

function mergeSmallChunks(
  chunks: SmartChunkRange[],
  minLength: number,
  maxLength: number,
): SmartChunkRange[] {
  if (chunks.length <= 1) {
    return chunks;
  }

  const merged: SmartChunkRange[] = [];
  for (const chunk of chunks) {
    if (
      merged.length > 0 &&
      chunk.text.length < minLength &&
      `${merged[merged.length - 1].text}\n\n${chunk.text}`.length <=
        maxLength * 1.3
    ) {
      const previous = merged[merged.length - 1];
      merged[merged.length - 1] = {
        ...previous,
        text: `${previous.text}\n\n${chunk.text}`,
        endOffset: chunk.endOffset,
        endLine: chunk.endLine,
        charCount: chunk.endOffset - previous.startOffset,
      };
    } else {
      merged.push(chunk);
    }
  }
  return merged;
}

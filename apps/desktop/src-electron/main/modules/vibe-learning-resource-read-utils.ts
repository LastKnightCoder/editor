import { createReadStream, promises as fs } from "node:fs";
import { createInterface } from "node:readline";

export interface MarkdownLineReadOptions {
  startLine: number;
  endLine: number;
  maxChars: number;
}

export interface MarkdownLineReadResult {
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  truncated: boolean;
}

export interface GrepResourceInfo {
  id: number;
  name: string;
}

export interface GrepParseResult {
  resourceId: number;
  resourceName: string;
  lineNumber: number;
  startOffset: number;
  endOffset: number;
  matchedText: string;
  preview: string;
}

interface RipgrepJsonEvent {
  type?: string;
  data?: {
    path?: { text?: string };
    line_number?: number;
    lines?: { text?: string };
    submatches?: Array<{
      match?: { text?: string };
      start?: number;
      end?: number;
    }>;
  };
}

export async function readMarkdownLines(
  filePath: string,
  options: MarkdownLineReadOptions,
): Promise<MarkdownLineReadResult> {
  const requestedStartLine = Math.max(1, Math.floor(options.startLine));
  const requestedEndLine = Math.max(
    requestedStartLine,
    Math.floor(options.endLine),
  );
  const selectedLines: string[] = [];
  let totalLines = 0;
  let chars = 0;
  let truncated = false;

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    totalLines++;

    if (
      totalLines >= requestedStartLine &&
      totalLines <= requestedEndLine &&
      !truncated
    ) {
      const prefix = selectedLines.length > 0 ? "\n" : "";
      const nextLength = chars + prefix.length + line.length;
      if (nextLength > options.maxChars) {
        const remaining = Math.max(0, options.maxChars - chars);
        if (remaining > 0) {
          selectedLines.push((prefix + line).slice(0, remaining));
          chars = options.maxChars;
        }
        truncated = true;
      } else {
        selectedLines.push(prefix + line);
        chars = nextLength;
      }
    }
  }

  return {
    content: selectedLines.join(""),
    startLine: requestedStartLine,
    endLine: Math.max(
      requestedStartLine,
      Math.min(totalLines, requestedEndLine),
    ),
    totalLines,
    truncated,
  };
}

export function toCharOffset(lineText: string, byteOffset: number): number {
  if (byteOffset <= 0) {
    return 0;
  }

  let bytesSeen = 0;
  for (let i = 0; i < lineText.length; i++) {
    const nextBytes = Buffer.byteLength(lineText[i], "utf-8");
    if (bytesSeen + nextBytes > byteOffset) {
      return i;
    }
    bytesSeen += nextBytes;
  }

  return lineText.length;
}

export async function buildLineStartOffsets(
  filePath: string,
): Promise<number[]> {
  const content = await fs.readFile(filePath, "utf-8");
  const offsets = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\n") {
      offsets.push(i + 1);
    }
  }
  return offsets;
}

export async function parseRipgrepJsonLines(params: {
  lines: Iterable<string> | AsyncIterable<string>;
  pathToResource: ReadonlyMap<string, GrepResourceInfo>;
  limit: number;
  previewRadius: number;
  getLineStartOffsets: (filePath: string) => Promise<number[]>;
  onLimitReached?: () => void;
}): Promise<GrepParseResult[]> {
  const lineOffsetCache = new Map<string, number[]>();
  const results: GrepParseResult[] = [];
  let limitNotified = false;

  for await (const line of params.lines) {
    if (results.length >= params.limit) {
      if (!limitNotified) {
        params.onLimitReached?.();
        limitNotified = true;
      }
      break;
    }

    let event: RipgrepJsonEvent;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (event.type !== "match" || !event.data?.path?.text) {
      continue;
    }

    const filePath = event.data.path.text;
    const resource = params.pathToResource.get(filePath);
    if (!resource) {
      continue;
    }

    const lineNumber = event.data.line_number || 1;
    const lineText = event.data.lines?.text?.replace(/\n$/, "") || "";
    let offsets = lineOffsetCache.get(filePath);
    if (!offsets) {
      offsets = await params.getLineStartOffsets(filePath);
      lineOffsetCache.set(filePath, offsets);
    }
    const lineStartOffset = offsets[lineNumber - 1] || 0;

    for (const submatch of event.data.submatches || []) {
      if (results.length >= params.limit) {
        break;
      }

      const matchedText = submatch.match?.text || "";
      const startInLine = toCharOffset(lineText, submatch.start || 0);
      const endInLine = toCharOffset(lineText, submatch.end || 0);
      const previewStart = Math.max(0, startInLine - params.previewRadius);
      const previewEnd = Math.min(
        lineText.length,
        endInLine + params.previewRadius,
      );

      results.push({
        resourceId: resource.id,
        resourceName: resource.name,
        lineNumber,
        startOffset: lineStartOffset + startInLine,
        endOffset: lineStartOffset + endInLine,
        matchedText,
        preview: lineText.slice(previewStart, previewEnd),
      });
    }
  }

  return results;
}

export function assertIndexCreated(created: boolean, resourceId: number): void {
  if (!created) {
    throw new Error(`Failed to create search index for resource ${resourceId}`);
  }
}

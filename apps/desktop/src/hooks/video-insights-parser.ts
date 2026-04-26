import type {
  TranscriptSegment,
  VideoNoteHighlight,
  VideoNoteInsights,
  VideoNoteTopic,
} from "@/types";

interface ParseInsightsOptions {
  transcriptSegments: TranscriptSegment[];
  transcriptHash: string;
  generatedAt?: number;
  modelMeta?: VideoNoteInsights["modelMeta"];
  mode: "full" | "topic";
  customTopicName?: string;
}

interface RawTopic {
  id?: unknown;
  name?: unknown;
  title?: unknown;
  topic?: unknown;
  summary?: unknown;
  description?: unknown;
  source?: unknown;
}

interface RawHighlight {
  id?: unknown;
  topicId?: unknown;
  topic?: unknown;
  topicName?: unknown;
  title?: unknown;
  quote?: unknown;
  start?: unknown;
  end?: unknown;
  startSegmentIdx?: unknown;
  endSegmentIdx?: unknown;
  startCharOffset?: unknown;
  endCharOffset?: unknown;
  confidence?: unknown;
}

const TOPIC_LIMIT = 5;
const HIGHLIGHT_PER_TOPIC_LIMIT = 5;
const HIGHLIGHT_TOTAL_LIMIT = 32;

const toNonNegativeInt = (value: unknown, fallback = 0): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.max(0, Math.floor(num));
};

const toConfidence = (value: unknown): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0.6;
  }
  return Math.min(1, Math.max(0, num));
};

const normalizeText = (value: unknown): string =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ");

const slugify = (value: string): string => {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "topic";
};

const simpleHash = (value: string): string => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export const computeTranscriptHash = (
  transcript: string | undefined,
  transcriptSegments: TranscriptSegment[] | undefined,
): string => {
  const segments = transcriptSegments || [];
  const baseText =
    segments.length > 0
      ? segments
          .map(
            (segment, index) =>
              `${index}:${segment.start}-${segment.end}:${segment.text}`,
          )
          .join("\n")
      : transcript?.trim() || "";
  return `tn-${simpleHash(baseText)}`;
};

const parseMaybeJson = (value: string): unknown => {
  const text = value.trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    // ignore
  }

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch) {
    try {
      return JSON.parse(fencedMatch[1]);
    } catch {
      // ignore
    }
  }

  const firstCurly = text.indexOf("{");
  const lastCurly = text.lastIndexOf("}");
  if (firstCurly >= 0 && lastCurly > firstCurly) {
    try {
      return JSON.parse(text.slice(firstCurly, lastCurly + 1));
    } catch {
      // ignore
    }
  }

  return null;
};

const normalizeTopicSource = (
  value: unknown,
  fallback: VideoNoteTopic["source"],
): VideoNoteTopic["source"] => {
  const text = normalizeText(value).toLowerCase();
  if (text === "custom") {
    return "custom";
  }
  if (text === "auto") {
    return "auto";
  }
  return fallback;
};

const findSegmentIndexByTime = (
  segments: TranscriptSegment[],
  targetMs: number,
  fallback: number,
): number => {
  if (segments.length === 0) {
    return 0;
  }
  const matchIndex = segments.findIndex(
    (segment) => segment.start <= targetMs && segment.end >= targetMs,
  );
  if (matchIndex >= 0) {
    return matchIndex;
  }
  if (targetMs < segments[0].start) {
    return 0;
  }
  if (targetMs > segments[segments.length - 1].end) {
    return segments.length - 1;
  }
  const nearestIndex = segments.findIndex((segment) => segment.end >= targetMs);
  if (nearestIndex >= 0) {
    return nearestIndex;
  }
  return Math.min(Math.max(fallback, 0), segments.length - 1);
};

const normalizeHighlightOffsets = (
  raw: RawHighlight,
  start: number,
  end: number,
  transcriptSegments: TranscriptSegment[],
): Pick<
  VideoNoteHighlight,
  | "startSegmentIdx"
  | "endSegmentIdx"
  | "startCharOffset"
  | "endCharOffset"
  | "confidence"
> => {
  const startSegmentIdx = Math.min(
    transcriptSegments.length - 1,
    Math.max(
      0,
      Number.isFinite(Number(raw.startSegmentIdx))
        ? toNonNegativeInt(raw.startSegmentIdx)
        : findSegmentIndexByTime(transcriptSegments, start, 0),
    ),
  );

  const endSegmentIdx = Math.max(
    startSegmentIdx,
    Math.min(
      transcriptSegments.length - 1,
      Number.isFinite(Number(raw.endSegmentIdx))
        ? toNonNegativeInt(raw.endSegmentIdx)
        : findSegmentIndexByTime(transcriptSegments, end, startSegmentIdx),
    ),
  );

  const startSegmentText = transcriptSegments[startSegmentIdx]?.text || "";
  const endSegmentText = transcriptSegments[endSegmentIdx]?.text || "";

  const startCharOffset = Math.min(
    startSegmentText.length,
    toNonNegativeInt(raw.startCharOffset, 0),
  );
  const endCharOffset = Math.max(
    0,
    Math.min(
      endSegmentText.length,
      Number.isFinite(Number(raw.endCharOffset))
        ? toNonNegativeInt(raw.endCharOffset)
        : endSegmentText.length,
    ),
  );

  return {
    startSegmentIdx,
    endSegmentIdx,
    startCharOffset,
    endCharOffset,
    confidence: toConfidence(raw.confidence),
  };
};

const normalizeTopics = (
  rawTopics: RawTopic[],
  fallbackSource: VideoNoteTopic["source"],
): VideoNoteTopic[] => {
  const seen = new Set<string>();
  const topics: VideoNoteTopic[] = [];

  rawTopics.forEach((rawTopic, index) => {
    const name = normalizeText(
      rawTopic.name ?? rawTopic.title ?? rawTopic.topic ?? "",
    );
    if (!name) {
      return;
    }
    const candidateId =
      normalizeText(rawTopic.id) || `${slugify(name)}-${index + 1}`;
    if (seen.has(candidateId)) {
      return;
    }
    seen.add(candidateId);
    topics.push({
      id: candidateId,
      name,
      summary: normalizeText(rawTopic.summary ?? rawTopic.description),
      source: normalizeTopicSource(rawTopic.source, fallbackSource),
    });
  });

  return topics.slice(0, TOPIC_LIMIT);
};

const groupHighlightsByTopicLimit = (
  highlights: VideoNoteHighlight[],
): VideoNoteHighlight[] => {
  const topicCount = new Map<string, number>();
  const result: VideoNoteHighlight[] = [];
  for (const item of highlights) {
    const topicId = item.topicId || "__none__";
    const count = topicCount.get(topicId) || 0;
    if (count >= HIGHLIGHT_PER_TOPIC_LIMIT) {
      continue;
    }
    topicCount.set(topicId, count + 1);
    result.push(item);
    if (result.length >= HIGHLIGHT_TOTAL_LIMIT) {
      break;
    }
  }
  return result;
};

const normalizeHighlights = (
  rawHighlights: RawHighlight[],
  topics: VideoNoteTopic[],
  transcriptSegments: TranscriptSegment[],
): VideoNoteHighlight[] => {
  const topicMap = new Map(topics.map((topic) => [topic.id, topic]));
  const topicNameToId = new Map(
    topics.map((topic) => [topic.name.toLowerCase(), topic.id]),
  );

  const highlights: VideoNoteHighlight[] = [];

  rawHighlights.forEach((raw, index) => {
    const title = normalizeText(raw.title);
    const quote = normalizeText(raw.quote);
    const start = toNonNegativeInt(raw.start, -1);
    const end = Math.max(start, toNonNegativeInt(raw.end, -1));

    if (!title || !quote || start < 0 || end < 0) {
      return;
    }

    const hintedTopicName = normalizeText(
      raw.topic ?? raw.topicName,
    ).toLowerCase();
    const hintedTopicId = normalizeText(raw.topicId);
    const resolvedTopicId =
      (hintedTopicId && topicMap.has(hintedTopicId) && hintedTopicId) ||
      (hintedTopicName && topicNameToId.get(hintedTopicName)) ||
      topics[0]?.id;

    if (!resolvedTopicId) {
      return;
    }

    const offsets = normalizeHighlightOffsets(
      raw,
      start,
      end,
      transcriptSegments,
    );
    highlights.push({
      id: normalizeText(raw.id) || `hl-${resolvedTopicId}-${index + 1}`,
      topicId: resolvedTopicId,
      title,
      quote,
      start,
      end,
      ...offsets,
    });
  });

  const deduped = Array.from(
    new Map(
      highlights.map((item) => [
        `${item.topicId}-${item.start}-${item.end}-${item.title}`,
        item,
      ]),
    ).values(),
  ).sort(
    (a, b) =>
      a.start - b.start ||
      (a.topicId || "").localeCompare(b.topicId || "") ||
      a.title.localeCompare(b.title),
  );

  return groupHighlightsByTopicLimit(deduped);
};

export const parseVideoInsightsResponse = (
  rawContent: string,
  options: ParseInsightsOptions,
): VideoNoteInsights => {
  const parsed = parseMaybeJson(rawContent);
  if (!isRecord(parsed)) {
    throw new Error("AI 返回不是有效 JSON 对象");
  }

  const rawTopics = Array.isArray(parsed.topics)
    ? (parsed.topics as RawTopic[])
    : [];
  const rawHighlights = Array.isArray(parsed.highlights)
    ? (parsed.highlights as RawHighlight[])
    : [];

  const fallbackSource = options.mode === "topic" ? "custom" : "auto";
  let topics = normalizeTopics(rawTopics, fallbackSource);

  if (options.mode === "topic") {
    const customName = normalizeText(options.customTopicName);
    if (!customName) {
      throw new Error("自定义主题为空");
    }
    const customSlug = slugify(customName);
    topics = topics.filter(
      (topic) => topic.name.toLowerCase() !== customName.toLowerCase(),
    );
    topics.unshift({
      id: `custom-${customSlug}`,
      name: customName,
      summary: topics[0]?.summary,
      source: "custom",
    });
    topics = topics.slice(0, TOPIC_LIMIT);
  }

  if (!topics.length) {
    throw new Error("AI 未返回有效主题");
  }

  const highlights = normalizeHighlights(
    rawHighlights,
    topics,
    options.transcriptSegments,
  );
  if (!highlights.length) {
    throw new Error("AI 未返回有效高亮");
  }

  return {
    version: 1,
    transcriptHash: options.transcriptHash,
    generatedAt: options.generatedAt || Date.now(),
    topics,
    highlights,
    modelMeta: options.modelMeta,
  };
};

export const mergeTopicInsights = (
  currentInsights: VideoNoteInsights | undefined,
  topicInsights: VideoNoteInsights,
): VideoNoteInsights => {
  const incomingTopic = topicInsights.topics[0];
  const existingTopics = currentInsights?.topics || [];
  const existingHighlights = currentInsights?.highlights || [];
  const replacedTopicIds = new Set(
    existingTopics
      .filter(
        (topic) =>
          topic.name.toLowerCase() === incomingTopic.name.toLowerCase(),
      )
      .map((topic) => topic.id),
  );

  const mergedTopics = existingTopics.filter(
    (topic) => topic.name.toLowerCase() !== incomingTopic.name.toLowerCase(),
  );
  mergedTopics.push(incomingTopic);

  const filteredHighlights = existingHighlights.filter(
    (highlight) => !replacedTopicIds.has(highlight.topicId || ""),
  );
  const mergedHighlights = [
    ...filteredHighlights,
    ...topicInsights.highlights,
  ].sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));

  return {
    version: 1,
    transcriptHash: topicInsights.transcriptHash,
    generatedAt: topicInsights.generatedAt,
    topics: mergedTopics,
    highlights: mergedHighlights,
    modelMeta: topicInsights.modelMeta || currentInsights?.modelMeta,
  };
};

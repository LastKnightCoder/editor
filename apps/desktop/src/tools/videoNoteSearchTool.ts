import type { ToolDefinition } from "@/types/tool";
import { searchVideoNoteContent } from "@/commands/video-note-index";
import type { VideoNoteHighlight, VideoNoteTopic } from "@/types";

export interface VideoNoteChatContext {
  selectedTheme: string | null;
  availableThemes: string[];
  visibleHighlights: VideoNoteHighlight[];
  topics?: VideoNoteTopic[];
  insightsObsolete?: boolean;
}

export interface VideoNoteChatContextProvider {
  getContext: () => VideoNoteChatContext;
}

const tryParseLimit = (
  value: unknown,
  fallback: number,
  max: number,
): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
};

const normalizeQuery = (value: unknown): string => String(value || "").trim();

const toToolHighlight = (item: VideoNoteHighlight) => ({
  id: item.id,
  topicId: item.topicId,
  title: item.title,
  quote: item.quote,
  start: item.start,
  end: item.end,
  startSegmentIdx: item.startSegmentIdx,
  endSegmentIdx: item.endSegmentIdx,
  startCharOffset: item.startCharOffset,
  endCharOffset: item.endCharOffset,
  confidence: item.confidence,
});

const highlightSearchScore = (
  query: string,
  highlight: VideoNoteHighlight,
): number => {
  const normalizedQuery = query.toLowerCase();
  const title = (highlight.title || "").toLowerCase();
  const quote = (highlight.quote || "").toLowerCase();

  let score = 0;
  if (title.includes(normalizedQuery)) {
    score += 8;
  }
  if (quote.includes(normalizedQuery)) {
    score += 4;
  }

  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  for (const token of queryTokens) {
    if (title.includes(token)) {
      score += 3;
    }
    if (quote.includes(token)) {
      score += 1;
    }
  }
  return score;
};

export const createVideoNoteSearchTool = (
  videoNoteId: number,
  mainDbName: string,
): ToolDefinition => ({
  name: "search_video_note_knowledge",
  description:
    "搜索当前视频笔记的转录索引内容，返回最相关的时间片段，便于问答时精准引用。",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜索关键词或问题",
      },
      limit: {
        type: "number",
        description: "返回条数，默认 5，最大 10",
      },
    },
    required: ["query"],
  },
  executor: async (args) => {
    const query = String(args.query || "").trim();
    const limit = Math.min(Number(args.limit || 5), 10);
    if (!query) {
      return {
        content: JSON.stringify({
          success: false,
          error: "query 不能为空",
          results: [],
        }),
      };
    }

    const results = await searchVideoNoteContent({
      videoNoteId,
      mainDbName,
      query,
      limit,
    });

    return {
      content: JSON.stringify({
        success: true,
        message: `找到 ${results.length} 条相关片段`,
        results: results.map((item) => ({
          start: item.start,
          end: item.end,
          text: item.text,
          score: item.score,
          rrfScore: item.rrfScore,
          rerankScore: item.rerankScore,
        })),
      }),
    };
  },
});

export const createGetVideoNoteHighlightsTool = (
  contextProvider: VideoNoteChatContextProvider,
): ToolDefinition => ({
  name: "get_video_note_highlights",
  description:
    "获取当前视频高亮上下文。默认返回当前主题下的可见高亮列表，含标题、引用和时间段。",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "返回条数，默认 10，最大 30",
      },
    },
  },
  executor: async (args) => {
    const { selectedTheme, availableThemes, visibleHighlights } =
      contextProvider.getContext();
    const limit = tryParseLimit(args.limit, 10, 30);
    const results = visibleHighlights.slice(0, limit);

    return {
      content: JSON.stringify({
        success: true,
        selectedTheme,
        total: visibleHighlights.length,
        availableThemes,
        highlights: results.map(toToolHighlight),
      }),
    };
  },
});

export const createSearchVideoNoteHighlightsTool = (
  contextProvider: VideoNoteChatContextProvider,
): ToolDefinition => ({
  name: "search_video_note_highlights",
  description: "在当前主题可见高亮中搜索关键词，返回最相关的高亮及时间范围。",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜索关键词或问题",
      },
      limit: {
        type: "number",
        description: "返回条数，默认 5，最大 20",
      },
    },
    required: ["query"],
  },
  executor: async (args) => {
    const query = normalizeQuery(args.query);
    const limit = tryParseLimit(args.limit, 5, 20);
    const { selectedTheme, visibleHighlights } = contextProvider.getContext();
    if (!query) {
      return {
        content: JSON.stringify({
          success: false,
          error: "query 不能为空",
          results: [],
        }),
      };
    }

    const results = visibleHighlights
      .map((item) => ({
        item,
        score: highlightSearchScore(query, item),
      }))
      .filter((entry) => entry.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.item.start - b.item.start ||
          a.item.title.localeCompare(b.item.title),
      )
      .slice(0, limit)
      .map(({ item, score }) => ({
        ...toToolHighlight(item),
        score,
      }));

    return {
      content: JSON.stringify({
        success: true,
        selectedTheme,
        query,
        count: results.length,
        results,
      }),
    };
  },
});

export const createGetVideoNoteThemeContextTool = (
  contextProvider: VideoNoteChatContextProvider,
): ToolDefinition => ({
  name: "get_video_note_theme_context",
  description:
    "获取当前主题上下文，包括当前选中主题、所有主题列表和可见高亮数量。",
  parameters: {
    type: "object",
    properties: {},
  },
  executor: async () => {
    const {
      selectedTheme,
      availableThemes,
      visibleHighlights,
      topics = [],
      insightsObsolete = false,
    } = contextProvider.getContext();
    const selectedTopic =
      topics.find(
        (topic) =>
          topic.name.toLowerCase() ===
          String(selectedTheme || "").toLowerCase(),
      ) || null;
    return {
      content: JSON.stringify({
        success: true,
        selectedTheme,
        selectedTopic: selectedTopic
          ? {
              id: selectedTopic.id,
              name: selectedTopic.name,
              source: selectedTopic.source,
              custom: selectedTopic.source === "custom",
            }
          : null,
        source: selectedTopic?.source || "overall",
        custom: selectedTopic?.source === "custom",
        obsolete: insightsObsolete,
        topics: topics.map((topic) => ({
          id: topic.id,
          name: topic.name,
          source: topic.source,
          custom: topic.source === "custom",
        })),
        availableThemes,
        visibleHighlightsCount: visibleHighlights.length,
        previewHighlights: visibleHighlights.slice(0, 5).map(toToolHighlight),
      }),
    };
  },
});

import { Editor, Range } from "slate";
import { TabType } from "@/types/tab";
import { getActiveEditingSessionByContentId } from "./active-editor-session";
import { resolveLocatorToRange } from "./locator";
import { loadSnapshotForContent, resolveContentTarget } from "./resolver";
import { offsetToMarkdownPoint } from "./snapshot";
import type {
  ContentSnapshot,
  EntityType,
  MarkdownPoint,
  SerializedPoint,
  SerializedSelection,
} from "./types";

export interface InlineContextBuildOptions {
  fullThreshold?: number;
  headChars?: number;
  focusWindow?: number;
  tailChars?: number;
  contextWindow?: number;
}

export interface InlineDocumentSegment {
  strategy: "full" | "head-focus-tail";
  markdown: string;
  truncated: boolean;
  head?: string;
  focus?: string;
  tail?: string;
  focusRange?: {
    start: number;
    end: number;
  };
}

export interface InlineSelectionRange {
  anchor: SerializedPoint;
  focus: SerializedPoint;
  startOffset: number;
  endOffset: number;
  startPoint: MarkdownPoint;
  endPoint: MarkdownPoint;
}

export interface InlineEditorContext {
  contentId: number | null;
  entityType?: EntityType;
  entityId?: number;
  tabType?: TabType;
  tabId?: string;
  paneId?: string;
  targetSource?: "explicit" | "active-session" | "active-tab";
  snapshotId: string;
  snapshotSource: "active-session" | "database";
  documentHash: string;
  documentLength: number;
  selection: SerializedSelection | null;
  selectionRange: InlineSelectionRange | null;
  selectedMarkdown: string;
  selectionBefore: string;
  selectionAfter: string;
  currentBlockMarkdown: string;
  fullDocument: InlineDocumentSegment;
}

const DEFAULT_BUILD_OPTIONS: Required<InlineContextBuildOptions> = {
  fullThreshold: 8000,
  headChars: 2000,
  focusWindow: 1200,
  tailChars: 2000,
  contextWindow: 180,
};

const toSerializedSelection = (
  selection: Range | null,
): SerializedSelection | null => {
  if (!selection) return null;
  return {
    anchor: {
      path: [...selection.anchor.path],
      offset: selection.anchor.offset,
    },
    focus: {
      path: [...selection.focus.path],
      offset: selection.focus.offset,
    },
    isCollapsed: Range.isCollapsed(selection),
  };
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const buildInlineDocumentSegment = (payload: {
  markdown: string;
  focusRange: { start: number; end: number } | null;
  options?: InlineContextBuildOptions;
}): InlineDocumentSegment => {
  const { markdown, focusRange } = payload;
  const options = {
    ...DEFAULT_BUILD_OPTIONS,
    ...payload.options,
  };
  const length = markdown.length;
  if (length <= options.fullThreshold) {
    return {
      strategy: "full",
      markdown,
      truncated: false,
    };
  }

  const center = focusRange
    ? Math.floor((focusRange.start + focusRange.end) / 2)
    : Math.floor(length / 2);
  const focusStart = clamp(
    center - Math.floor(options.focusWindow / 2),
    0,
    Math.max(0, length - options.focusWindow),
  );
  const focusEnd = clamp(focusStart + options.focusWindow, 0, length);

  const headEnd = Math.min(options.headChars, length);
  const tailStart = Math.max(0, length - options.tailChars);
  const head = markdown.slice(0, headEnd);
  const focus = markdown.slice(focusStart, focusEnd);
  const tail = markdown.slice(tailStart);

  const sectionParts = [
    "[[DOC_HEAD]]",
    head,
    `[[DOC_FOCUS offset=${focusStart}-${focusEnd}]]`,
    focus,
    `[[DOC_TAIL offset=${tailStart}-${length}]]`,
    tail,
  ];

  return {
    strategy: "head-focus-tail",
    markdown: sectionParts.join("\n\n"),
    truncated: true,
    head,
    focus,
    tail,
    focusRange: {
      start: focusStart,
      end: focusEnd,
    },
  };
};

export const buildInlineEditorContextFromSnapshot = (payload: {
  snapshot: ContentSnapshot;
  snapshotSource: "active-session" | "database";
  selection: SerializedSelection | null;
  target: {
    contentId: number;
    entityType?: EntityType;
    entityId?: number;
    tabType?: TabType;
    tabId?: string;
    paneId?: string;
    source: "explicit" | "active-session" | "active-tab";
  };
  options?: InlineContextBuildOptions;
}): InlineEditorContext => {
  const { snapshot, selection, target, snapshotSource } = payload;
  const options = {
    ...DEFAULT_BUILD_OPTIONS,
    ...payload.options,
  };

  let selectedRange: { start: number; end: number } | null = null;
  let currentBlockRange: { start: number; end: number } | null = null;

  if (selection) {
    try {
      selectedRange = resolveLocatorToRange({
        locator: { kind: "active-selection" },
        snapshot,
        selection,
      });
    } catch {
      selectedRange = null;
    }
    try {
      currentBlockRange = resolveLocatorToRange({
        locator: { kind: "active-block" },
        snapshot,
        selection,
      });
    } catch {
      currentBlockRange = null;
    }
  }

  const selectedMarkdown = selectedRange
    ? snapshot.markdown.slice(selectedRange.start, selectedRange.end)
    : "";
  const selectionBefore = selectedRange
    ? snapshot.markdown.slice(
        Math.max(0, selectedRange.start - options.contextWindow),
        selectedRange.start,
      )
    : "";
  const selectionAfter = selectedRange
    ? snapshot.markdown.slice(
        selectedRange.end,
        Math.min(
          snapshot.markdown.length,
          selectedRange.end + options.contextWindow,
        ),
      )
    : "";
  const currentBlockMarkdown = currentBlockRange
    ? snapshot.markdown.slice(currentBlockRange.start, currentBlockRange.end)
    : "";

  const focusRange = selectedRange || currentBlockRange || null;
  const fullDocument = buildInlineDocumentSegment({
    markdown: snapshot.markdown,
    focusRange,
    options,
  });

  const selectionRange: InlineSelectionRange | null =
    selection && selectedRange
      ? {
          anchor: {
            path: [...selection.anchor.path],
            offset: selection.anchor.offset,
          },
          focus: {
            path: [...selection.focus.path],
            offset: selection.focus.offset,
          },
          startOffset: selectedRange.start,
          endOffset: selectedRange.end,
          startPoint: offsetToMarkdownPoint(
            selectedRange.start,
            snapshot.lineOffsets,
          ),
          endPoint: offsetToMarkdownPoint(
            selectedRange.end,
            snapshot.lineOffsets,
          ),
        }
      : null;

  return {
    contentId: target.contentId,
    entityType: target.entityType,
    entityId: target.entityId,
    tabType: target.tabType,
    tabId: target.tabId,
    paneId: target.paneId,
    targetSource: target.source,
    snapshotId: snapshot.id,
    snapshotSource,
    documentHash: snapshot.hash,
    documentLength: snapshot.markdown.length,
    selection,
    selectionRange,
    selectedMarkdown,
    selectionBefore,
    selectionAfter,
    currentBlockMarkdown,
    fullDocument,
  };
};

export const buildInlineEditorContext = async (
  editor: Editor,
  options?: InlineContextBuildOptions,
  selectionOverride?: SerializedSelection | null,
): Promise<InlineEditorContext> => {
  const target = await resolveContentTarget();
  const { snapshot, source } = await loadSnapshotForContent(target.contentId);
  const activeSession = getActiveEditingSessionByContentId(target.contentId);

  const selection =
    selectionOverride ||
    toSerializedSelection(editor.selection) ||
    activeSession?.selection ||
    null;

  return buildInlineEditorContextFromSnapshot({
    snapshot,
    snapshotSource: source,
    selection,
    target,
    options,
  });
};

export const buildInlineContextPrompt = (
  context: InlineEditorContext,
  instruction: string,
): string => {
  const metadata = {
    contentId: context.contentId,
    entityType: context.entityType,
    entityId: context.entityId,
    tabType: context.tabType,
    tabId: context.tabId,
    paneId: context.paneId,
    snapshotId: context.snapshotId,
    snapshotSource: context.snapshotSource,
    targetSource: context.targetSource,
    documentHash: context.documentHash,
    documentLength: context.documentLength,
    selection: context.selection,
    selectionRange: context.selectionRange,
    selectedMarkdown: context.selectedMarkdown,
    selectionBefore: context.selectionBefore,
    selectionAfter: context.selectionAfter,
    currentBlockMarkdown: context.currentBlockMarkdown,
    fullDocumentStrategy: context.fullDocument.strategy,
    fullDocumentTruncated: context.fullDocument.truncated,
  };

  return [
    "你正在处理编辑器内联改写请求。",
    "",
    "用户指令：",
    instruction,
    "",
    "编辑上下文（JSON）：",
    "```json",
    JSON.stringify(metadata, null, 2),
    "```",
    "",
    "文档参考片段：",
    "<document_markdown>",
    context.fullDocument.markdown,
    "</document_markdown>",
  ].join("\n");
};

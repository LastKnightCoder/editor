import { Path } from "slate";
import { markdownPointToOffset } from "./snapshot";
import { getRangeByMatchId } from "./snapshot-store";
import type {
  ContentSnapshot,
  EditLocator,
  ResolvedOffsetRange,
  SerializedSelection,
} from "./types";

const pathEquals = (left: number[], right: number[]) => Path.equals(left, right);

const isPathPrefix = (prefix: number[], fullPath: number[]) => {
  if (prefix.length > fullPath.length) return false;
  return prefix.every((part, idx) => fullPath[idx] === part);
};

const toOffsetRangeFromPosition = (
  snapshot: ContentSnapshot,
  start: { line: number; ch: number },
  end: { line: number; ch: number }
) => {
  const startOffset = markdownPointToOffset(start, snapshot.lineOffsets, snapshot.markdown.length);
  const endOffset = markdownPointToOffset(end, snapshot.lineOffsets, snapshot.markdown.length);

  return {
    start: Math.min(startOffset, endOffset),
    end: Math.max(startOffset, endOffset),
  };
};

const resolveSelectionRange = (
  snapshot: ContentSnapshot,
  selection: SerializedSelection
): { start: number; end: number } | null => {
  const anchorPos = snapshot.positionMap.slateToMarkdown({
    path: selection.anchor.path,
    offset: selection.anchor.offset,
  });
  const focusPos = snapshot.positionMap.slateToMarkdown({
    path: selection.focus.path,
    offset: selection.focus.offset,
  });

  if (!anchorPos || !focusPos) return null;
  return toOffsetRangeFromPosition(snapshot, anchorPos, focusPos);
};

const resolveSlatePathRange = (
  snapshot: ContentSnapshot,
  path: number[]
): { start: number; end: number } => {
  const elementMapping = snapshot.positionMap.getElementMappingBySlatePath(path);
  if (elementMapping) {
    return toOffsetRangeFromPosition(
      snapshot,
      { line: elementMapping.mdStartLine, ch: elementMapping.mdStartCh },
      { line: elementMapping.mdEndLine, ch: elementMapping.mdEndCh }
    );
  }

  const mappings = snapshot.positionMap.getMappings();
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  mappings.forEach(mapping => {
    if (mapping.type === "text") {
      if (pathEquals(mapping.slateTextPath, path) || isPathPrefix(path, mapping.slateTextPath)) {
        const start = markdownPointToOffset(
          { line: mapping.mdLine, ch: mapping.mdCh },
          snapshot.lineOffsets,
          snapshot.markdown.length
        );
        const end = markdownPointToOffset(
          {
            line: mapping.mdLine,
            ch: mapping.mdCh + mapping.mdLength,
          },
          snapshot.lineOffsets,
          snapshot.markdown.length
        );
        min = Math.min(min, start);
        max = Math.max(max, end);
      }
      return;
    }

    if (
      pathEquals(mapping.slateElementPath, path) ||
      isPathPrefix(path, mapping.slateElementPath)
    ) {
      const range = toOffsetRangeFromPosition(
        snapshot,
        { line: mapping.mdStartLine, ch: mapping.mdStartCh },
        { line: mapping.mdEndLine, ch: mapping.mdEndCh }
      );
      min = Math.min(min, range.start);
      max = Math.max(max, range.end);
    }
  });

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error(`INVALID_LOCATOR: 无法解析 slate-path ${JSON.stringify(path)}`);
  }

  return {
    start: min,
    end: max,
  };
};

export const resolveLocatorToRange = (payload: {
  locator: EditLocator;
  snapshot: ContentSnapshot;
  selection: SerializedSelection | null;
}): ResolvedOffsetRange => {
  const { locator, snapshot, selection } = payload;

  if (locator.kind === "full-document") {
    return {
      start: 0,
      end: snapshot.markdown.length,
      locator,
    };
  }

  if (locator.kind === "markdown-range") {
    const range = toOffsetRangeFromPosition(snapshot, locator.start, locator.end);
    return { ...range, locator };
  }

  if (locator.kind === "slate-path") {
    const range = resolveSlatePathRange(snapshot, locator.path);
    return { ...range, locator };
  }

  if (locator.kind === "active-selection") {
    if (!selection) {
      throw new Error("EMPTY_SELECTION: 当前没有可用选区");
    }
    const range = resolveSelectionRange(snapshot, selection);
    if (!range) {
      throw new Error("INVALID_LOCATOR: 当前选区无法映射到 Markdown");
    }
    return { ...range, locator };
  }

  if (locator.kind === "active-block") {
    if (!selection) {
      throw new Error("EMPTY_SELECTION: 当前没有光标位置");
    }
    const focusBlockPath = selection.focus.path.slice(0, 1);
    if (focusBlockPath.length === 0) {
      throw new Error("INVALID_LOCATOR: 无法解析当前块");
    }
    const range = resolveSlatePathRange(snapshot, focusBlockPath);
    return { ...range, locator };
  }

  const matchRange = getRangeByMatchId(locator.matchId);
  if (!matchRange) {
    throw new Error(`INVALID_LOCATOR: 未找到 match-id ${locator.matchId}`);
  }
  if (matchRange.snapshotId !== snapshot.id) {
    throw new Error(`INVALID_LOCATOR: match-id ${locator.matchId} 不属于当前快照，请重新定位`);
  }
  return {
    start: matchRange.start,
    end: matchRange.end,
    locator,
  };
};

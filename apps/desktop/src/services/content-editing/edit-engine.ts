import { resolveLocatorToRange } from "./locator";
import { hashMarkdown } from "./snapshot";
import type {
  AppliedPatch,
  ContentSnapshot,
  EditApplyResult,
  EditOperation,
  SerializedSelection,
} from "./types";

interface PlannedPatch {
  operationId: string;
  op: EditOperation["op"];
  start: number;
  end: number;
  text: string;
  expectedText?: string;
  operationOrder: number;
  locatorKind: EditOperation["locator"]["kind"];
}

export class EditEngineError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "EditEngineError";
    this.code = code;
    this.details = details;
  }
}

const normalizeCompareText = (value: string) => value.replace(/\s+/g, " ").trim();

const normalizeInsertRange = (
  payload: PlannedPatch,
  position?: "start" | "end" | "before" | "after"
) => {
  if (position === "start" || position === "before") {
    return {
      ...payload,
      end: payload.start,
    };
  }
  return {
    ...payload,
    start: payload.end,
  };
};

const ensureNoOverlap = (patches: PlannedPatch[]) => {
  const ordered = [...patches].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return a.end - b.end;
  });

  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const next = ordered[i];
    if (next.start < prev.end) {
      throw new EditEngineError(
        "OVERLAPPING_OPERATIONS",
        `操作区间重叠 [${prev.start},${prev.end}) 与 [${next.start},${next.end})`,
        {
          previous: {
            operationId: prev.operationId,
            start: prev.start,
            end: prev.end,
            locatorKind: prev.locatorKind,
          },
          current: {
            operationId: next.operationId,
            start: next.start,
            end: next.end,
            locatorKind: next.locatorKind,
          },
        }
      );
    }
  }
};

export const applyEditOperations = (payload: {
  snapshot: ContentSnapshot;
  operations: EditOperation[];
  selection: SerializedSelection | null;
}): EditApplyResult => {
  const { snapshot, operations, selection } = payload;

  if (!operations.length) {
    return {
      markdown: snapshot.markdown,
      hash: snapshot.hash,
      patches: [],
    };
  }

  const planned: PlannedPatch[] = operations.map((operation, index) => {
    const range = resolveLocatorToRange({
      locator: operation.locator,
      snapshot,
      selection,
    });

    const operationId = operation.id || `op_${index + 1}`;
    if (operation.op === "insert") {
      const basePatch: PlannedPatch = {
        operationId,
        op: "insert",
        start: range.start,
        end: range.end,
        text: operation.text,
        operationOrder: index,
        locatorKind: operation.locator.kind,
      };
      return normalizeInsertRange(basePatch, operation.position);
    }

    if (operation.op === "delete") {
      return {
        operationId,
        op: "delete",
        start: range.start,
        end: range.end,
        text: "",
        operationOrder: index,
        locatorKind: operation.locator.kind,
      };
    }

    return {
      operationId,
      op: "replace",
      start: range.start,
      end: range.end,
      text: operation.text,
      expectedText: operation.expectedText,
      operationOrder: index,
      locatorKind: operation.locator.kind,
    };
  });

  ensureNoOverlap(planned);

  const markdown = snapshot.markdown;
  planned.forEach(patch => {
    if (patch.op !== "replace") return;
    if (patch.expectedText == null) return;
    const actual = markdown.slice(patch.start, patch.end);
    if (actual !== patch.expectedText) {
      const expectedNormalized = normalizeCompareText(patch.expectedText);
      const actualNormalized = normalizeCompareText(actual);
      const rangeLength = patch.end - patch.start;
      const maybeRangeMismatch = patch.expectedText.length > rangeLength * 1.5;

      throw new EditEngineError(
        "REPLACE_GUARD_MISMATCH",
        `操作 ${patch.operationId} 的目标内容与 expectedText 不一致`,
        {
          operationId: patch.operationId,
          locatorKind: patch.locatorKind,
          range: {
            start: patch.start,
            end: patch.end,
            length: rangeLength,
          },
          expectedText: patch.expectedText,
          actualText: actual,
          expectedLength: patch.expectedText.length,
          actualLength: actual.length,
          normalizedEqual: expectedNormalized === actualNormalized,
          likelyCause: maybeRangeMismatch ? "locator_range_mismatch" : "target_text_changed",
          suggestion: maybeRangeMismatch
            ? "match-id 对应范围明显短于 expectedText，请重新定位或改用 replace_content_by_text/rewrite_content_full"
            : "目标片段可能被改动，请重新获取上下文后重试",
        }
      );
    }
  });

  const applyOrder = [...planned].sort((a, b) => {
    if (a.start !== b.start) return b.start - a.start;
    return b.operationOrder - a.operationOrder;
  });

  let nextMarkdown = markdown;
  const applied: AppliedPatch[] = [];

  applyOrder.forEach(patch => {
    const beforeText = nextMarkdown.slice(patch.start, patch.end);
    nextMarkdown = nextMarkdown.slice(0, patch.start) + patch.text + nextMarkdown.slice(patch.end);
    applied.push({
      operationId: patch.operationId,
      op: patch.op,
      start: patch.start,
      end: patch.end,
      beforeText,
      afterText: patch.text,
      charDelta: patch.text.length - (patch.end - patch.start),
    });
  });

  applied.sort((a, b) => {
    const aOrder = planned.findIndex(item => item.operationId === a.operationId);
    const bOrder = planned.findIndex(item => item.operationId === b.operationId);
    return aOrder - bOrder;
  });

  return {
    markdown: nextMarkdown,
    hash: hashMarkdown(nextMarkdown),
    patches: applied,
  };
};

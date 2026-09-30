import { describe, expect, it } from "vitest";
import { importFromMarkdown } from "@/utils/markdown";
import { createContentSnapshot } from "../snapshot";
import {
  buildInlineContextPrompt,
  buildInlineDocumentSegment,
  buildInlineEditorContextFromSnapshot,
} from "../editor-inline-context";
import type { SerializedSelection } from "../types";

describe("content-editing/editor-inline-context", () => {
  it("有选区时应正确提取选中文本与范围信息", () => {
    const content = importFromMarkdown("hello world\n\nnext");
    const snapshot = createContentSnapshot(content, "database");

    const selection: SerializedSelection = {
      anchor: { path: [0, 0], offset: 6 },
      focus: { path: [0, 0], offset: 11 },
      isCollapsed: false,
    };

    const context = buildInlineEditorContextFromSnapshot({
      snapshot,
      snapshotSource: "database",
      selection,
      target: {
        contentId: 101,
        entityType: "card",
        entityId: 1,
        source: "explicit",
      },
    });

    expect(context.selectedMarkdown).toBe("world");
    expect(context.selectionBefore).toContain("hello");
    expect(context.selectionAfter).toContain("next");
    expect(context.selectionRange?.startOffset).toBeGreaterThanOrEqual(0);
    expect(context.selectionRange?.endOffset).toBeGreaterThan(
      context.selectionRange?.startOffset || 0
    );
  });

  it("长文档应触发 head-focus-tail 注入策略", () => {
    const longMarkdown = `${"a".repeat(4200)}\n\nfocus line\n\n${"b".repeat(4200)}`;
    const segment = buildInlineDocumentSegment({
      markdown: longMarkdown,
      focusRange: { start: 4100, end: 4120 },
      options: {
        fullThreshold: 8000,
        headChars: 2000,
        focusWindow: 1200,
        tailChars: 2000,
      },
    });

    expect(segment.strategy).toBe("head-focus-tail");
    expect(segment.truncated).toBe(true);
    expect(segment.markdown).toContain("[[DOC_HEAD]]");
    expect(segment.markdown).toContain("[[DOC_FOCUS");
    expect(segment.markdown).toContain("[[DOC_TAIL");
  });

  it("上下文 prompt 应包含 contentId 与上下文元信息", () => {
    const content = importFromMarkdown("short markdown");
    const snapshot = createContentSnapshot(content, "database");
    const context = buildInlineEditorContextFromSnapshot({
      snapshot,
      snapshotSource: "database",
      selection: null,
      target: {
        contentId: 202,
        entityType: "article",
        entityId: 2,
        source: "explicit",
      },
    });

    const prompt = buildInlineContextPrompt(context, "请扩写这一段");

    expect(prompt).toContain("用户指令");
    expect(prompt).toContain("contentId");
    expect(prompt).toContain("202");
    expect(prompt).toContain("<document_markdown>");
  });
});

import { describe, expect, it } from "vitest";
import { importFromMarkdown } from "@/utils/markdown";
import { createContentSnapshot } from "../snapshot";
import { applyEditOperations, EditEngineError } from "../edit-engine";

describe("content-editing/edit-engine", () => {
  it("应在同一快照下稳定处理多操作（倒序应用避免偏移）", () => {
    const content = importFromMarkdown("hello world");
    const snapshot = createContentSnapshot(content, "database");

    const worldStart = snapshot.markdown.indexOf("world");
    const worldEnd = worldStart + "world".length;

    const result = applyEditOperations({
      snapshot,
      selection: null,
      operations: [
        {
          id: "insert-prefix",
          op: "insert",
          locator: {
            kind: "markdown-range",
            start: { line: 0, ch: 0 },
            end: { line: 0, ch: 0 },
          },
          text: "A ",
          position: "start",
        },
        {
          id: "replace-world",
          op: "replace",
          locator: {
            kind: "markdown-range",
            start: { line: 0, ch: worldStart },
            end: { line: 0, ch: worldEnd },
          },
          text: "Earth",
        },
      ],
    });

    expect(result.markdown).toContain("A hello Earth");
    expect(result.patches).toHaveLength(2);
  });

  it("应拦截重叠区间", () => {
    const content = importFromMarkdown("abcdefgh");
    const snapshot = createContentSnapshot(content, "database");

    try {
      applyEditOperations({
        snapshot,
        selection: null,
        operations: [
          {
            op: "replace",
            locator: {
              kind: "markdown-range",
              start: { line: 0, ch: 1 },
              end: { line: 0, ch: 5 },
            },
            text: "X",
          },
          {
            op: "delete",
            locator: {
              kind: "markdown-range",
              start: { line: 0, ch: 4 },
              end: { line: 0, ch: 7 },
            },
          },
        ],
      });
      throw new Error("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EditEngineError);
      const typed = error as EditEngineError;
      expect(typed.code).toBe("OVERLAPPING_OPERATIONS");
      expect(typed.details?.previous).toBeTruthy();
      expect(typed.details?.current).toBeTruthy();
    }
  });

  it("replace 目标变化时应触发守卫错误", () => {
    const content = importFromMarkdown("hello world");
    const snapshot = createContentSnapshot(content, "database");

    try {
      applyEditOperations({
        snapshot,
        selection: null,
        operations: [
          {
            id: "replace-guard",
            op: "replace",
            locator: {
              kind: "markdown-range",
              start: { line: 0, ch: 0 },
              end: { line: 0, ch: 5 },
            },
            text: "Hi",
            expectedText: "HELLO",
          },
        ],
      });
      throw new Error("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EditEngineError);
      const typed = error as EditEngineError;
      expect(typed.code).toBe("REPLACE_GUARD_MISMATCH");
      expect(typed.details?.operationId).toBe("replace-guard");
      expect(typed.details?.actualText).toBe("hello");
      expect(typed.details?.expectedText).toBe("HELLO");
    }
  });

  it("replace 守卫应返回范围错配诊断信息", () => {
    const content = importFromMarkdown("0123456789abcdef");
    const snapshot = createContentSnapshot(content, "database");

    try {
      applyEditOperations({
        snapshot,
        selection: null,
        operations: [
          {
            id: "replace-long-expected",
            op: "replace",
            locator: {
              kind: "markdown-range",
              start: { line: 0, ch: 5 },
              end: { line: 0, ch: 8 },
            },
            expectedText: "一个远长于目标范围的 expectedText",
            text: "XXX",
          },
        ],
      });
      throw new Error("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EditEngineError);
      const typed = error as EditEngineError;
      expect(typed.code).toBe("REPLACE_GUARD_MISMATCH");
      expect(typed.details?.likelyCause).toBe("locator_range_mismatch");
      expect(typed.details?.suggestion).toBeTruthy();
      expect((typed.details?.range as { length?: number })?.length).toBe(3);
    }
  });
});

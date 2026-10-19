import { createEditor, Transforms, type Editor } from "slate";
import { ReactEditor } from "slate-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandRegistry, createCommandDispatcher } from "@tau/editor/api";
import { createCircuitBreaker } from "../../../../core/kit/extensionGuard";
import {
  codeBlockHighlightCommands,
  highlightCommandIds,
} from "../extensions/code-block/highlightCommands";
import type { CodeBlockElement } from "../types";

const setup = (extra: Partial<CodeBlockElement> = {}) => {
  const editor = createEditor();
  const block: CodeBlockElement = {
    type: "code-block",
    uuid: "highlight-block",
    code: "a\nb\nc\nd",
    language: "TypeScript",
    children: [{ type: "formatted", text: "" }],
    ...extra,
  };
  editor.children = [block];
  const registry = new CommandRegistry();
  registry.register("tau.code-block", codeBlockHighlightCommands);
  const breaker = createCircuitBreaker(() => ({ report: vi.fn() }));
  const record = vi.spyOn(breaker, "record");
  const dispatcher = createCommandDispatcher(registry, breaker);
  const execute = (id: string, payload: unknown, path = [0], target = block) =>
    dispatcher.execute(editor, id, {
      element: target,
      path,
      payload,
    });
  return { editor, execute, record, dispatcher, block };
};
const blockOf = (editor: Editor) => editor.children[0] as CodeBlockElement;
afterEach(() => vi.restoreAllMocks());

describe("高亮行使用同一命令通道", () => {
  it("普通代码合并范围，移除最后范围时删除字段", () => {
    const { editor, execute } = setup({ highlightLines: "1,4" });
    expect(execute(highlightCommandIds.add, { start: 2, end: 3 })).toBe(true);
    expect(blockOf(editor).highlightLines).toBe("1-4");
    expect(execute(highlightCommandIds.remove, { start: 1, end: 4 })).toBe(true);
    expect(blockOf(editor)).not.toHaveProperty("highlightLines");
  });
  it("Diff 只更新激活步骤，保持其他步骤和外层字段", () => {
    const { editor, execute } = setup({
      highlightLines: "4",
      magicMove: {
        v: 1,
        activeStep: 1,
        steps: [
          { id: "first", code: "a", highlightLines: "1" },
          { id: "second", code: "a\nb\nc", highlightLines: "2" },
        ],
      },
    });
    execute(highlightCommandIds.add, { start: 3, end: 3 });
    expect(blockOf(editor).magicMove?.steps[0]).toEqual({
      id: "first",
      code: "a",
      highlightLines: "1",
    });
    expect(blockOf(editor).magicMove?.steps[1].highlightLines).toBe("2-3");
    expect(blockOf(editor).highlightLines).toBe("4");
    execute(highlightCommandIds.remove, { start: 2, end: 3 });
    expect(blockOf(editor).magicMove?.steps[1].highlightLines).toBeUndefined();
  });
  it("只读时不修改内容，非法范围也不修改节点", () => {
    const { editor, execute } = setup();
    execute(highlightCommandIds.add, { start: 0, end: Number.NaN });
    expect(blockOf(editor)).not.toHaveProperty("highlightLines");
    vi.spyOn(ReactEditor, "isReadOnly").mockReturnValue(true);
    expect(execute(highlightCommandIds.add, { start: 1, end: 2 })).toBe(false);
    expect(blockOf(editor)).not.toHaveProperty("highlightLines");
  });
  it("非法 payload 与越界行号安全结束，不写入或消耗故障额度", () => {
    const { editor, execute, record } = setup({ highlightLines: "1" });
    const before = JSON.stringify(editor.children);
    for (const payload of [
      null,
      {},
      [],
      "1-2",
      { start: 1.5, end: 2 },
      { start: -1, end: 2 },
      { start: 1, end: Infinity },
      { start: 1, end: Number.MAX_SAFE_INTEGER },
      { start: 2 ** 53, end: 2 ** 53 },
      { start: 1, end: 5 },
    ]) {
      execute(highlightCommandIds.add, payload);
      execute(highlightCommandIds.remove, payload);
    }
    expect(JSON.stringify(editor.children)).toBe(before);
    expect(record).not.toHaveBeenCalled();
    execute(highlightCommandIds.add, { start: 3, end: 2 });
    expect(blockOf(editor).highlightLines).toBe("1-3");
  });

  it("Diff 按激活步骤源码校验行号，不借用外层源码长度", () => {
    const { editor, execute } = setup({
      magicMove: { v: 1, activeStep: 0, steps: [{ id: "first", code: "a" }] },
    });
    execute(highlightCommandIds.add, { start: 1, end: 2 });
    expect(blockOf(editor).magicMove?.steps[0].highlightLines).toBeUndefined();
    execute(highlightCommandIds.add, { start: 1, end: 1 });
    expect(blockOf(editor).magicMove?.steps[0].highlightLines).toBe("1");
  });

  it("过期或非法路径不熔断，后续有效命令仍可执行", () => {
    const { editor, execute, record } = setup();
    for (const path of [[9], [9], [9], [], [-1], [0.5], [NaN]]) {
      expect(execute(highlightCommandIds.add, { start: 1, end: 2 }, path)).toBe(true);
    }
    expect(record).not.toHaveBeenCalled();
    expect(execute(highlightCommandIds.add, { start: 1, end: 2 })).toBe(true);
    expect(blockOf(editor).highlightLines).toBe("1-2");
  });

  it("目标删除或替换后不误写其他节点，未挂载目标不计故障", () => {
    const { editor, execute, record, dispatcher, block } = setup();
    editor.children = [];
    execute(highlightCommandIds.add, { start: 1, end: 1 });
    editor.children = [{ ...block, uuid: "replacement" }];
    execute(highlightCommandIds.add, { start: 1, end: 1 });
    expect(blockOf(editor)).not.toHaveProperty("highlightLines");
    vi.spyOn(ReactEditor, "findPath").mockImplementation(() => {
      throw new Error("已卸载");
    });
    dispatcher.execute(editor, highlightCommandIds.add, {
      element: block,
      payload: { start: 1, end: 1 },
    });
    expect(record).not.toHaveBeenCalled();
  });

  it("实际写入异常仍经 dispatcher 上报和熔断", () => {
    const { execute, record } = setup();
    const write = vi.spyOn(Transforms, "setNodes").mockImplementation(() => {
      throw new Error("写入失败");
    });
    for (let index = 0; index < 4; index++) {
      expect(execute(highlightCommandIds.add, { start: 1, end: 2 })).toBe(false);
    }
    expect(record).toHaveBeenCalledTimes(3);
    expect(write).toHaveBeenCalledTimes(3);
  });
});

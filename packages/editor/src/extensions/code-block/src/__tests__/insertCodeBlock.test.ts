import { createEditor, Descendant, Transforms } from "slate";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CodeBlockController } from "../extensions/code-block/types";
import { insertCodeBlock } from "../insert";
import { bindElementDefinitions } from "../../../../core/api/elementVersions";

const { mockedCodeBlockMap } = vi.hoisted(() => ({
  mockedCodeBlockMap: new Map<string, CodeBlockController>(),
}));

vi.mock("../extensions/code-block/utils/controllerMaps", () => ({
  codeBlockMap: mockedCodeBlockMap,
  codeBlockActionsMap: new Map(),
}));

const createParagraph = (text = "") => ({
  type: "paragraph" as const,
  children: [{ type: "formatted" as const, text }],
});

const selectPath = (editor: ReturnType<typeof createEditor>, path: number[], offset = 0) => {
  Transforms.select(editor, {
    anchor: { path, offset },
    focus: { path, offset },
  });
};

describe("insertCodeBlock 焦点恢复", () => {
  it("当前声明为 v2 时直接创建源码子节点，不生成旧根源码", () => {
    vi.useFakeTimers();
    const editor = createEditor();
    editor.children = [createParagraph("")] as Descendant[];
    bindElementDefinitions(editor, [
      {
        type: "code-block",
        dataVersion: 2,
        kind: "block",
        isVoid: true,
        render: () => null as never,
      },
    ]);
    selectPath(editor, [0, 0]);
    insertCodeBlock(editor, "ts", "const value = 1;");
    expect(editor.children[0]).toMatchObject({
      type: "code-block",
      children: [{ type: "code-step", code: "const value = 1;" }],
    });
    expect(editor.children[0]).not.toHaveProperty("code");
  });

  afterEach(() => {
    mockedCodeBlockMap.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("插入代码块后即使 controller 延迟注册也应最终聚焦到代码编辑器", () => {
    vi.useFakeTimers();

    const editor = createEditor();
    editor.children = [createParagraph("")] as Descendant[];
    selectPath(editor, [0, 0], 0);

    const focus = vi.fn();
    const setCursor = vi.fn();
    const controller: CodeBlockController = {
      focus,
      setCursor,
      getValue: vi.fn(() => ""),
      setValue: vi.fn(),
      getCursor: vi.fn(() => ({ line: 0, ch: 0 })),
      getLine: vi.fn(() => ""),
      lastLine: vi.fn(() => 0),
    };

    insertCodeBlock(editor, "ts");

    const inserted = editor.children[0] as any;
    expect(inserted.type).toBe("code-block");
    expect(focus).not.toHaveBeenCalled();

    setTimeout(() => {
      mockedCodeBlockMap.set(inserted.uuid, controller);
    }, 120);

    vi.advanceTimersByTime(160);

    expect(focus).toHaveBeenCalledTimes(1);
    expect(setCursor).toHaveBeenCalledWith({ line: 0, ch: 0 });
  });
});

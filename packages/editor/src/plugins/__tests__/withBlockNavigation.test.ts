import { createEditor, Descendant, Transforms } from "slate";
import { afterEach, describe, expect, it, vi } from "vitest";

import { insertBreak as withListItemInsertBreak } from "../../extensions/list-item/plugins/insertBreak";
import { createVoidElementPlugin } from "../../utils/plugin";
import {
  registerBlockNavigation,
  unregisterBlockNavigation,
} from "../../utils/blockNavigation";
import { withBlockNavigation } from "../withBlockNavigation";

const createParagraph = (text = "") => ({
  type: "paragraph" as const,
  children: [{ text }],
});

const createCodeBlock = () => ({
  type: "code-block" as const,
  code: "const a = 1;",
  language: "ts",
  uuid: "code-block-1",
  children: [{ text: "" }],
});

const selectPath = (
  editor: ReturnType<typeof createEditor>,
  path: number[],
) => {
  Transforms.select(editor, {
    anchor: { path, offset: 0 },
    focus: { path, offset: 0 },
  });
};

describe("withBlockNavigation", () => {
  const registeredBlocks = new Set<object>();

  afterEach(() => {
    registeredBlocks.forEach((block) =>
      unregisterBlockNavigation(block as any),
    );
    registeredBlocks.clear();
  });

  it("顶层空段落按 Enter 时不应回跳到上一个代码块", () => {
    const previousBlock = createCodeBlock();
    const focusEnd = vi.fn(() => true);
    registerBlockNavigation(previousBlock as any, { focusEnd });
    registeredBlocks.add(previousBlock);

    let editor = createEditor();
    editor = createVoidElementPlugin("code-block")(editor);
    editor = withBlockNavigation(editor);
    editor.children = [previousBlock, createParagraph("")] as Descendant[];

    selectPath(editor, [1, 0]);

    editor.insertBreak();

    expect(focusEnd).not.toHaveBeenCalled();
    expect(editor.children).toHaveLength(3);
    expect((editor.children[0] as any).type).toBe("code-block");
    expect((editor.children[1] as any).type).toBe("paragraph");
    expect((editor.children[2] as any).type).toBe("paragraph");
    expect(editor.selection?.anchor.path[0]).not.toBe(0);
  });

  it("列表项最后一个空段落按 Enter 时应创建新的列表项", () => {
    const previousBlock = createCodeBlock();
    const focusEnd = vi.fn(() => true);
    registerBlockNavigation(previousBlock as any, { focusEnd });
    registeredBlocks.add(previousBlock);

    let editor = createEditor();
    editor = createVoidElementPlugin("code-block")(editor);
    editor = withListItemInsertBreak(editor);
    editor = withBlockNavigation(editor);
    editor.children = [
      {
        type: "bulleted-list",
        children: [
          {
            type: "list-item",
            children: [previousBlock, createParagraph("")],
          },
        ],
      },
    ] as Descendant[];

    selectPath(editor, [0, 0, 1, 0]);

    editor.insertBreak();

    const list = editor.children[0] as any;
    expect(focusEnd).not.toHaveBeenCalled();
    expect(list.type).toBe("bulleted-list");
    expect(list.children).toHaveLength(2);
    expect(list.children[1].type).toBe("list-item");
    expect(list.children[1].children).toHaveLength(1);
    expect(list.children[1].children[0].type).toBe("paragraph");
    expect(editor.selection?.anchor.path.slice(0, 2)).toEqual([0, 1]);
  });

  it("空段落按 Delete 时仍应回到上一个可导航块", () => {
    const previousBlock = createCodeBlock();
    const focusEnd = vi.fn(() => true);
    registerBlockNavigation(previousBlock as any, { focusEnd });
    registeredBlocks.add(previousBlock);

    let editor = createEditor();
    editor = createVoidElementPlugin("code-block")(editor);
    editor = withBlockNavigation(editor);
    editor.children = [previousBlock, createParagraph("")] as Descendant[];

    selectPath(editor, [1, 0]);

    editor.deleteBackward("character");

    expect(focusEnd).toHaveBeenCalledTimes(1);
    expect(editor.children).toHaveLength(1);
    expect((editor.children[0] as any).type).toBe("code-block");
  });
});

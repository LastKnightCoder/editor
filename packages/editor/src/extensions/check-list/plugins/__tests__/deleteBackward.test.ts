import {
  createEditor,
  Descendant,
  Editor,
  Node,
  Path,
  Transforms,
} from "slate";
import { ReactEditor, withReact } from "slate-react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { withNormalize as withEditorNormalize } from "../../../../plugins/withNormalize";
import { deleteBackward as withCheckListDeleteBackward } from "../deleteBackward";
import { withNormalize as withCheckListNormalize } from "../normalize";

const createParagraph = (text: string) => ({
  type: "paragraph" as const,
  children: [{ type: "formatted" as const, text }],
});

const createCheckListItem = (text: string, checked = false) => ({
  type: "check-list-item" as const,
  checked,
  children: [createParagraph(text)],
});

const createCheckList = (
  children: Array<
    | ReturnType<typeof createCheckListItem>
    | {
        type: "check-list-item";
        checked: boolean;
        children: [
          ReturnType<typeof createParagraph>,
          {
            type: "check-list";
            children: ReturnType<typeof createCheckListItem>[];
          },
        ];
      }
  >,
) => ({
  type: "check-list" as const,
  children,
});

const selectTextStart = (
  editor: ReturnType<typeof createEditor>,
  path: number[],
) => {
  const point = Editor.start(editor, path);
  Transforms.select(editor, {
    anchor: point,
    focus: point,
  });
};

const createChecklistEditor = () => {
  let editor = createEditor();
  editor = withReact(editor);
  editor = withEditorNormalize(editor);
  editor = withCheckListNormalize(editor);
  editor = withCheckListDeleteBackward(editor);
  return editor;
};

const findNodePath = (
  descendants: Descendant[],
  target: Node,
  parentPath: Path = [],
): Path | null => {
  for (let index = 0; index < descendants.length; index++) {
    const node = descendants[index] as Node;
    const path = [...parentPath, index];
    if (node === target) {
      return path;
    }
    if ("children" in node) {
      const childPath = findNodePath(
        node.children as Descendant[],
        target,
        path,
      );
      if (childPath) {
        return childPath;
      }
    }
  }
  return null;
};

beforeAll(() => {
  vi.spyOn(ReactEditor, "findPath").mockImplementation((editor, node) => {
    const path = findNodePath(editor.children as Descendant[], node);
    if (!path) {
      throw new Error(
        `Unable to find the path for Slate node: ${JSON.stringify(node)}`,
      );
    }
    return path;
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("check-list deleteBackward plugin", () => {
  it("顶层唯一空任务项在行首退格时应退化为单个空段落", () => {
    const editor = createChecklistEditor();
    editor.children = [
      createCheckList([createCheckListItem("")]),
    ] as Descendant[];

    selectTextStart(editor, [0, 0, 0]);

    editor.deleteBackward("character");

    expect(editor.children).toEqual([
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "" }],
      },
    ]);
    expect(editor.selection).toEqual({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 0 },
    });
  });

  it("文末唯一空任务项在行首退格时应在原位置生成空段落", () => {
    const editor = createChecklistEditor();
    editor.children = [
      createParagraph("前文"),
      createCheckList([createCheckListItem("")]),
    ] as Descendant[];

    selectTextStart(editor, [1, 0, 0]);

    editor.deleteBackward("character");

    expect(editor.children).toEqual([
      createParagraph("前文"),
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "" }],
      },
    ]);
    expect(editor.selection).toEqual({
      anchor: { path: [1, 0], offset: 0 },
      focus: { path: [1, 0], offset: 0 },
    });
  });

  it("嵌套唯一空任务项在行首退格时应只删除子列表", () => {
    const editor = createChecklistEditor();
    editor.children = [
      createCheckList([
        {
          type: "check-list-item",
          checked: false,
          children: [
            createParagraph("父项"),
            createCheckList([createCheckListItem("")]),
          ],
        },
      ]),
    ] as Descendant[];

    selectTextStart(editor, [0, 0, 1, 0, 0]);

    editor.deleteBackward("character");

    expect(editor.children).toEqual([
      createCheckList([
        {
          type: "check-list-item",
          checked: false,
          children: [createParagraph("父项")],
        },
      ]),
    ]);
  });
});

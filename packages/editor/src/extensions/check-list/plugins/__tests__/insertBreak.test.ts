import { createEditor, Descendant, Transforms } from "slate";
import { withReact } from "slate-react";
import { describe, expect, it } from "vitest";

import type {
  CheckListElement,
  CheckListItemElement,
  ParagraphElement,
} from "../../../../types";
import { withNormalize } from "../normalize";
import { insertBreak as withCheckListInsertBreak } from "../insertBreak";

const createParagraph = (text: string): ParagraphElement => ({
  type: "paragraph" as const,
  children: [{ type: "formatted" as const, text }],
});

const createCheckListItem = (
  text: string,
  checked: boolean,
): CheckListItemElement => ({
  type: "check-list-item" as const,
  checked,
  children: [createParagraph(text)],
});

const createCheckList = (
  children: CheckListItemElement[],
): CheckListElement => ({
  type: "check-list" as const,
  children,
});

const selectTextEnd = (
  editor: ReturnType<typeof createEditor>,
  path: number[],
  offset: number,
) => {
  Transforms.select(editor, {
    anchor: { path, offset },
    focus: { path, offset },
  });
};

describe("check-list insertBreak plugin", () => {
  it("已勾选条目末尾回车时应保留当前条目状态，并创建未勾选的新条目", () => {
    let editor = createEditor();
    editor = withReact(editor);
    editor = withNormalize(editor);
    editor = withCheckListInsertBreak(editor);
    editor.children = [
      {
        type: "check-list",
        children: [createCheckListItem("这是 checked", true)],
      },
    ] as Descendant[];

    selectTextEnd(editor, [0, 0, 0, 0], "这是 checked".length);

    editor.insertBreak();

    expect(editor.children).toEqual([
      {
        type: "check-list",
        children: [
          createCheckListItem("这是 checked", true),
          createCheckListItem("", false),
        ],
      },
    ]);
    expect(editor.selection).toEqual({
      anchor: { path: [0, 1, 0, 0], offset: 0 },
      focus: { path: [0, 1, 0, 0], offset: 0 },
    });
  });

  it("未勾选条目末尾回车时应创建新的未勾选条目", () => {
    let editor = createEditor();
    editor = withReact(editor);
    editor = withNormalize(editor);
    editor = withCheckListInsertBreak(editor);
    editor.children = [
      createCheckList([createCheckListItem("待办事项", false)]),
    ] as Descendant[];

    selectTextEnd(editor, [0, 0, 0, 0], "待办事项".length);

    editor.insertBreak();

    expect(editor.children).toEqual([
      createCheckList([
        createCheckListItem("待办事项", false),
        createCheckListItem("", false),
      ]),
    ]);
    expect(editor.selection).toEqual({
      anchor: { path: [0, 1, 0, 0], offset: 0 },
      focus: { path: [0, 1, 0, 0], offset: 0 },
    });
  });

  it("空条目回车时应退出 checklist 并转为普通段落", () => {
    let editor = createEditor();
    editor = withReact(editor);
    editor = withNormalize(editor);
    editor = withCheckListInsertBreak(editor);
    editor.children = [
      createCheckList([createCheckListItem("", false)]),
    ] as Descendant[];

    selectTextEnd(editor, [0, 0, 0, 0], 0);

    editor.insertBreak();

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

  it("嵌套 checklist 条目末尾回车时应在当前层级新增未勾选条目", () => {
    let editor = createEditor();
    editor = withReact(editor);
    editor = withNormalize(editor);
    editor = withCheckListInsertBreak(editor);
    editor.children = [
      createCheckList([
        {
          type: "check-list-item",
          checked: false,
          children: [
            createParagraph("父级"),
            createCheckList([createCheckListItem("子项已完成", true)]),
          ],
        },
      ]),
    ] as Descendant[];

    selectTextEnd(editor, [0, 0, 1, 0, 0, 0], "子项已完成".length);

    editor.insertBreak();

    expect(editor.children).toEqual([
      createCheckList([
        {
          type: "check-list-item",
          checked: false,
          children: [
            createParagraph("父级"),
            createCheckList([
              createCheckListItem("子项已完成", true),
              createCheckListItem("", false),
            ]),
          ],
        },
      ]),
    ]);
    expect(editor.selection).toEqual({
      anchor: { path: [0, 0, 1, 1, 0, 0], offset: 0 },
      focus: { path: [0, 0, 1, 1, 0, 0], offset: 0 },
    });
  });
});

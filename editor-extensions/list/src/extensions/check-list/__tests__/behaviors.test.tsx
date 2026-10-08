// 勾选列表行为的等价测试（原 plugins/__tests__ 两个文件的用例，装配换成真实 kit 的行为分发；
// ReactEditor.findPath 在真实挂载下可用，不再需要 mock）
import { createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { Editor as SlateEditor, Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, createEditorKit } from "@tau/editor";
import { checkListExtension, checkListItemExtension } from "..";
import type { EditorRef } from "@tau/editor";
import { createDefaultEditorSlots } from "@tau/editor-media/slots";
import { IEditorSlots } from "@tau/editor-media/services";
import type { CheckListElement, CheckListItemElement, ParagraphElement } from "../../../types";

const createParagraph = (text: string): ParagraphElement => ({
  type: "paragraph" as const,
  children: [{ type: "formatted" as const, text }],
});

const createCheckListItem = (text: string, checked = false): CheckListItemElement => ({
  type: "check-list-item" as const,
  checked,
  children: [createParagraph(text)],
});

const createCheckList = (children: CheckListItemElement[]): CheckListElement => ({
  type: "check-list" as const,
  children,
});

// 结构断言不关心规范化补上的随机 taskId
const withoutTaskIds = (nodes: unknown): unknown =>
  Array.isArray(nodes)
    ? nodes.map(withoutTaskIds)
    : nodes && typeof nodes === "object"
      ? Object.fromEntries(
          Object.entries(nodes)
            .filter(([key]) => key !== "taskId")
            .map(([key, value]) => [key, withoutTaskIds(value)])
        )
      : nodes;

const collectTaskIds = (nodes: Descendant[]): (string | undefined)[] =>
  nodes.flatMap(node =>
    "type" in node && "children" in node
      ? [
          ...(node.type === "check-list-item" ? [(node as CheckListItemElement).taskId] : []),
          ...collectTaskIds(node.children as Descendant[]),
        ]
      : []
  );

const mount = async (initValue: Descendant[]) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const ref = createRef<EditorRef>();
  const kit = createEditorKit({
    extensions: [checkListExtension, checkListItemExtension],
    services: [register => register(IEditorSlots, createDefaultEditorSlots())],
  });
  await act(async () => {
    root.render(
      <DndProvider backend={HTML5Backend}>
        <Editor ref={ref} kit={kit} readonly={false} initValue={initValue} />
      </DndProvider>
    );
  });
  return {
    editor: ref.current!.getEditor(),
    done: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
};

const selectTextStart = async (editor: ReturnType<EditorRef["getEditor"]>, path: number[]) => {
  const point = SlateEditor.start(editor, path);
  await act(async () => {
    Transforms.select(editor, { anchor: point, focus: point });
  });
};

const selectTextEnd = async (
  editor: ReturnType<EditorRef["getEditor"]>,
  path: number[],
  offset: number
) => {
  const point = { path: [...path], offset };
  await act(async () => {
    Transforms.select(editor, { anchor: point, focus: point });
  });
};

describe("check-list deleteBackward 行为", () => {
  it("顶层唯一空任务项在行首退格时应退化为单个空段落", async () => {
    const { editor, done } = await mount([createCheckList([createCheckListItem("")])]);

    await selectTextStart(editor, [0, 0, 0]);
    await act(async () => editor.deleteBackward("character"));

    expect(withoutTaskIds(editor.children)).toEqual([
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "" }],
      },
    ]);
    expect(editor.selection).toEqual({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 0 },
    });
    await done();
  });

  it("文末唯一空任务项在行首退格时应在原位置生成空段落", async () => {
    const { editor, done } = await mount([
      createParagraph("前文"),
      createCheckList([createCheckListItem("")]),
    ]);

    await selectTextStart(editor, [1, 0, 0]);
    await act(async () => editor.deleteBackward("character"));

    expect(withoutTaskIds(editor.children)).toEqual([
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
    await done();
  });

  it("嵌套唯一空任务项在行首退格时应只删除子列表", async () => {
    const { editor, done } = await mount([
      createCheckList([
        {
          type: "check-list-item",
          checked: false,
          children: [createParagraph("父项"), createCheckList([createCheckListItem("")])],
        },
      ]),
    ]);

    await selectTextStart(editor, [0, 0, 1, 0, 0]);
    await act(async () => editor.deleteBackward("character"));

    expect(withoutTaskIds(editor.children)).toEqual([
      createCheckList([
        {
          type: "check-list-item",
          checked: false,
          children: [createParagraph("父项")],
        },
      ]),
    ]);
    await done();
  });
});

describe("check-list insertBreak 行为", () => {
  it("已勾选条目末尾回车时应保留当前条目状态，并创建未勾选的新条目", async () => {
    const { editor, done } = await mount([
      createCheckList([createCheckListItem("这是 checked", true)]),
    ]);

    await selectTextEnd(editor, [0, 0, 0, 0], "这是 checked".length);
    await act(async () => editor.insertBreak());

    expect(withoutTaskIds(editor.children)).toEqual([
      createCheckList([createCheckListItem("这是 checked", true), createCheckListItem("", false)]),
    ]);
    expect(editor.selection).toEqual({
      anchor: { path: [0, 1, 0, 0], offset: 0 },
      focus: { path: [0, 1, 0, 0], offset: 0 },
    });
    await done();
  });

  it("未勾选条目末尾回车时应创建新的未勾选条目", async () => {
    const { editor, done } = await mount([
      createCheckList([createCheckListItem("待办事项", false)]),
    ]);

    await selectTextEnd(editor, [0, 0, 0, 0], "待办事项".length);
    await act(async () => editor.insertBreak());

    expect(withoutTaskIds(editor.children)).toEqual([
      createCheckList([createCheckListItem("待办事项", false), createCheckListItem("", false)]),
    ]);
    expect(editor.selection).toEqual({
      anchor: { path: [0, 1, 0, 0], offset: 0 },
      focus: { path: [0, 1, 0, 0], offset: 0 },
    });
    await done();
  });

  it("空条目回车时应退出 checklist 并转为普通段落", async () => {
    const { editor, done } = await mount([createCheckList([createCheckListItem("", false)])]);

    await selectTextEnd(editor, [0, 0, 0, 0], 0);
    await act(async () => editor.insertBreak());

    expect(withoutTaskIds(editor.children)).toEqual([
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "" }],
      },
    ]);
    expect(editor.selection).toEqual({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 0 },
    });
    await done();
  });

  it("嵌套 checklist 条目末尾回车时应在当前层级新增未勾选条目", async () => {
    const { editor, done } = await mount([
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
    ]);

    await selectTextEnd(editor, [0, 0, 1, 0, 0, 0], "子项已完成".length);
    await act(async () => editor.insertBreak());

    expect(withoutTaskIds(editor.children)).toEqual([
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
    await done();
  });
});

describe("check-list-item taskId", () => {
  it("挂载时为缺失 taskId 的勾选项（含嵌套）补齐互不相同的 id", async () => {
    const { editor, done } = await mount([
      createCheckList([
        {
          type: "check-list-item",
          checked: false,
          children: [createParagraph("父级"), createCheckList([createCheckListItem("子项")])],
        },
        createCheckListItem("第二项"),
      ]),
    ]);

    const ids = collectTaskIds(editor.children);
    expect(ids).toHaveLength(3);
    expect(ids.every(id => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(3);
    await done();
  });

  it("已有 taskId 保持不变", async () => {
    const { editor, done } = await mount([
      createCheckList([{ ...createCheckListItem("甲"), taskId: "keep-a" }]),
    ]);

    expect(collectTaskIds(editor.children)).toEqual(["keep-a"]);
    await done();
  });

  it("重复 taskId 时文档序靠前者保留，后出现者换新 id", async () => {
    const { editor, done } = await mount([
      createCheckList([
        { ...createCheckListItem("原件"), taskId: "dup" },
        { ...createCheckListItem("粘贴的副本"), taskId: "dup" },
      ]),
    ]);

    const [first, second] = collectTaskIds(editor.children);
    expect(first).toBe("dup");
    expect(second).toBeTruthy();
    expect(second).not.toBe("dup");
    await done();
  });

  it("末尾回车新增的勾选项获得新 id，原项 id 不变", async () => {
    const { editor, done } = await mount([
      createCheckList([{ ...createCheckListItem("任务"), taskId: "orig" }]),
    ]);

    await selectTextEnd(editor, [0, 0, 0, 0], "任务".length);
    await act(async () => editor.insertBreak());

    const [first, second] = collectTaskIds(editor.children);
    expect(first).toBe("orig");
    expect(second).toBeTruthy();
    expect(second).not.toBe("orig");
    await done();
  });

  it("中间拆行后两项 id 不重复", async () => {
    const { editor, done } = await mount([
      createCheckList([{ ...createCheckListItem("前半后半"), taskId: "split" }]),
    ]);

    await selectTextEnd(editor, [0, 0, 0, 0], 2);
    await act(async () => editor.insertBreak());

    const ids = collectTaskIds(editor.children);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toContain("split");
    await done();
  });

  it("插入复制来的片段时副本换新 id", async () => {
    const { editor, done } = await mount([
      createCheckList([{ ...createCheckListItem("原件"), taskId: "src" }]),
      createParagraph(""),
    ]);

    await selectTextStart(editor, [1, 0]);
    await act(async () =>
      editor.insertFragment([createCheckList([{ ...createCheckListItem("副本"), taskId: "src" }])])
    );

    const ids = collectTaskIds(editor.children);
    expect(ids.filter(id => id === "src")).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
    await done();
  });
});

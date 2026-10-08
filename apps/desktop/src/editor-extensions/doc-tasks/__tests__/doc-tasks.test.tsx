import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor as SlateEditor, Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { listExtensions } from "@tau/editor-list";
import { createDefaultEditorSlots } from "@tau/editor-media/slots";
import { IEditorSlots } from "@tau/editor-media/services";
import docTasksExtension, { absolutizeDateBeforeCursor } from "..";
import { IDocTaskGroups, type DocTaskGroupsService } from "../service";
import { useTagPickerStore } from "../store";

const groups = [
  { id: 1, title: "笔记" },
  { id: 2, title: "笔记软件开发" },
];
const service = (): DocTaskGroupsService => ({
  list: () => groups,
  subscribe: () => () => {},
  create: vi.fn(async (title: string) => ({ id: 9, title })),
  dotClass: () => "bg-accent",
});

const item = (text: string, taskId = "t1") => ({
  type: "check-list",
  children: [
    {
      type: "check-list-item",
      checked: false,
      taskId,
      children: [{ type: "paragraph", children: [{ type: "formatted", text }] }],
    },
  ],
});

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const done of cleanup.splice(0)) await done();
  useTagPickerStore.setState({ editor: null, query: "", activeIndex: 0, items: [] });
});

async function mount(initValue: Descendant[], withService = true) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const ref = createRef<EditorRef>();
  const kit = createEditorKit({
    extensions: [...listExtensions, docTasksExtension],
    services: [
      register => register(IEditorSlots, createDefaultEditorSlots()),
      register => withService && register(IDocTaskGroups, service()),
    ],
  });
  await act(async () => {
    root.render(
      <DndProvider backend={HTML5Backend}>
        <Editor ref={ref} kit={kit} readonly={false} initValue={initValue} />
      </DndProvider>
    );
  });
  cleanup.push(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  return { container, editor: ref.current!.getEditor() };
}

const firstText = [0, 0, 0, 0];

describe("文档待办编辑器扩展", () => {
  it("勾选项里的 #项目 与日期渲染为胶囊，长项目名优先", async () => {
    const { container, editor } = await mount([item("整理 #笔记软件开发 2026年10月10日") as never]);
    const group = container.querySelector('[data-doc-task-token="group"]');
    expect(group?.textContent).toContain("#笔记软件开发");
    expect(container.querySelector('[data-doc-task-token="date"]')?.textContent).toContain(
      "2026年10月10日"
    );
    // 装饰不进文档
    expect(JSON.stringify(editor.children)).not.toContain("docTaskToken");
  });

  it("普通段落里的 #词 不装饰", async () => {
    const { container } = await mount([
      { type: "paragraph", children: [{ type: "formatted", text: "看 #笔记" }] } as never,
    ]);
    expect(container.querySelector("[data-doc-task-token]")).toBeNull();
  });

  it("没注入项目服务时不生效", async () => {
    const { container } = await mount([item("整理 #笔记") as never], false);
    expect(container.querySelector("[data-doc-task-token]")).toBeNull();
  });

  it("勾选项里输入 # 打开候选，确认后补全完整项目名", async () => {
    const { editor } = await mount([item("整理 ") as never]);
    await act(async () => {
      Transforms.select(editor, SlateEditor.end(editor, firstText));
      editor.insertText("#");
      editor.insertText("软");
    });
    expect(useTagPickerStore.getState()).toMatchObject({ editor, query: "软" });
    const target = useTagPickerStore.getState().items.find(i => i.title === "笔记软件开发");
    expect(target).toBeTruthy();
    const { selectTagPickerItem } = await import("../store");
    await act(async () => selectTagPickerItem(target!));
    expect(SlateEditor.string(editor, firstText)).toBe("整理 #笔记软件开发 ");
    expect(useTagPickerStore.getState().editor).toBeNull();
  });

  it("相对日期词后输入空格改写成带年份的绝对日期；整词不是日期时不动", async () => {
    const { editor } = await mount([item("回邮件 明天") as never]);
    const now = new Date(2026, 9, 8, 10);
    await act(async () => {
      Transforms.select(editor, SlateEditor.end(editor, firstText));
      expect(absolutizeDateBeforeCursor(editor, now)).toBe(true);
    });
    expect(SlateEditor.string(editor, firstText)).toBe("回邮件 2026年10月9日");

    await act(async () => {
      Transforms.insertText(editor, " 明天见", { at: SlateEditor.end(editor, firstText) });
      Transforms.select(editor, SlateEditor.end(editor, firstText));
      expect(absolutizeDateBeforeCursor(editor, now)).toBe(false);
    });
  });
});

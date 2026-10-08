import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor as SlateEditor, Node, Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { listExtensions } from "@tau/editor-list";
import { createDefaultEditorSlots } from "@tau/editor-media/slots";
import { IEditorSlots } from "@tau/editor-media/services";
import docTasksExtension, { absolutizeDateBeforeCursor } from "..";
import { IDocTaskGroups, type DocTaskGroupsService } from "../service";
import { useTagPickerStore } from "../store";
import { openChipMenu, setChipGroup, closeChipMenu } from "../chipMenu";

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
  closeChipMenu();
});

async function mount(
  initValue: Descendant[],
  withService = true,
  readonly = false,
  groupService = service()
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const ref = createRef<EditorRef>();
  const kit = createEditorKit({
    extensions: [...listExtensions, docTasksExtension],
    services: [
      register => register(IEditorSlots, createDefaultEditorSlots()),
      register => withService && register(IDocTaskGroups, groupService),
    ],
  });
  await act(async () => {
    root.render(
      <DndProvider backend={HTML5Backend}>
        <Editor ref={ref} kit={kit} readonly={readonly} initValue={initValue} />
      </DndProvider>
    );
  });
  cleanup.push(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  return {
    container,
    kit,
    editor: ref.current!.getEditor(),
    readonly: () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor ref={ref} kit={kit} readonly initValue={initValue} />
        </DndProvider>
      ),
  };
}

const firstText = [0, 0, 0, 0];

describe("文档待办编辑器扩展", () => {
  it("等待新建项目期间变为只读，迟到结果不改正文", async () => {
    let finish: ((group: { id: number; title: string }) => void) | undefined;
    const groupService = {
      ...service(),
      create: vi.fn(
        () =>
          new Promise<{ id: number; title: string }>(resolve => {
            finish = resolve;
          })
      ),
    };
    const view = await mount([item("整理 ") as never], true, false, groupService);
    await act(async () => {
      Transforms.select(view.editor, SlateEditor.end(view.editor, firstText));
      view.editor.insertText("#");
      view.editor.insertText("新项目");
    });
    const { selectTagPickerItem } = await import("../store");
    let pending: Promise<void>;
    await act(async () => {
      pending = selectTagPickerItem({ kind: "create", title: "新项目" });
    });
    await act(async () => view.readonly());
    await act(async () => {
      finish?.({ id: 9, title: "新项目" });
      await pending;
    });
    expect(Node.string(view.editor)).toBe("整理 #新项目");
  });
  it("只读预览不补随机身份", async () => {
    const content = item("甲") as any;
    delete content.children[0].taskId;
    const { editor } = await mount([content], true, true);
    expect((editor.children[0] as any).children[0].taskId).toBeUndefined();
  });

  it("完整 token 跨叶子替换，保留前后正文", async () => {
    const content = item("") as any;
    content.children[0].children[0].children = [
      { type: "formatted", text: "前 #笔" },
      { type: "formatted", text: "记", bold: true },
      { type: "formatted", text: " 后" },
    ];
    const { editor, container } = await mount([content]);
    await act(async () => {
      openChipMenu(editor, container.querySelector('[data-doc-task-token="group"]')!, "group", {
        anchor: { path: [0, 0, 0, 0], offset: 2 },
        focus: { path: [0, 0, 0, 1], offset: 1 },
      });
      setChipGroup("生活");
    });
    expect(Node.string(editor)).toBe("前 #生活 后");
  });

  it("候选固定原输入位置，光标换段也不删除其它文字", async () => {
    const { editor } = await mount([
      item("整理 ") as never,
      { type: "paragraph", children: [{ type: "formatted", text: "其它文字" }] } as never,
    ]);
    await act(async () => {
      Transforms.select(editor, SlateEditor.end(editor, firstText));
      editor.insertText("#");
      editor.insertText("笔");
    });
    const target = useTagPickerStore
      .getState()
      .items.find(candidate => candidate.title === "笔记")!;
    await act(async () => {
      Transforms.select(editor, SlateEditor.end(editor, [1, 0]));
      await (await import("../store")).selectTagPickerItem(target);
    });
    expect(Node.string(editor)).toBe("整理 #笔记 其它文字");
  });

  it("项目异步返回后已有只读正文的装饰也重算", async () => {
    let current: typeof groups = [];
    const listeners = new Set<() => void>();
    const groupService = {
      ...service(),
      list: () => current,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const { container } = await mount([item("#笔记") as never], true, true, groupService);
    expect(container.querySelector('[data-doc-task-token="group"]')).toBeNull();
    await act(async () => {
      current = groups;
      listeners.forEach(listener => listener());
    });
    expect(container.querySelector('[data-doc-task-token="group"]')?.textContent).toContain(
      "#笔记"
    );
  });

  it("格式拆分的相对词按空格也能绝对化", async () => {
    const content = item("") as any;
    content.children[0].children[0].children = [
      { type: "formatted", text: "明" },
      { type: "formatted", text: "天", bold: true },
    ];
    const { editor } = await mount([content]);
    await act(async () => {
      Transforms.select(editor, SlateEditor.end(editor, [0, 0, 0, 1]));
      expect(absolutizeDateBeforeCursor(editor, new Date(2026, 9, 8))).toBe(true);
    });
    expect(Node.string(editor)).toBe("2026年10月9日");
  });
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

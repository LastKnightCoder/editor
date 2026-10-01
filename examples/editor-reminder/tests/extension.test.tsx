import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { Editor as SlateEditor, Node, Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { expect, it } from "vitest";
import { Editor, createEditorKit, IExtensionErrorReporter, type EditorRef } from "@tau/editor";
import { createParagraph } from "@tau/editor/api";
import {
  createReminder,
  insertReminder,
  reminderExtension,
  type ReminderElement,
} from "@example/editor-reminder";
import { exampleMarkdown } from "../src/host/markdown";

const content = (): ReminderElement => ({
  ...createReminder(),
  children: [{ ...createParagraph(), children: [{ type: "formatted", text: "公开扩展正文" }] }],
});

async function mount(value: Descendant[], readonly = false, enabled = true) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host),
    ref = createRef<EditorRef>();
  const errors: unknown[] = [];
  const kit = createEditorKit({
    extensions: enabled ? [reminderExtension] : [],
    services: [
      register => register(IExtensionErrorReporter, { report: event => errors.push(event) }),
    ],
  });
  await act(async () =>
    root.render(
      <DndProvider backend={HTML5Backend}>
        <Editor ref={ref} kit={kit} initValue={value} readonly={readonly} />
      </DndProvider>
    )
  );
  const editor = ref.current?.getEditor();
  if (!editor) throw new Error("编辑器未挂载");
  return {
    host,
    editor,
    dispose: async () => {
      await act(async () => root.unmount());
      host.remove();
      expect(errors).toEqual([]);
    },
  };
}

it("纯核心宿主显式安装后，真实手柄菜单通过命令更新节点", async () => {
  const view = await mount([content()]);
  try {
    const block = view.host.querySelector("[data-reminder]")?.closest(".ed-block");
    const handle = block?.querySelector<HTMLElement>(":scope > [data-drag-handle]");
    expect(handle).toBeTruthy();
    await act(async () => handle?.click());
    const item = [...document.querySelectorAll("button")].find(
      button => button.textContent === "提醒：标记完成"
    );
    expect(item).toBeTruthy();
    await act(async () => item?.click());
    expect(view.editor.children[0]).toMatchObject({ type: "example.reminder", done: true });
    expect(exampleMarkdown.getMarkdown(view.editor.children)).toContain("done=true");
  } finally {
    await view.dispose();
  }
});

it("公开插入建立段落，空段落回车可退出，完整/部分复制保持原文", async () => {
  const view = await mount([createParagraph()]);
  try {
    await act(async () => {
      Transforms.select(view.editor, SlateEditor.start(view.editor, []));
      insertReminder(view.editor);
    });
    expect(view.editor.children[0].type).toBe("example.reminder");
    await act(async () => view.editor.insertText("公开扩展正文"));
    const before = JSON.stringify(view.editor.children);
    await act(async () => Transforms.select(view.editor, SlateEditor.range(view.editor, [0])));
    expect(view.editor.getFragment()[0]).toMatchObject({ type: "example.reminder", done: false });
    await act(async () =>
      Transforms.select(view.editor, {
        anchor: { path: [0, 0, 0], offset: 1 },
        focus: { path: [0, 0, 0], offset: 3 },
      })
    );
    expect(view.editor.getFragment()).toEqual([
      { type: "paragraph", children: [{ type: "formatted", text: "开扩" }] },
    ]);
    expect(JSON.stringify(view.editor.children)).toBe(before);
    await act(async () => {
      Transforms.select(view.editor, SlateEditor.range(view.editor, [0, 0]));
      view.editor.deleteFragment();
      view.editor.insertBreak();
    });
    expect(view.editor.children).toEqual([createParagraph()]);
  } finally {
    await view.dispose();
  }
});

it("只读与陈旧命令目标不写入，卸载渲染扩展后文档仍可恢复", async () => {
  const value = [content()];
  const readonly = await mount(value, true);
  try {
    const before = JSON.stringify(readonly.editor.children);
    await act(async () => {
      readonly.editor.commands?.execute(
        "example.reminder.toggle",
        undefined,
        readonly.editor.children[0] as ReminderElement
      );
      insertReminder(readonly.editor);
    });
    expect(JSON.stringify(readonly.editor.children)).toBe(before);
  } finally {
    await readonly.dispose();
  }
  const plain = await mount(value, false, false);
  let saved: Descendant[];
  try {
    expect(plain.editor.children).toEqual(value);
    saved = plain.editor.children;
  } finally {
    await plain.dispose();
  }
  const restored = await mount(saved);
  try {
    expect(restored.host.querySelector("[data-reminder]")).toBeTruthy();
    const original = restored.editor.children[0] as ReminderElement;
    await act(async () => Transforms.setNodes(restored.editor, { done: true }, { at: [0] }));
    await act(async () =>
      restored.editor.commands?.execute("example.reminder.toggle", undefined, original, [0])
    );
    expect(restored.editor.children[0]).toMatchObject({ done: true });
    expect(Node.string(restored.editor)).toBe("公开扩展正文");
  } finally {
    await restored.dispose();
  }
});

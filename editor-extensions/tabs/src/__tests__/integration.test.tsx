import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { Editor as SlateEditor, Node, Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { expect, it } from "vitest";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { createMarkdownProcessor } from "@tau/markdown";
import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { tabsExtensions, type TabsElement } from "../index";

const paragraph = (text = "") => ({
  type: "paragraph" as const,
  children: [{ type: "formatted" as const, text }],
});
const tabs = (): TabsElement => ({
  type: "tabs",
  activeKey: "a",
  children: ["a", "b"].map(key => ({
    type: "tab-pane",
    tabKey: key,
    title: key.toUpperCase(),
    children: [paragraph(key)],
  })),
});

async function mount(value: Descendant[], readonly = false) {
  const kit = createEditorKit({ extensions: tabsExtensions });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host),
    ref = createRef<EditorRef>();
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
    },
  };
}

it("只读面板可切换，活动面板字段和内容不写入", async () => {
  const view = await mount([tabs()], true);
  try {
    const before = JSON.stringify(view.editor.children);
    const titles = view.host.querySelectorAll<HTMLElement>('[role="tab"]');
    await act(async () => titles[1].click());
    expect(titles[1].getAttribute("aria-selected")).toBe("true");
    expect(
      view.host.querySelector<HTMLElement>('[data-slate-node="element"][data-tab-key="a"]')?.style
        .visibility
    ).toBe("hidden");
    expect(JSON.stringify(view.editor.children)).toBe(before);
    expect(view.host.querySelector('[aria-label="添加标签"]')).toBeNull();
    expect(view.host.querySelector('[aria-label="删除标签"]')).toBeNull();
  } finally {
    await view.dispose();
  }
});

it("编辑切换移动选区，删除最后一个面板回到可输入段落", async () => {
  const view = await mount([tabs()]);
  try {
    await act(async () => Transforms.select(view.editor, SlateEditor.start(view.editor, [0, 0])));
    await act(async () => view.host.querySelectorAll<HTMLElement>('[role="tab"]')[1].click());
    expect(view.editor.selection?.anchor.path).toEqual([0, 1, 0, 0]);
    await act(async () => view.editor.insertText("新"));
    expect(Node.string(Node.get(view.editor, [0, 0]))).toBe("a");
    expect(Node.string(Node.get(view.editor, [0, 1]))).toBe("新b");
    await act(async () =>
      (view.host.querySelector('[aria-label="添加标签"]') as HTMLElement).click()
    );
    expect((view.editor.children[0] as TabsElement).children).toHaveLength(3);
    for (let count = 3; count > 0; count--) {
      await act(async () =>
        (view.host.querySelector('[aria-label="删除标签"]') as HTMLElement).click()
      );
    }
    expect(view.editor.children).toEqual([paragraph()]);
    expect(view.editor.selection?.anchor.path).toEqual([0, 0]);
  } finally {
    await view.dispose();
  }
});

it("重命名保存标题，输入法组合中的 Enter 不提前提交", async () => {
  const view = await mount([tabs()]);
  try {
    const title = view.host.querySelector('[role="tab"]') as HTMLElement;
    await act(async () => title.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    const input = view.host.querySelector("input") as HTMLInputElement;
    expect(input).toBeTruthy();
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setValue) throw new Error("输入框 setter 不存在");
    await act(async () => {
      setValue.call(input, " 新名字 ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true })
      )
    );
    expect(view.host.querySelector("input")).toBe(input);
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    );
    expect((view.editor.children[0] as TabsElement).children[0].title).toBe("新名字");
    expect(view.host.querySelector("input")).toBeNull();
  } finally {
    await view.dispose();
  }
});

it("顶层孤儿 pane 提升正文，通用 Markdown 载体保留所有面板", async () => {
  const view = await mount([
    { type: "tab-pane", tabKey: "orphan", title: "孤儿", children: [paragraph("内容")] },
  ]);
  try {
    expect(view.editor.children).toEqual([paragraph("内容")]);
  } finally {
    await view.dispose();
  }
  const processor = createMarkdownProcessor({ codecs: editorMarkdownCodecs });
  const content = [tabs()];
  expect(processor.importFromMarkdown(processor.getMarkdown(content))).toEqual(content);
});

import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor as SlateEditor, Node, Transforms, type Element } from "slate";
import { expect, it } from "vitest";
import {
  Editor,
  createEditorKit,
  IExtensionErrorReporter,
  type EditorRef,
  type EditorExtension,
  type ExtensionErrorEvent,
} from "../index";
import blockquote from "@tau/editor-blockquote";
import callout from "@tau/editor-callout";
import detail from "@tau/editor-detail";
import highlightBlock from "@tau/editor-highlight-block";

const paragraph = (text = "") => ({
  type: "paragraph" as const,
  children: [{ type: "formatted" as const, text }],
});
const cases: { name: string; extension: EditorExtension; node: Element }[] = [
  { name: "引用", extension: blockquote, node: { type: "blockquote", children: [] } },
  {
    name: "Callout",
    extension: callout,
    node: { type: "callout", calloutType: "tip", title: "标题", children: [] },
  },
  {
    name: "详情",
    extension: detail,
    node: { type: "detail", title: "标题", open: true, children: [] },
  },
  {
    name: "高亮块",
    extension: highlightBlock,
    node: { type: "highlight-block", color: "red", children: [] },
  },
];

async function mount(extension: EditorExtension, node: Element, readonly = false) {
  const errors: ExtensionErrorEvent[] = [];
  const kit = createEditorKit({
    extensions: [extension],
    services: [
      register => register(IExtensionErrorReporter, { report: event => errors.push(event) }),
    ],
  });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host),
    ref = createRef<EditorRef>();
  await act(async () =>
    root.render(
      <DndProvider backend={HTML5Backend}>
        <Editor ref={ref} kit={kit} readonly={readonly} initValue={[node]} />
      </DndProvider>
    )
  );
  const editor = ref.current?.getEditor();
  if (!editor) throw new Error("编辑器未挂载");
  return {
    editor,
    host,
    errors,
    dispose: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

it.each(cases)(
  "$name 独立装配：唯一空段落和末尾空段落回车均有输入落点",
  async ({ extension, node }) => {
    for (const children of [[paragraph()], [paragraph("保留"), paragraph()]]) {
      const view = await mount(extension, { ...node, children } as Element);
      try {
        await act(async () => {
          Transforms.select(view.editor, SlateEditor.end(view.editor, [0]));
          view.editor.insertBreak();
        });
        const last = view.editor.children[view.editor.children.length - 1];
        expect(last).toEqual(paragraph());
        expect(view.editor.selection).not.toBeNull();
        expect(Node.string(view.editor)).toBe(children.length === 2 ? "保留" : "");
        expect(view.errors).toEqual([]);
      } finally {
        await view.dispose();
      }
    }
  }
);

it("详情只读展开只改视图，不修改折叠字段或标题", async () => {
  const view = await mount(
    detail,
    { type: "detail", title: "原题", open: false, children: [paragraph("正文")] },
    true
  );
  try {
    const before = JSON.stringify(view.editor.children);
    const toggle = view.host.querySelector('[data-icon="caret-right"]')?.parentElement;
    expect(toggle).toBeTruthy();
    await act(async () => toggle?.click());
    expect(toggle?.classList.contains("rotate-90")).toBe(true);
    const title = view.host.querySelector(
      '[data-slate-editor][contenteditable="false"]'
    ) as HTMLElement;
    title.innerText = "不应保存";
    await act(async () => title.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(JSON.stringify(view.editor.children)).toBe(before);
    expect(view.errors).toEqual([]);
  } finally {
    await view.dispose();
  }
});

it.each(cases.filter(item => item.name === "Callout" || item.name === "详情"))(
  "$name 标题可保存并跟随外部更新，只读不保存",
  async ({ extension, node }) => {
    for (const readonly of [false, true]) {
      const view = await mount(
        extension,
        { ...node, children: [paragraph("正文")] } as Element,
        readonly
      );
      try {
        const title = view.host.querySelector(
          "p[data-slate-editor], div[data-slate-editor]:not([role])"
        ) as HTMLElement;
        expect(title).toBeTruthy();
        title.innerText = "编辑标题";
        await act(async () => title.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
        expect(view.editor.children[0]).toMatchObject({ title: readonly ? "标题" : "编辑标题" });
        if (!readonly) {
          await act(async () =>
            Transforms.setNodes(view.editor, { title: "外部更新" }, { at: [0] })
          );
          expect(title.textContent).toBe("外部更新");
        }
        expect(view.errors).toEqual([]);
      } finally {
        await view.dispose();
      }
    }
  }
);

it("高亮缺失颜色安全显示，非法颜色和陈旧命令目标不写入", async () => {
  const node = { type: "highlight-block", children: [paragraph("正文")] } as Element;
  const view = await mount(highlightBlock, node);
  try {
    expect(view.host.textContent).toContain("正文");
    expect(view.errors).toEqual([]);
    const original = view.editor.children[0] as Element;
    await act(async () =>
      view.editor.commands?.execute(
        "tau.highlight-block.set-color",
        { color: "invalid" },
        original,
        [0]
      )
    );
    expect(view.editor.children[0]).not.toHaveProperty("color");
    await act(async () =>
      view.editor.commands?.execute(
        "tau.highlight-block.set-color",
        { color: "blue" },
        original,
        [0]
      )
    );
    expect(view.editor.children[0]).toMatchObject({ color: "blue" });
    await act(async () =>
      view.editor.commands?.execute(
        "tau.highlight-block.set-color",
        { color: "red" },
        original,
        [0]
      )
    );
    expect(view.editor.children[0]).toMatchObject({ color: "blue" });
    expect(view.errors).toEqual([]);
  } finally {
    await view.dispose();
  }
});

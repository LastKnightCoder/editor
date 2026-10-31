import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor as SlateEditor, Node, Transforms, type Descendant, type Element } from "slate";
import { HistoryEditor } from "slate-history";
import { ReactEditor } from "slate-react";
import { beforeAll, expect, vi } from "vitest";
import { Editor, type EditorKit, type EditorRef } from "@tau/editor";

beforeAll(() => {
  // JSDOM 没有动画查询接口，动画不参与编辑行为断言。
  if (typeof globalThis.Element.prototype.getAnimations !== "function") {
    globalThis.Element.prototype.getAnimations = () => [];
  }
  if (typeof globalThis.Range.prototype.getClientRects !== "function") {
    globalThis.Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  }
  if (typeof globalThis.Range.prototype.getBoundingClientRect !== "function") {
    globalThis.Range.prototype.getBoundingClientRect = () => new DOMRect();
  }
  if (typeof globalThis.Element.prototype.scrollIntoView !== "function") {
    globalThis.Element.prototype.scrollIntoView = () => undefined;
  }
  if (!("innerText" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "innerText", {
      configurable: true,
      get() {
        return this.textContent;
      },
      set(value: string) {
        this.textContent = value;
      },
    });
  }
});

const text = (value = "") => ({ type: "formatted", text: value });
const paragraph = (value: string) => ({ type: "paragraph", children: [text(value)] });

export const voidFixtures = [
  {
    type: "code-block",
    uuid: "void-code",
    language: "markdown",
    children: [
      { type: "code-step", code: "# 第一步", children: [text()] },
      { type: "code-step", code: "# 第二步", children: [text()] },
    ],
  },
  ...["image", "inline-image", "webview"].map(type => ({
    type,
    url: "",
    children: [text()],
  })),
  ...["audio", "video"].map(type => ({ type, src: "", children: [text()] })),
  { type: "front-matter", value: "title: 示例", children: [text()] },
  { type: "annotation", content: "说明", children: [text()] },
  { type: "divide-line", children: [text()] },
  {
    type: "bookmark",
    url: "https://example.com/",
    meta: { title: "示例", fetchedAt: 1 },
    children: [text()],
  },
  { type: "mermaid", chart: "", children: [text()] },
  { type: "plantuml", content: "", children: [text()] },
  { type: "inline-math", tex: "x", children: [text()] },
  { type: "block-math", tex: "", children: [text()] },
  { type: "emoji", emoji: "smile", nativeEmoji: "🙂", children: [text()] },
  { type: "file-attachment", fileName: "示例.txt", filePath: "", children: [text()] },
  { type: "whiteboard", children: [text()] },
  { type: "database", children: [text()] },
] as unknown as Element[];

export async function mountVoidEditor(kit: EditorKit, fixture: Element) {
  const definition = kit.extensions
    .flatMap(extension => extension.elements ?? [])
    .find(element => element.type === fixture.type);
  if (!definition?.isVoid) throw new Error(`场景未注册 void 节点：${fixture.type}`);
  const target = structuredClone(fixture);
  const inline = definition.kind === "inline";
  const initial = [
    paragraph("说明"),
    inline
      ? {
          type: "paragraph",
          children: [text("前"), target, text("后")],
        }
      : target,
  ] as Descendant[];
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const ref = createRef<EditorRef>();
  const render = (readonly: boolean) =>
    act(async () => {
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor ref={ref} kit={kit} initValue={initial} readonly={readonly} />
        </DndProvider>
      );
    });
  const dispose = async () => {
    await act(async () => root.unmount());
    host.remove();
  };
  try {
    await render(true);
    const editor = ref.current?.getEditor();
    if (!editor) throw new Error("编辑器未挂载");
    const targetPath = inline ? [1, 1] : [1];
    const assertSelection = async () => {
      const [leaf, path] = Node.first(editor, targetPath);
      expect(ReactEditor.findPath(editor, leaf)).toEqual(path);
      const leafElement = await vi.waitFor(() => ReactEditor.toDOMNode(editor, leaf));
      expect(host.querySelector("[data-element-placeholder]")).toBeNull();
      const domText = leafElement.querySelector("[data-slate-zero-width]")?.firstChild;
      if (!domText) throw new Error(`${fixture.type} 缺少光标占位文本`);
      const point = ReactEditor.toSlatePoint(editor, [domText, 0], {
        exactMatch: false,
        suppressThrow: false,
      });
      expect(point).toEqual({ path, offset: 0 });
      await act(async () => {
        Transforms.select(editor, point);
        expect(() => SlateEditor.marks(editor)).not.toThrow();
      });
    };
    return { editor, host, ref, render, targetPath, assertSelection, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}

export async function verifyVoidBehavior(kit: EditorKit, fixture: Element) {
  const view = await mountVoidEditor(kit, fixture);
  try {
    const original = structuredClone(view.editor.children);
    await view.render(false);
    await view.assertSelection();
    await act(async () => view.ref.current?.focus());
    const selection = view.editor.selection;
    if (!selection) throw new Error("进入编辑后缺少选区");
    expect(selection.anchor).toEqual({
      path:
        fixture.type === "code-block" ? [1, 0, 0] : view.targetPath.length === 1 ? [1, 0] : [1, 2],
      offset: view.targetPath.length === 1 ? 0 : 1,
    });
    expect(() => ReactEditor.toDOMRange(view.editor, selection)).not.toThrow();
    expect(view.editor.children).toEqual(original);
    await act(async () => {
      Transforms.select(view.editor, SlateEditor.start(view.editor, [0]));
      view.editor.insertText("新增");
    });
    expect(Node.string(view.editor.children[0])).toBe("新增说明");
    await act(async () => HistoryEditor.undo(view.editor));
    expect(view.editor.children).toEqual(original);
    await view.assertSelection();
    await view.render(true);
    await view.render(false);
    await view.assertSelection();
    expect(view.editor.children).toEqual(original);
  } finally {
    await view.dispose();
  }
}

export async function verifyCodeStepEditing(kit: EditorKit) {
  const fixture = voidFixtures.find(node => node.type === "code-block");
  if (!fixture) throw new Error("缺少代码分步夹具");
  const view = await mountVoidEditor(kit, fixture);
  try {
    await view.render(false);
    await view.assertSelection();
    await vi.waitFor(() =>
      expect(view.host.querySelector("textarea.code-block-shiki-input")).toBeTruthy()
    );
    const input = view.host.querySelector<HTMLTextAreaElement>("textarea.code-block-shiki-input");
    if (!input) throw new Error("代码编辑器未挂载");
    expect(input.readOnly).toBe(false);
    expect(input.value).toBe("# 第一步");
    await act(async () => {
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
        input,
        "# 编辑后的第一步"
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(Node.get(view.editor, [1, 0])).toHaveProperty("code", "# 编辑后的第一步");
    expect(Node.get(view.editor, [1, 1])).toHaveProperty("code", "# 第二步");
    await view.assertSelection();
    await act(async () => HistoryEditor.undo(view.editor));
    expect(Node.get(view.editor, [1, 0])).toHaveProperty("code", "# 第一步");
    await view.assertSelection();
    const next = view.host.querySelector<HTMLButtonElement>('button[title="下一步"]');
    if (!next) throw new Error("缺少切换步骤按钮");
    await act(async () => {
      next.click();
      await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
    });
    await vi.waitFor(() =>
      expect(
        view.host.querySelector<HTMLTextAreaElement>("textarea.code-block-shiki-input")?.value
      ).toBe("# 第二步")
    );
    await act(async () => {
      expect(
        view.editor.commands?.execute(
          "tau.code-block.magic-move.insert-next-step",
          undefined,
          Node.get(view.editor, [1]) as Element,
          [1]
        )
      ).toBe(true);
    });
    const block = Node.get(view.editor, [1]);
    expect("children" in block && block.children.length).toBe(3);
    await view.assertSelection();
    await act(async () => HistoryEditor.undo(view.editor));
    const restored = Node.get(view.editor, [1]);
    expect("children" in restored && restored.children.length).toBe(2);
    await view.assertSelection();
  } finally {
    await view.dispose();
  }
}

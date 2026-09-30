import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Transforms, type Descendant } from "slate";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { IEditorSlots, focusInsertedPreviewElement, defineExtension } from "@tau/editor/api";
import { createDefaultEditorSlots } from "@tau/editor/src/services";
import customBlockExtension, { insertCustomBlock } from "@tau/editor-custom-block";
import { diagramExtensions } from "@tau/editor-diagram";
import { ITypstCompiler } from "@tau/editor-diagram/services";
import { IRuntimeStyleCompiler } from "@tau/shared/runtime-style";
import { htmlExtensions, insertHTMLBlock } from "@tau/editor-html";
import { isBlockElementEmpty, isParagraphAndEmpty } from "@tau/editor";
import useBlockPanelStore from "@tau/editor/src/stores/useBlockPanelStore";

vi.mock("@tau/editor-diagram/mermaid", () => ({
  renderMermaidSvg: async ({ code }: { code: string }) => `<svg><text>${code}</text></svg>`,
}));
vi.mock("abcjs", () => ({
  default: {
    renderAbc: (id: string, content: string) => {
      document.getElementById(id)!.textContent = content;
    },
  },
}));

// 只替代 jsdom 不具备布局的源码输入器，扩展、预览容器和模板执行使用真实实现。
const codeChanges = vi.hoisted(() => [] as Array<(code: string) => void>);
Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
vi.mock("react-codemirror2", () => ({
  UnControlled: (props: {
    value: string;
    options: { readOnly: boolean };
    onChange: (editor: unknown, change: unknown, code: string) => void;
  }) => {
    codeChanges.push(code => props.onChange({}, {}, code));
    return (
      <textarea aria-label="源码" defaultValue={props.value} readOnly={props.options.readOnly} />
    );
  },
}));

describe("外包扩展的真实编辑器接线", () => {
  let root: Root | undefined;
  let host: HTMLDivElement;

  afterEach(async () => {
    await act(async () => root?.unmount());
    host?.remove();
    codeChanges.length = 0;
  });

  const mount = async (
    value: Descendant[],
    compiler = vi.fn(async () => ""),
    extras: NonNullable<Parameters<typeof createEditorKit>[0]>["extensions"] = []
  ) => {
    const kit = createEditorKit({
      extensions: [customBlockExtension, ...diagramExtensions, ...htmlExtensions, ...extras],
      services: [
        register => {
          register(IEditorSlots, createDefaultEditorSlots());
          register(ITypstCompiler, { compile: async code => `<div>Typst:${code}</div>` });
          register(IRuntimeStyleCompiler, { compile: compiler });
        },
      ],
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const ref = createRef<EditorRef>();
    await act(async () => {
      root?.render(
        <DndProvider backend={HTML5Backend}>
          <Editor ref={ref} kit={kit} initValue={value} readonly={false} />
        </DndProvider>
      );
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 350));
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
    });
    return { editor: ref.current!.getEditor(), kit, compiler };
  };

  it("懒加载渲染执行 JS，源码编辑写回原节点并调用宿主编译服务", async () => {
    const initial = "const Component = () => <div>初始模板</div>;";
    const { editor, compiler } = await mount([
      { type: "custom-block", content: initial, children: [{ type: "formatted", text: "" }] },
    ]);
    expect(host.textContent).toContain("初始模板");
    expect(host.querySelector("textarea")?.readOnly).toBe(false);
    expect(compiler).toHaveBeenCalledWith({ source: initial, language: "tsx" });
    const next = "const Component = () => <div>编辑后的模板</div>;";
    await act(async () => {
      codeChanges.at(-1)!(next);
      await new Promise(resolve => setTimeout(resolve, 650));
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(editor.children[0]).toMatchObject({ content: next });
    expect(host.textContent).toContain("编辑后的模板");
    expect(compiler).toHaveBeenCalledWith({ source: next, language: "tsx" });
  });

  it("插入入口替换空段落，保留默认模板和聚焦事件", async () => {
    const { editor, kit } = await mount([
      { type: "paragraph", children: [{ type: "formatted", text: "" }] },
    ]);
    const listener = vi.fn();
    document.addEventListener("preview-editor-focus", listener);
    await act(async () => {
      Transforms.select(editor, { path: [0, 0], offset: 0 });
      expect(insertCustomBlock(editor)).toEqual([0]);
    });
    await act(async () => {
      Transforms.select(editor, { path: [0, 0], offset: 0 });
      focusInsertedPreviewElement(editor, [0]);
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 120));
    });
    document.removeEventListener("preview-editor-focus", listener);
    expect(editor.children[0]).toMatchObject({
      type: "custom-block",
      content: expect.stringContaining("const Component"),
    });
    expect(editor.children).toHaveLength(1);
    expect(listener).toHaveBeenCalled();
    expect(kit.assembly.getBlockPanelItems(editor).some(item => item.title === "React 组件")).toBe(
      true
    );
    expect(
      kit.extend({
        services: [register => register(IRuntimeStyleCompiler, { compile: async () => "" })],
      }).assembly
    ).toBe(kit.assembly);
  });

  it("从 Portal 子菜单点击 React 组件会插入，不能被外部点击监听抢先关闭", async () => {
    const { editor } = await mount([
      { type: "paragraph", children: [{ type: "formatted", text: "" }] },
    ]);
    await act(async () => {
      Transforms.select(editor, { path: [0, 0], offset: 0 });
      editor.insertText("/");
      useBlockPanelStore.setState({
        ownerEditor: editor,
        blockPanelVisible: true,
        inputValue: "/",
        position: { x: 0, y: 0 },
      });
    });
    const group = Array.from(document.querySelectorAll("button")).find(button =>
      button.textContent?.includes("React 组件")
    );
    expect(group).toBeTruthy();
    await act(async () => group!.click());
    const child = document.querySelector("[data-editor-block-panel-layer] button");
    expect(child?.textContent).toBe("React 组件");
    await act(async () => {
      child!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(document.querySelector("[data-editor-block-panel-layer] button")).toBe(child);
    await act(async () => (child as HTMLButtonElement).click());
    expect(editor.children[0]).toMatchObject({
      type: "custom-block",
      content: expect.stringContaining("const Component"),
    });
    expect(document.querySelector("[data-editor-block-panel-layer]")).toBeNull();
  });

  it.each([
    ["mermaid", "chart", "graph TD\nA --> B"],
    ["plantuml", "content", "@startuml\nA -> B\n@enduml"],
    ["abc", "content", "X: 1\nK: C\nC D E"],
    ["tikz", "content", "\\draw (0,0) -- (1,1);"],
    ["typst", "content", "= 标题"],
  ] as const)("%s 懒加载块可渲染、编辑源码并写回文档", async (type, field, source) => {
    const { editor, kit } = await mount([
      {
        type,
        [field]: source,
        children: [{ type: "formatted", text: "" }],
      } as unknown as Descendant,
    ]);
    expect(host.textContent).not.toContain("渲染失败");
    expect(host.querySelector("textarea")).toBeTruthy();
    expect(host.querySelector("textarea")?.readOnly).toBe(false);
    expect(kit.elementTypes).toContain(type);
    if (type === "mermaid") expect(host.querySelector("svg text")?.textContent).toBe(source);
    if (type === "plantuml")
      expect(host.querySelector("img")?.src).toContain("plantuml.com/plantuml/svg/");
    if (type === "abc") expect(host.textContent).toContain(source);
    if (type === "tikz")
      expect(host.querySelector('script[type="text/tikz"]')?.textContent).toBe(source);
    if (type === "typst") expect(host.textContent).toContain(`Typst:${source}`);
    await act(async () => {
      codeChanges.at(-1)!(source + "\n更新");
      await new Promise(resolve => setTimeout(resolve, 650));
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
    });
    expect(editor.children[0]).toMatchObject({ [field]: source + "\n更新" });
    if (type === "mermaid")
      expect(editor.children[0]).toMatchObject({ compiledFrom: source + "\n更新" });
    if (type === "typst")
      expect(editor.children[0]).toMatchObject({
        compiledFrom: source + "\n更新",
        html: expect.stringContaining("更新"),
      });
  });

  it("嵌套 Editor 继承外包扩展和宿主编译服务", async () => {
    const nested = defineExtension({
      id: "test.nested",
      elements: [
        {
          type: "test-nested",
          kind: "block",
          isVoid: true,
          render: ({ attributes, children }) => (
            <section {...attributes}>
              <div contentEditable={false}>
                <Editor
                  initValue={[
                    {
                      type: "custom-block",
                      content: "const Component = () => <div>嵌套模板</div>;",
                      children: [{ type: "formatted", text: "" }],
                    },
                  ]}
                  readonly
                />
              </div>
              {children}
            </section>
          ),
        },
      ],
    });
    const { compiler } = await mount(
      [
        {
          type: "test-nested",
          children: [{ type: "formatted", text: "" }],
        } as unknown as Descendant,
      ],
      vi.fn(async () => ""),
      [nested]
    );
    expect(host.textContent).toContain("嵌套模板");
    expect(host.textContent).not.toContain("无法显示");
    expect(compiler).toHaveBeenCalledWith({
      source: expect.stringContaining("嵌套模板"),
      language: "tsx",
    });
  });

  it("HTML 块懒加载渲染、源码回写与 HTML 样式服务保持接线", async () => {
    const initial = '<div class="p-4">初始 HTML</div>';
    const { editor } = await mount(
      [{ type: "html-block", html: initial, children: [{ type: "formatted", text: "" }] }],
      vi.fn(async () => ".p-4 { padding: 1rem; }")
    );
    expect(host.textContent).toContain("初始 HTML");
    expect(host.querySelector("style")?.textContent).toContain("padding");
    const next = '<div class="p-4">更新 HTML</div>';
    await act(async () => {
      codeChanges.at(-1)!(next);
      await new Promise(resolve => setTimeout(resolve, 650));
    });
    expect(editor.children[0]).toMatchObject({ type: "html-block", html: next });
    expect(host.textContent).toContain("更新 HTML");
  });

  it("HTML 插入替换空段落，两种 HTML 空态由扩展声明", async () => {
    const { editor } = await mount([
      { type: "paragraph", children: [{ type: "formatted", text: "" }] },
    ]);
    await act(async () => {
      Transforms.select(editor, { path: [0, 0], offset: 0 });
      expect(insertHTMLBlock(editor)).toEqual([0]);
    });
    expect(editor.children).toHaveLength(1);
    expect(isBlockElementEmpty(editor.children[0] as never, editor)).toBe(true);
    await act(async () => Transforms.setNodes(editor, { html: "<div>内容</div>" }, { at: [0] }));
    expect(isBlockElementEmpty(editor.children[0] as never, editor)).toBe(false);
  });

  it("行内 HTML 渲染与段落空态使用当前 Kit 的扩展规则", async () => {
    const { editor } = await mount([
      {
        type: "paragraph",
        children: [
          {
            type: "html-inline",
            html: "<b>行内 HTML</b>",
            children: [{ type: "formatted", text: "" }],
          },
        ],
      },
    ]);
    expect(host.querySelector("b")?.textContent).toBe("行内 HTML");
    await act(async () => {
      Transforms.select(editor, { path: [0, 0], offset: 0 });
    });
    expect(isParagraphAndEmpty(editor)).toBe(false);
  });
});

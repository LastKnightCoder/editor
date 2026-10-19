import { IResourceService } from "@tau/shared/host-services";
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Transforms, type Descendant } from "slate";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { focusInsertedPreviewElement, defineExtension } from "@tau/editor/api";
import { IEditorSlots } from "@tau/editor/extensions/media/services";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { customBlockExtension, htmlExtension } from "../../test-fixtures/plugin-packages";
import "@tau/plugins/source-editor-host";
import { diagramExtensions } from "@tau/editor/extensions/diagram";
import { IRuntimeStyleCompiler } from "@tau/shared/runtime-style";
import { previewMenuExtension } from "@tau/editor-source-view/menu";
import codeBlockExtension from "@tau/editor/extensions/code-block";
import { getCodeBlockController } from "@tau/editor/extensions/code-block/runtime";
import { mathExtensions } from "@tau/editor/extensions/math";
import emojiExtension from "@tau/editor/extensions/emoji";
import { isBlockElementEmpty, isParagraphAndEmpty } from "@tau/editor";
import useBlockPanelStore from "../../../../../packages/editor/src/core/stores/useBlockPanelStore";
import { bulletedList, listItem } from "@tau/editor/extensions/list";

vi.mock("@tau/editor/extensions/diagram/mermaid", () => ({
  renderMermaidSvg: async ({ code }: { code: string }) => `<svg><text>${code}</text></svg>`,
}));

// 只替代 jsdom 不具备布局的源码输入器，扩展、预览容器和模板执行使用真实实现。
vi.mock("@emoji-mart/react", () => ({
  default: ({
    onEmojiSelect,
    theme,
  }: {
    onEmojiSelect: (emoji: { id: string; native: string; shortcodes: string }) => void;
    theme: string;
  }) => (
    <button
      data-picker-theme={theme}
      onClick={() => onEmojiSelect({ id: "rocket", native: "🚀", shortcodes: ":rocket:" })}
    >
      选择测试表情
    </button>
  ),
}));
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
      extensions: [
        customBlockExtension,
        ...diagramExtensions,
        htmlExtension,
        previewMenuExtension,
        codeBlockExtension,
        ...mathExtensions,
        emojiExtension,
        ...extras,
      ],
      services: [
        register => {
          register(IEditorSlots, createDefaultEditorSlots());
          register(IResourceService, { upload: async () => "测试图片地址" });
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
      const panel = customBlockExtension.blockPanel;
      const items = typeof panel === "function" ? panel(editor) : panel;
      const insert = items?.[0]?.onClick;
      if (!insert) throw new Error("发布包缺少插入入口");
      insert(editor);
      expect(editor.children[0]).toMatchObject({ type: "custom-block" });
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
      const panel = htmlExtension.blockPanel;
      if (typeof panel === "function") throw new Error("HTML 插件应提供静态插入菜单");
      panel?.[0]?.children?.[0]?.onClick?.(editor);
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

  it("块级公式消费迁出的预览，源码回写保留 tex 字段", async () => {
    const { editor } = await mount([
      { type: "block-math", tex: "x^2", children: [{ type: "formatted", text: "" }] },
    ]);
    expect(host.querySelector(".katex")).toBeTruthy();
    await act(async () => {
      codeChanges.at(-1)!("y^2");
      await new Promise(resolve => setTimeout(resolve, 650));
    });
    expect(editor.children[0]).toMatchObject({ type: "block-math", tex: "y^2" });
    expect(host.querySelector(".katex")).toBeTruthy();
  });

  it("相邻行内公式的首尾光标落点由数学扩展规范化", async () => {
    const { editor } = await mount([
      {
        type: "paragraph",
        children: [
          { type: "inline-math", tex: "x", children: [{ type: "formatted", text: "" }] },
          { type: "inline-math", tex: "y", children: [{ type: "formatted", text: "" }] },
        ],
      },
    ]);
    const children = (editor.children[0] as { children: Array<{ type: string; text?: string }> })
      .children;
    expect(children.map(child => child.type)).toEqual([
      "formatted",
      "inline-math",
      "formatted",
      "inline-math",
      "formatted",
    ]);
    expect(children.filter(child => child.type === "formatted").map(child => child.text)).toEqual([
      "\uFEFF",
      "\uFEFF",
      "\uFEFF",
    ]);
  });

  it("代码块使用叠层 textarea，输入与失焦保存通过同一运行时控制器", async () => {
    const { editor } = await mount([
      {
        type: "code-block",
        code: "const x = 1;",
        language: "TypeScript",
        uuid: "code-test",
        highlightLines: "1",
        children: [{ type: "formatted", text: "" }],
      },
    ]);
    const textarea = host.querySelector("textarea")!;
    expect(textarea.readOnly).toBe(false);
    expect(host.querySelector(".CodeMirror")).toBeNull();
    const controller = getCodeBlockController("code-test");
    expect(controller?.getValue()).toBe("const x = 1;");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        textarea,
        "const x = 2;"
      );
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(editor.children[0]).toMatchObject({
      uuid: "code-test",
      code: "const x = 2;",
      highlightLines: "1",
    });
    expect(getCodeBlockController("code-test")).toBe(controller);
    expect(controller?.getValue()).toBe("const x = 2;");
  });

  it("空代码块退格补回段落并移除控制器，不恢复代码块全屏", async () => {
    const { editor, kit } = await mount([
      {
        type: "code-block",
        code: "",
        language: "TypeScript",
        uuid: "code-empty",
        children: [{ type: "formatted", text: "" }],
      },
    ]);
    const textarea = host.querySelector("textarea")!;
    const event = new KeyboardEvent("keydown", {
      key: "Backspace",
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperties(event, { which: { value: 8 }, keyCode: { value: 8 } });
    await act(async () => textarea.dispatchEvent(event));
    expect(editor.children[0]).toMatchObject({ type: "paragraph" });
    expect(getCodeBlockController("code-empty")).toBeUndefined();
    expect(
      kit.extensions
        .flatMap(extension => extension.commands || [])
        .some(
          command => command.id.startsWith("tau.code-block") && command.id.includes("fullscreen")
        )
    ).toBe(false);
  });

  it("表情懒加载选择器回写原字段，关闭默认打开标记", async () => {
    const { editor } = await mount([
      {
        type: "paragraph",
        children: [
          {
            type: "emoji",
            emoji: "smile",
            nativeEmoji: "😊",
            defaultOpen: true,
            children: [{ type: "formatted", text: "" }],
          },
        ],
      },
    ]);
    const button = document.querySelector("[data-picker-theme]") as HTMLButtonElement;
    expect(button).toBeTruthy();
    expect(button.dataset.pickerTheme).toBe("light");
    await act(async () => {
      button.click();
      await new Promise(resolve => setTimeout(resolve, 300));
    });
    expect(JSON.stringify(editor.children)).toContain('"nativeEmoji":"🚀"');
    expect(JSON.stringify(editor.children)).toContain('"defaultOpen":false');
    expect(host.querySelector('span[aria-haspopup="dialog"]')?.getAttribute("aria-expanded")).toBe(
      "false"
    );
  });

  it("显式列表扩展内置图标选择，保留 icon/iconType 字段", async () => {
    const { editor } = await mount(
      [
        {
          type: "bulleted-list",
          children: [
            {
              type: "list-item",
              children: [{ type: "paragraph", children: [{ type: "formatted", text: "列表" }] }],
            },
          ],
        },
      ],
      undefined,
      [bulletedList, listItem]
    );
    const trigger = host.querySelector(
      'li div[contenteditable="false"][class*="-left-"]'
    ) as HTMLDivElement;
    expect(trigger).toBeTruthy();
    await act(async () => {
      trigger.click();
      await new Promise(resolve => setTimeout(resolve, 250));
    });
    const button = document.querySelector("[data-picker-theme]") as HTMLButtonElement;
    expect(button).toBeTruthy();
    await act(async () => button.click());
    const item = (editor.children[0] as { children: unknown[] }).children[0];
    expect(item).toMatchObject({ icon: "🚀", iconType: "emoji" });
  });

  it("代码右键高亮从设计系统菜单进入命令通道", async () => {
    const { editor } = await mount([
      {
        type: "code-block",
        uuid: "menu-highlight",
        language: "TypeScript",
        code: "a\nb\nc",
        children: [{ type: "formatted", text: "" }],
      },
    ]);
    const textarea = host.querySelector("textarea")!;
    const execute = vi.spyOn(editor.commands!, "execute");
    await act(async () => {
      textarea.setSelectionRange(2, 5);
      textarea.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 12, clientY: 12 })
      );
    });
    const add = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      item => item.textContent === "高亮选中行"
    );
    expect(add).toBeTruthy();
    await act(async () => add!.click());
    expect(execute).toHaveBeenCalledWith(
      "tau.code-block.highlight-lines.add",
      { start: 2, end: 3 },
      expect.objectContaining({ uuid: "menu-highlight" })
    );
    expect(editor.children[0]).toMatchObject({ highlightLines: "2-3" });
    await act(async () =>
      textarea.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }))
    );
    const remove = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      item => item.textContent === "取消高亮选中行"
    );
    expect(remove?.getAttribute("data-disabled")).not.toBe("true");
    await act(async () => remove!.click());
    expect(editor.children[0]).not.toHaveProperty("highlightLines");
  });
});

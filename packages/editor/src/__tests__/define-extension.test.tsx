// P8：扩展 API v2（defineExtension）与旧扩展适配（fromLegacyExtension）的装配与分发。
import { act, createRef, lazy } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditor, Editor as SlateEditor, Element, Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, createBareEditorKit, createEditorKit } from "../index";
import {
  defineElement,
  defineExtension,
  fromLegacyExtension,
  type ElementRenderProps,
} from "../api";
import type { EditorRef } from "../types/editor";
import { paragraph as paragraphExtension } from "../extensions";
import {
  createDefaultEditorSlots,
  IEditorSlots,
  IExtensionErrorReporter,
  type ExtensionErrorEvent,
} from "../services";
import { CIRCUIT_BREAKER_THRESHOLD } from "../kit/extensionGuard";

const text = (value: string) => ({ type: "formatted", text: value });
const paragraph = (value: string) => ({ type: "paragraph", children: [text(value)] });

const services = (events: ExtensionErrorEvent[] = []) =>
  [
    register => register(IEditorSlots, createDefaultEditorSlots()),
    register => register(IExtensionErrorReporter, { report: event => events.push(event) }),
  ] satisfies Parameters<typeof createEditorKit>[0]["services"];

type NoteElement = { type: "note"; tone: string; children: Descendant[] };

const Note = ({ attributes, element, children }: ElementRenderProps<NoteElement>) => (
  <aside {...attributes} data-tone={element.tone}>
    {children}
  </aside>
);

/** 块级容器 note：回车在空段落上退出容器 */
const noteExtension = defineExtension({
  id: "test.note",
  elements: [
    defineElement<NoteElement>({
      type: "note",
      kind: "block",
      render: Note,
      behaviors: {
        insertBreak(editor, [node, path]) {
          const last = node.children[node.children.length - 1];
          if (!last || SlateEditor.string(editor, [...path, node.children.length - 1]) !== "") {
            return false;
          }
          Transforms.moveNodes(editor, {
            at: [...path, node.children.length - 1],
            to: [path[0] + 1],
          });
          return true;
        },
      },
    }),
  ],
  blockPanel: [{ icon: () => null, title: "便签", keywords: ["note"], description: "便签" }],
});

describe("defineExtension", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    container?.remove();
    container = null;
    vi.restoreAllMocks();
  });

  const render = async (node: React.ReactNode) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<DndProvider backend={HTML5Backend}>{node}</DndProvider>);
    });
    return container;
  };

  it("声明补齐 apiVersion，重复元素类型直接报错", () => {
    expect(noteExtension.apiVersion).toBe(1);
    expect(Object.isFrozen(noteExtension)).toBe(true);
    expect(() =>
      defineExtension({
        id: "test.dup",
        elements: [
          { type: "x", kind: "block", render: () => null },
          { type: "x", kind: "inline", render: () => null },
        ],
      })
    ).toThrow(/重复声明/);
  });

  it("v2 与旧扩展混用：元素类型、kind、渲染都生效", async () => {
    const kit = createEditorKit({ extensions: [noteExtension], services: services() });
    expect(kit.elementTypes).toContain("note");
    expect(kit.elementTypes).toContain("paragraph");

    const ref = createRef<EditorRef>();
    const host = await render(
      <Editor
        ref={ref}
        kit={kit}
        readonly={false}
        initValue={[{ type: "note", tone: "warm", children: [paragraph("便签正文")] }] as never}
      />
    );
    expect(host.querySelector('aside[data-tone="warm"]')?.textContent).toContain("便签正文");
    expect(ref.current!.getEditor().isBlock({ type: "note", children: [] } as never)).toBe(true);
  });

  it("kind / isVoid 声明落到 Slate 的 schema 判定", () => {
    const schema = defineExtension({
      id: "test.schema",
      elements: [
        { type: "chip", kind: "inline", isVoid: true, render: () => null },
        { type: "banner", kind: "block", isVoid: true, render: () => null },
      ],
    });
    const kit = createBareEditorKit({ extensions: [schema], services: services() });
    const editor = kit.assembly.plugins.reduce((acc, plugin) => plugin(acc), createEditor());
    const chip = { type: "chip", children: [text("")] } as never;
    const banner = { type: "banner", children: [text("")] } as never;
    expect(editor.isInline(chip)).toBe(true);
    expect(editor.isVoid(chip)).toBe(true);
    expect(editor.isInline(banner)).toBe(false);
    expect(editor.isVoid(banner)).toBe(true);
  });

  it("lazy 渲染组件：加载期间保留结构，加载后替换", async () => {
    let resolve!: (module: { default: typeof Note }) => void;
    const LazyNote = lazy(() => new Promise<{ default: typeof Note }>(r => (resolve = r)));
    const lazyExtension = defineExtension({
      id: "test.lazy-note",
      elements: [{ type: "note", kind: "block", render: LazyNote as never }],
    });
    const kit = createEditorKit({ extensions: [lazyExtension], services: services() });
    const host = await render(
      <Editor
        kit={kit}
        initValue={[{ type: "note", tone: "cool", children: [paragraph("懒加载")] }] as never}
      />
    );
    expect(host.querySelector("aside")).toBeNull();
    expect(host.textContent).toContain("懒加载");

    await act(async () => resolve({ default: Note }));
    expect(host.querySelector('aside[data-tone="cool"]')).not.toBeNull();
  });

  it("行为只在选区位于该元素内时调用，未处理则回到默认行为", async () => {
    const kit = createEditorKit({ extensions: [noteExtension], services: services() });
    const ref = createRef<EditorRef>();
    await render(
      <Editor
        ref={ref}
        kit={kit}
        readonly={false}
        initValue={
          [
            paragraph("外面"),
            { type: "note", tone: "warm", children: [paragraph("里面"), paragraph("")] },
          ] as never
        }
      />
    );
    const editor = ref.current!.getEditor();

    // 在 note 外：默认拆行
    Transforms.select(editor, SlateEditor.end(editor, [0]));
    editor.insertBreak();
    expect(editor.children.map(node => (node as Element).type)).toEqual([
      "paragraph",
      "paragraph",
      "note",
    ]);

    // 在 note 内的空段落：行为接管，把空段落移出 note
    Transforms.select(editor, SlateEditor.end(editor, [2, 1]));
    editor.insertBreak();
    expect((editor.children[2] as Element).children).toHaveLength(1);
    expect(editor.children).toHaveLength(4);

    // 在 note 内的非空段落：行为返回 false，默认拆行留在 note 里
    Transforms.select(editor, SlateEditor.end(editor, [2, 0]));
    editor.insertBreak();
    expect((editor.children[2] as Element).children).toHaveLength(2);
    expect(editor.children).toHaveLength(4);
  });

  it("嵌套时从内往外找：内层不处理就交给外层", async () => {
    const calls: string[] = [];
    const layer = (type: string, handled: boolean) =>
      defineExtension({
        id: `test.${type}`,
        elements: [
          {
            type,
            kind: "block",
            render: ({ attributes, children }) => <section {...attributes}>{children}</section>,
            behaviors: {
              insertBreak: () => {
                calls.push(type);
                return handled;
              },
            },
          },
        ],
      });
    const kit = createEditorKit({
      extensions: [layer("outer", true), layer("inner", false)],
      services: services(),
    });
    const ref = createRef<EditorRef>();
    await render(
      <Editor
        ref={ref}
        kit={kit}
        readonly={false}
        initValue={
          [{ type: "outer", children: [{ type: "inner", children: [paragraph("x")] }] }] as never
        }
      />
    );
    const editor = ref.current!.getEditor();
    Transforms.select(editor, SlateEditor.end(editor, []));
    editor.insertBreak();
    expect(calls).toEqual(["inner", "outer"]);
    // 外层处理了，默认拆行没有执行
    expect(SlateEditor.string(editor, [])).toBe("x");
    expect(
      Array.from(SlateEditor.nodes(editor, { match: n => (n as Element).type === "paragraph" }))
    ).toHaveLength(1);
  });

  it("行为抛错按扩展熔断，回退默认行为", async () => {
    const events: ExtensionErrorEvent[] = [];
    const insertBreak = vi.fn(() => {
      throw new Error("boom");
    });
    const broken = defineExtension({
      id: "test.broken",
      elements: [
        {
          type: "broken",
          kind: "block",
          render: ({ attributes, children }) => <div {...attributes}>{children}</div>,
          behaviors: { insertBreak },
        },
      ],
    });
    const kit = createEditorKit({ extensions: [broken], services: services(events) });
    const ref = createRef<EditorRef>();
    await render(
      <Editor
        ref={ref}
        kit={kit}
        readonly={false}
        initValue={[{ type: "broken", children: [paragraph("x")] }] as never}
      />
    );
    const editor = ref.current!.getEditor();
    for (let round = 0; round < CIRCUIT_BREAKER_THRESHOLD + 2; round += 1) {
      Transforms.select(editor, SlateEditor.end(editor, []));
      expect(() => editor.insertBreak()).not.toThrow();
    }
    expect(insertBreak).toHaveBeenCalledTimes(CIRCUIT_BREAKER_THRESHOLD);
    expect((editor.children[0] as Element).children).toHaveLength(CIRCUIT_BREAKER_THRESHOLD + 3);
    expect(events.find(event => event.disabled)).toMatchObject({
      extension: "test.broken",
      phase: "behavior",
    });
  });

  it("块菜单条目来自 v2 与旧扩展", async () => {
    const kit = createBareEditorKit({
      extensions: [paragraphExtension, noteExtension],
      services: services(),
    });
    const editor = SlateEditor.isEditor as never;
    const titles = kit.assembly.getBlockPanelItems(editor).map(item => item.title);
    expect(titles).toContain("便签");
  });

  it("旧扩展的适配对象按实例缓存，kit 派生缓存因此仍然生效", () => {
    const kit = createEditorKit({ services: services() });
    expect(fromLegacyExtension(paragraphExtension)).toBe(fromLegacyExtension(paragraphExtension));
    expect(kit.extend({ extensions: [noteExtension] })).toBe(
      kit.extend({ extensions: [noteExtension] })
    );
  });

  it("v2 扩展按元素类型覆盖内置实现需要 override", () => {
    const replacement = defineExtension({
      id: "test.paragraph",
      elements: [{ type: "paragraph", kind: "block", render: () => null }],
    });
    expect(() => createEditorKit({ extensions: [replacement], services: services() })).toThrow(
      /重复注册/
    );
    const kit = createEditorKit({
      extensions: [replacement],
      services: services(),
      override: true,
    });
    expect(kit.extensions.map(extension => extension.id)).not.toContain("paragraph");
    expect(kit.extensions.map(extension => extension.id)).toContain("test.paragraph");
  });
});

describe("内置扩展迁到 v2：divide-line", () => {
  it("段落里输入 --- 回车变分割线，下方补空段落", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const ref = createRef<EditorRef>();
    const kit = createEditorKit({ services: services() });
    await act(async () => {
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor ref={ref} kit={kit} readonly={false} initValue={[paragraph("---")] as never} />
        </DndProvider>
      );
    });
    const editor = ref.current!.getEditor();
    Transforms.select(editor, SlateEditor.end(editor, [0]));
    await act(async () => editor.insertBreak());
    expect(editor.children.map(node => (node as Element).type)).toEqual([
      "divide-line",
      "paragraph",
    ]);
    expect(editor.isVoid(editor.children[0] as Element)).toBe(true);
    expect(container.querySelector('[data-slate-void="true"]')).not.toBeNull();

    // 普通段落回车不受影响
    Transforms.select(editor, SlateEditor.end(editor, [1]));
    await act(async () => editor.insertBreak());
    expect(editor.children).toHaveLength(3);
    await act(async () => root.unmount());
    container.remove();
  });
});

describe("内置扩展迁到 v2：callout（插件改写转声明式行为，语义不变）", () => {
  const callout = (children: Descendant[]) =>
    ({ type: "callout", calloutType: "tip", title: "", children }) as never;

  const mount = async (initValue: Descendant[]) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const ref = createRef<EditorRef>();
    const kit = createEditorKit({ services: services() });
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

  const typesOf = (editor: ReturnType<EditorRef["getEditor"]>) =>
    editor.children.map(node => (node as Element).type);

  it("第一行的空 callout 退格：删除 callout 落回空段落", async () => {
    const { editor, done } = await mount([callout([paragraph("")])]);
    Transforms.select(editor, SlateEditor.end(editor, [0, 0]));
    await act(async () => editor.deleteBackward("character"));
    // 与迁移前一致：delete 后空文档先被补一个空段落，insertNodes 再插一个（既有行为，不修）
    expect(typesOf(editor)).toEqual(["paragraph", "paragraph"]);
    await done();
  });

  it("非第一行或非空的 callout 退格：行为不接管，交给默认删除", async () => {
    const { editor, done } = await mount([paragraph("前"), callout([paragraph("x")])]);
    Transforms.select(editor, SlateEditor.end(editor, [1, 0]));
    await act(async () => editor.deleteBackward("character"));
    expect(typesOf(editor)).toEqual(["paragraph", "callout"]);
    expect(SlateEditor.string(editor, [1])).toBe("");
    await done();
  });

  it("callout 最后一个空段落回车：删除该段并在 callout 下方补空段落", async () => {
    const { editor, done } = await mount([callout([paragraph("x"), paragraph("")])]);
    Transforms.select(editor, SlateEditor.end(editor, [0, 1]));
    await act(async () => editor.insertBreak());
    expect((editor.children[0] as Element).children).toHaveLength(1);
    expect(typesOf(editor)).toEqual(["callout", "paragraph"]);
    await done();
  });

  it("callout 首个空段落回车：lift 到 callout 外，callout 随之移除", async () => {
    const { editor, done } = await mount([callout([paragraph("")])]);
    Transforms.select(editor, SlateEditor.end(editor, [0, 0]));
    await act(async () => editor.insertBreak());
    expect(typesOf(editor)).toEqual(["paragraph"]);
    await done();
  });

  it("裸文本子节点规范化：包进段落；空 callout 移除", async () => {
    const bare = await mount([callout([text("裸文本")])]);
    expect((bare.editor.children[0] as Element).children[0]).toMatchObject({ type: "paragraph" });
    await bare.done();

    const empty = await mount([callout([])]);
    expect(typesOf(empty.editor)).toEqual(["paragraph"]);
    await empty.done();
  });
});

describe("内置扩展迁到 v2：blockquote（插件改写转声明式行为，语义不变）", () => {
  const mount = async (initValue: Descendant[]) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const ref = createRef<EditorRef>();
    const kit = createEditorKit({ services: services() });
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

  const typesOf = (editor: ReturnType<EditorRef["getEditor"]>) =>
    editor.children.map(node => (node as Element).type);

  it("段落开头输入 > 加空格：包进 blockquote", async () => {
    const { editor, done } = await mount([paragraph(">")]);
    Transforms.select(editor, { path: [0, 0], offset: 1 });
    await act(async () => editor.insertText(" "));
    expect(typesOf(editor)).toEqual(["blockquote"]);
    expect(SlateEditor.string(editor, [0])).toBe("");
    await done();
  });

  it("普通文本输入不受影响；最后一个空段落回车退出 blockquote", async () => {
    const { editor, done } = await mount([
      { type: "blockquote", children: [paragraph("x"), paragraph("")] } as never,
    ]);
    // 非快捷语法前缀：正常输入
    Transforms.select(editor, SlateEditor.end(editor, [0, 0]));
    await act(async () => editor.insertText(" "));
    expect(SlateEditor.string(editor, [0])).toBe("x ");
    // 最后一个空段落回车：删该段并在下方补空段落
    Transforms.select(editor, SlateEditor.end(editor, [0, 1]));
    await act(async () => editor.insertBreak());
    expect((editor.children[0] as Element).children).toHaveLength(1);
    expect(typesOf(editor)).toEqual(["blockquote", "paragraph"]);
    await done();
  });

  it("裸文本子节点规范化：包进段落", async () => {
    const { editor, done } = await mount([
      { type: "blockquote", children: [text("裸文本")] } as never,
    ]);
    expect((editor.children[0] as Element).children[0]).toMatchObject({ type: "paragraph" });
    await done();
  });
});

describe("内置扩展迁到 v2：列表（插件改写转声明式行为，语义不变）", () => {
  const mount = async (initValue: Descendant[]) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const ref = createRef<EditorRef>();
    const kit = createEditorKit({ services: services() });
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

  const typesOf = (editor: ReturnType<EditorRef["getEditor"]>) =>
    editor.children.map(node => (node as Element).type);

  const listItem = (value: string) => ({ type: "list-item", children: [paragraph(value)] });

  it("段落开头输入 - 加空格：包进无序列表；输入 1. 加空格：包进有序列表", async () => {
    const bullet = await mount([paragraph("-")]);
    Transforms.select(bullet.editor, { path: [0, 0], offset: 1 });
    await act(async () => bullet.editor.insertText(" "));
    expect(typesOf(bullet.editor)).toEqual(["bulleted-list"]);
    expect((bullet.editor.children[0] as Element).children[0]).toMatchObject({ type: "list-item" });
    await bullet.done();

    const numbered = await mount([paragraph("1.")]);
    Transforms.select(numbered.editor, { path: [0, 0], offset: 2 });
    await act(async () => numbered.editor.insertText(" "));
    expect(typesOf(numbered.editor)).toEqual(["numbered-list"]);
    await numbered.done();
  });

  it("相邻同类列表规范化合并；非 list-item 子节点包进 list-item", async () => {
    const merge = await mount([
      { type: "bulleted-list", children: [listItem("a")] } as never,
      { type: "bulleted-list", children: [listItem("b")] } as never,
    ]);
    expect(typesOf(merge.editor)).toEqual(["bulleted-list"]);
    expect((merge.editor.children[0] as Element).children).toHaveLength(2);
    await merge.done();

    const wrap = await mount([{ type: "numbered-list", children: [paragraph("裸")] } as never]);
    expect((wrap.editor.children[0] as Element).children[0]).toMatchObject({ type: "list-item" });
    await wrap.done();
  });
});

describe("内置扩展迁到 v2：header（热键切命令 id + # 快捷语法）", () => {
  const mount = async (initValue: Descendant[]) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const ref = createRef<EditorRef>();
    const kit = createEditorKit({ services: services() });
    await act(async () => {
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor ref={ref} kit={kit} readonly={false} initValue={initValue} />
        </DndProvider>
      );
    });
    return {
      kit,
      editor: ref.current!.getEditor(),
      done: async () => {
        await act(async () => root.unmount());
        container.remove();
      },
    };
  };

  const header = (level: number, value = "") =>
    ({ type: "header", level, children: [text(value)] }) as never;

  it("段落开头输入 # 加空格变一级标题；### 变三级", async () => {
    const h1 = await mount([paragraph("#")]);
    Transforms.select(h1.editor, { path: [0, 0], offset: 1 });
    await act(async () => h1.editor.insertText(" "));
    expect(h1.editor.children[0]).toMatchObject({ type: "header", level: 1 });
    await h1.done();

    const h3 = await mount([paragraph("###")]);
    Transforms.select(h3.editor, { path: [0, 0], offset: 3 });
    await act(async () => h3.editor.insertText(" "));
    expect(h3.editor.children[0]).toMatchObject({ type: "header", level: 3 });
    await h3.done();
  });

  it("热键绑命令 id：alt+= 升级（段落变 h6、标题减一级），alt+- 降级（h6 变回段落）", async () => {
    const entries = (await mount([paragraph("x")])).kit.assembly.commandHotkeys;
    expect(entries.filter(entry => entry.hotkey.command.startsWith("tau.header."))).toHaveLength(2);

    const { editor, done } = await mount([header(2, "标题")]);
    // h2 升级 → h1；h1 再升无操作
    Transforms.select(editor, SlateEditor.end(editor, [0]));
    expect(editor.commands.execute("tau.header.promote")).toBe(true);
    expect(editor.children[0]).toMatchObject({ type: "header", level: 1 });
    editor.commands.execute("tau.header.promote");
    expect(editor.children[0]).toMatchObject({ type: "header", level: 1 });
    // h1 降级 → h2；降到 h6 再降变回段落
    editor.commands.execute("tau.header.demote");
    expect(editor.children[0]).toMatchObject({ type: "header", level: 2 });
    for (let round = 0; round < 4; round += 1) editor.commands.execute("tau.header.demote");
    expect(editor.children[0]).toMatchObject({ type: "header", level: 6 });
    editor.commands.execute("tau.header.demote");
    expect(editor.children[0]).toMatchObject({ type: "paragraph" });
    await done();
  });

  it("段落上升级：直接变 h6", async () => {
    const { editor, done } = await mount([paragraph("普通段落")]);
    Transforms.select(editor, SlateEditor.end(editor, [0]));
    expect(editor.commands.execute("tau.header.promote")).toBe(true);
    expect(editor.children[0]).toMatchObject({ type: "header", level: 6 });
    await done();
  });
});

describe("内置扩展迁到 v2：detail / highlight-block（插件改写转声明式行为，语义不变）", () => {
  const mount = async (initValue: Descendant[]) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const ref = createRef<EditorRef>();
    const kit = createEditorKit({ services: services() });
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

  const typesOf = (editor: ReturnType<EditorRef["getEditor"]>) =>
    editor.children.map(node => (node as Element).type);

  it("detail 首段开头退格：unwrap 提出内容", async () => {
    const { editor, done } = await mount([
      {
        type: "detail",
        collapsed: false,
        children: [paragraph("内容"), paragraph("后段")],
      } as never,
    ]);
    Transforms.select(editor, SlateEditor.start(editor, [0, 0]));
    await act(async () => editor.deleteBackward("character"));
    // unwrapNodes split 只提出选区所在段落（与迁移前一致），detail 保留其余子段落
    expect(typesOf(editor)).toEqual(["paragraph", "detail"]);
    expect((editor.children[1] as Element).children).toHaveLength(1);
    await done();
  });

  it("前一个兄弟块是 detail 时段首退格被吞掉，不并入 detail", async () => {
    const { editor, done } = await mount([
      { type: "detail", collapsed: false, children: [paragraph("折叠区")] } as never,
      paragraph("内容"),
    ]);
    Transforms.select(editor, SlateEditor.start(editor, [1]));
    await act(async () => editor.deleteBackward("character"));
    expect(typesOf(editor)).toEqual(["detail", "paragraph"]);
    expect((editor.children[1] as Element).children[0]).toMatchObject({ text: "内容" });
    await done();
  });

  it("highlight-block 最后一个空段落回车：删该段并在下方补空段落", async () => {
    const { editor, done } = await mount([
      { type: "highlight-block", children: [paragraph("x"), paragraph("")] } as never,
    ]);
    Transforms.select(editor, SlateEditor.end(editor, [0, 1]));
    await act(async () => editor.insertBreak());
    expect((editor.children[0] as Element).children).toHaveLength(1);
    expect(typesOf(editor)).toEqual(["highlight-block", "paragraph"]);
    await done();
  });
});

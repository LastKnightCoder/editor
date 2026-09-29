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

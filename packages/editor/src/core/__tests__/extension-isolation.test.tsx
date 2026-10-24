// P8 验收：扩展的 render / behavior 抛错时编辑器不崩、数据不丢；缺扩展的类型保存再打开一致（ER-006）。
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEditor,
  Editor as SlateEditor,
  Node,
  Transforms,
  type Descendant,
  type Element,
} from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, createEditorKit } from "../index";
import type { EditorRef } from "../types/editor";
import { defineExtension, type AnyExtension } from "../api";
import { IExtensionErrorReporter, type ExtensionErrorEvent } from "../services";
import { IUnknownElementNotice } from "../services/unknownElementNotice";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { IEditorSlots } from "@tau/editor/extensions/media/services";
import { CIRCUIT_BREAKER_THRESHOLD, withUnknownElements } from "../kit/extensionGuard";

const text = (value: string) => ({ type: "formatted" as const, text: value });
const paragraph = (value: string) => ({ type: "paragraph" as const, children: [text(value)] });

const createKit = (extensions: AnyExtension[] = []) => {
  const events: ExtensionErrorEvent[] = [];
  const kit = createEditorKit({
    extensions,
    services: [
      register => register(IEditorSlots, createDefaultEditorSlots()),
      register => register(IExtensionErrorReporter, { report: event => events.push(event) }),
    ],
  });
  return { kit, events };
};

/** render 必定抛错的块扩展 */
/** render 必定抛错的块扩展 */
const explodingRenderExtension = defineExtension({
  id: "test.exploding",
  elements: [
    {
      type: "exploding",
      kind: "block",
      render: (): never => {
        throw new Error("render boom");
      },
    },
  ],
});

/** 接管 insertBreak 且必定抛错的扩展 */
const createExplodingBehavior = () => {
  const calls = { count: 0 };
  const extension = defineExtension({
    id: "test.exploding-behavior",
    elements: [
      {
        type: "exploding-behavior",
        kind: "block",
        render: () => <div />,
      },
    ],
    plugins: [
      (editor: SlateEditor) => {
        editor.insertBreak = () => {
          calls.count += 1;
          throw new Error("behavior boom");
        };
        return editor;
      },
    ],
  });
  return { extension, calls };
};

const valueWithUnknown = [
  paragraph("开头"),
  // 容器型：子树里有 kit 认识的段落，也必须整棵原样保留
  {
    type: "mystery-container",
    layout: { columns: 2 },
    children: [{ type: "mystery-pane", key: "a", children: [paragraph("容器正文")] }],
  },
  { type: "mystery-void", payload: { nested: [1, 2, 3] }, children: [text("")] },
  {
    type: "paragraph",
    children: [
      text("前 "),
      { type: "mystery-inline", note: "批注", children: [text("被标注")] },
      text(" 后"),
    ],
  },
] as unknown as Descendant[];

describe("扩展错误隔离与未知节点", () => {
  it("未知节点移动到新父级后重新判断行内性，规范化不丢数据", () => {
    const editor = withUnknownElements(createEditor(), type => type === "paragraph");
    // 外来文档故意不登记类型，断言集中在加载边界。
    const node = {
      type: "mystery",
      payload: "必须保留",
      children: [text("内容")],
    } as unknown as Element;
    editor.children = [
      { type: "paragraph", children: [text("前"), node, text("后")] },
    ] as Descendant[];
    expect(editor.isInline(node)).toBe(true);
    Transforms.moveNodes(editor, { at: [0, 1], to: [1], voids: true });
    expect(editor.isInline(node)).toBe(false);
    expect(Node.get(editor, [1])).toEqual(node);

    Transforms.moveNodes(editor, { at: [1], to: [0, 1], voids: true });
    expect(editor.isInline(node)).toBe(true);
    expect(JSON.stringify(editor.children)).toContain("必须保留");
  });

  it("换绑复用节点但替换整树时，未知节点判定跟随新位置", () => {
    const editor = withUnknownElements(createEditor(), type => type === "paragraph");
    const node = { type: "mystery", children: [text("内容")] } as unknown as Element;
    editor.children = [node];
    expect(editor.isInline(node)).toBe(false);
    editor.children = [
      { type: "paragraph", children: [text("前"), node, text("后")] },
    ] as Descendant[];
    expect(editor.isInline(node)).toBe(true);
  });

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

  it("render 抛错：只该元素显示占位，其余正常渲染，数据不变", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { kit, events } = createKit([explodingRenderExtension]);
    const ref = createRef<EditorRef>();
    const initValue = [
      paragraph("前面的段落"),
      { type: "exploding", data: 42, children: [text("块内文字")] },
      paragraph("后面的段落"),
    ] as unknown as Descendant[];

    const host = await render(
      <Editor ref={ref} kit={kit} initValue={initValue} readonly={false} />
    );

    expect(host.textContent).toContain("前面的段落");
    expect(host.textContent).toContain("后面的段落");
    expect(host.querySelector('[data-element-placeholder="exploding"]')?.textContent).toContain(
      "渲染失败"
    );
    expect(ref.current!.getEditor().children[1]).toEqual(initValue[1]);
    expect(events).toContainEqual(
      expect.objectContaining({ extension: "test.exploding", phase: "render" })
    );
  });

  it("behavior 抛错：回退默认行为，连续出错后熔断停用", async () => {
    const { extension, calls } = createExplodingBehavior();
    const { kit, events } = createKit([extension]);
    const ref = createRef<EditorRef>();
    await render(
      <Editor
        ref={ref}
        kit={kit}
        initValue={[paragraph("一行")] as Descendant[]}
        readonly={false}
      />
    );
    const editor = ref.current!.getEditor();

    for (let round = 0; round < CIRCUIT_BREAKER_THRESHOLD + 2; round += 1) {
      Transforms.select(editor, SlateEditor.end(editor, []));
      expect(() => editor.insertBreak()).not.toThrow();
    }

    // 每次都回退到默认的拆行，一次都没丢
    expect(editor.children).toHaveLength(CIRCUIT_BREAKER_THRESHOLD + 3);
    // 熔断后不再调用出错的实现
    expect(calls.count).toBe(CIRCUIT_BREAKER_THRESHOLD);
    expect(events.filter(event => event.disabled)).toEqual([
      expect.objectContaining({ extension: "test.exploding-behavior", phase: "behavior" }),
    ]);
  });

  it("没注册的类型渲染只读占位，不再露出「无法识别的类型」", async () => {
    const { kit } = createKit();
    const host = await render(<Editor kit={kit} initValue={valueWithUnknown} readonly={false} />);

    expect(host.textContent).not.toContain("无法识别的类型");
    expect(host.querySelector('[data-element-placeholder="mystery-container"]')?.tagName).toBe(
      "DIV"
    );
    expect(host.querySelector('[data-element-placeholder="mystery-void"]')?.tagName).toBe("DIV");
    // 行内的未知节点仍在段落里，按行内占位渲染
    const inline = host.querySelector('[data-element-placeholder="mystery-inline"]');
    expect(inline?.tagName).toBe("SPAN");
    expect(
      inline?.closest('[data-slate-node="element"]:not([data-slate-inline])')?.textContent
    ).toContain("前");
  });

  it("宿主可按类型提供未知节点占位说明，未提供时回落内核默认文案", async () => {
    const kit = createEditorKit({
      services: [
        register => register(IEditorSlots, createDefaultEditorSlots()),
        register =>
          register(IUnknownElementNotice, {
            describe: type =>
              type === "mystery-void" ? { message: "插件内容加载中…" } : undefined,
          }),
      ],
    });
    const host = await render(<Editor kit={kit} initValue={valueWithUnknown} readonly />);
    expect(host.querySelector('[data-element-placeholder="mystery-void"]')?.textContent).toContain(
      "插件内容加载中…"
    );
    expect(
      host.querySelector('[data-element-placeholder="mystery-container"]')?.textContent
    ).toContain("此处的内容在当前编辑器中无法显示");
  });

  it("删掉扩展后打开含该类型的文档，编辑其他内容再保存，未知节点原样保留", async () => {
    const { kit } = createKit();
    const ref = createRef<EditorRef>();
    const onChange = vi.fn();
    await render(
      <Editor
        ref={ref}
        kit={kit}
        initValue={valueWithUnknown}
        onChange={onChange}
        readonly={false}
      />
    );
    const editor = ref.current!.getEditor();

    // 挂载期的规范化不能改动未知节点（已知段落可以被自己的扩展补字段）
    expect(editor.children.slice(1, 3)).toEqual(valueWithUnknown.slice(1, 3));
    expect((editor.children[3] as { children: unknown[] }).children).toEqual(
      (valueWithUnknown[3] as { children: unknown[] }).children
    );

    await act(async () => {
      Transforms.insertText(editor, "（已编辑）", { at: SlateEditor.end(editor, [0]) });
    });

    const saved = onChange.mock.calls.at(-1)![0] as Descendant[];
    expect(SlateEditor.string(editor, [0])).toBe("开头（已编辑）");
    expect(saved.slice(1, 3)).toEqual(valueWithUnknown.slice(1, 3));
    expect((saved[3] as { children: unknown[] }).children).toEqual(
      (valueWithUnknown[3] as { children: unknown[] }).children
    );

    // 再打开：内容一致
    await act(async () => root?.unmount());
    const reopened = createRef<EditorRef>();
    await render(<Editor ref={reopened} kit={kit} initValue={saved} readonly={false} />);
    expect(reopened.current!.getEditor().children).toEqual(saved);
  });
});

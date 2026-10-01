// P6：EditorKit 的组成、冲突检测、派生与嵌套继承。
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, createEditorKit } from "../index";
import type { EditorRef } from "../types/editor";
import { defineExtension } from "../api";
import { createDefaultEditorSlots } from "@tau/editor-media/slots";
import { IEditorSlots } from "@tau/editor-media/services";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const slots: Parameters<typeof createEditorKit>[0] = {
  services: [register => register(IEditorSlots, createDefaultEditorSlots())],
};

/** 用 type 标记自己的测试扩展：render 输出带 data-mark，便于断言分发到了哪一个实现 */
const markerExtension = (type: string, mark: string) =>
  defineExtension({
    id: `test.marker-${type}-${mark}`,
    elements: [
      {
        type,
        kind: "block",
        render: ({ attributes, children }) => (
          <div {...attributes} data-mark={mark}>
            {children}
          </div>
        ),
      },
    ],
  });

const docOf = (type: string): Descendant[] => [
  { type, children: [{ type: "formatted", text: "内容" }] } as Descendant,
];

describe("createEditorKit", () => {
  it("默认只提供基础段落，不隐式安装产品功能", () => {
    const kit = createEditorKit(slots);
    const types = kit.elementTypes;
    expect(types).toEqual(["paragraph"]);
    expect(kit.assembly.marks).toHaveLength(0);
    expect(kit.assembly.layers).toHaveLength(0);
  });

  it("基础段落加上显式声明的扩展", () => {
    const kit = createEditorKit({ ...slots, extensions: [markerExtension("marker", "a")] });
    expect(kit.elementTypes).toEqual(["paragraph", "marker"]);
  });

  it("同 type 重复注册直接报错，不静默覆盖", () => {
    expect(() =>
      createEditorKit({ ...slots, extensions: [markerExtension("paragraph", "a")] })
    ).toThrow(/重复注册/);
  });

  it("核心段落不能被 create 或 extend 覆盖，普通扩展仍可显式覆盖", () => {
    const replacement = markerExtension("paragraph", "custom");
    expect(() => createEditorKit({ extensions: [replacement], override: true })).toThrow(
      /核心基础/
    );
    const base = createEditorKit({ extensions: [markerExtension("marker", "a")] });
    expect(() => base.extend({ extensions: [replacement], override: true })).toThrow(/核心基础/);
    const updated = base.extend({ extensions: [markerExtension("marker", "b")], override: true });
    expect(updated.elementTypes).toEqual(["paragraph", "marker"]);
    expect(updated.extensions.some(extension => extension.id === "tau.paragraph")).toBe(true);
  });

  it("extend 追加扩展不影响原 kit", () => {
    const kit = createEditorKit(slots);
    const derived = kit.extend({ extensions: [markerExtension("marker", "a")] });
    expect(derived.assembly.hasElement("marker")).toBe(true);
    expect(kit.assembly.hasElement("marker")).toBe(false);
  });

  it("元素覆盖不能连带丢失扩展根 UI，按扩展 id 整体替换才可移除", () => {
    const extension = defineExtension({
      ...markerExtension("marker", "a"),
      layers: [() => null],
    });
    const kit = createEditorKit({ extensions: [extension] });
    expect(() =>
      kit.extend({
        extensions: [markerExtension("marker", "b")],
        override: true,
      })
    ).toThrow(/根 UI/);
    const replaced = kit.extend({
      extensions: [defineExtension({ id: extension.id })],
      override: true,
    });
    expect(replaced.assembly.layers).toHaveLength(0);
    expect(kit.assembly.layers).toHaveLength(1);
  });

  it("extend 对相同扩展实例返回同一个 kit（否则编辑器会被重建）", () => {
    const kit = createEditorKit(slots);
    const extension = markerExtension("marker", "a");
    // 宿主常写 extensions={[ext]}，数组每次都是新的
    expect(kit.extend({ extensions: [extension] })).toBe(kit.extend({ extensions: [extension] }));
  });

  it("extend 覆盖服务时派生注册表，父 kit 不受影响", () => {
    const kit = createEditorKit(slots);
    const slot = createDefaultEditorSlots();
    const derived = kit.extend({ services: [register => register(IEditorSlots, slot)] });
    expect(derived.registry.get(IEditorSlots)).toBe(slot);
    expect(kit.registry.get(IEditorSlots)).not.toBe(slot);
  });

  it("只覆盖服务的派生 kit 与原 kit 共享装配（否则编辑器会重建）", () => {
    const kit = createEditorKit(slots);
    const derived = kit.extend({
      services: [register => register(IEditorSlots, createDefaultEditorSlots())],
    });
    expect(derived.assembly).toBe(kit.assembly);
    // 追加扩展则确实换了扩展集合，装配必须重算
    expect(kit.extend({ extensions: [markerExtension("marker", "a")] }).assembly).not.toBe(
      kit.assembly
    );
  });
});

describe("<Editor kit> 与嵌套继承", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    container?.remove();
    container = null;
    document.body.innerHTML = "";
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

  it("kit 里的扩展负责渲染对应元素", async () => {
    const kit = createEditorKit({ ...slots, extensions: [markerExtension("marker", "outer")] });
    const host = await render(<Editor kit={kit} initValue={docOf("marker")} readonly />);
    expect(host.querySelector("[data-mark='outer']")).toBeTruthy();
  });

  it("per-instance extensions 按 type 覆盖 kit 的同名实现", async () => {
    const kit = createEditorKit({ ...slots, extensions: [markerExtension("marker", "outer")] });
    const host = await render(
      <Editor
        kit={kit}
        initValue={docOf("marker")}
        readonly
        extensions={[markerExtension("marker", "instance")]}
      />
    );
    expect(host.querySelector("[data-mark='instance']")).toBeTruthy();
    expect(host.querySelector("[data-mark='outer']")).toBeNull();
  });

  it("实例级追加不能绕过核心段落保护", async () => {
    const kit = createEditorKit(slots);
    await expect(
      render(
        <Editor
          kit={kit}
          initValue={docOf("paragraph")}
          extensions={[markerExtension("paragraph", "instance")]}
        />
      )
    ).rejects.toThrow(/核心基础/);
    expect(kit.elementTypes).toEqual(["paragraph"]);
  });

  it("换成只覆盖服务的派生 kit 不重建编辑器（发起协作时 kit 会这样派生）", async () => {
    const kit = createEditorKit(slots);
    // 用 ref 读当前实例：onInit 有首次挂载守卫，编辑器重建也不会再触发，拿它判断会假绿
    const editorRef = createRef<EditorRef>();
    const view = (current: typeof kit) => (
      <Editor kit={current} ref={editorRef} initValue={docOf("paragraph")} readonly />
    );
    await render(view(kit));
    const before = editorRef.current!.getEditor();
    const derived = kit.extend({
      services: [register => register(IEditorSlots, createDefaultEditorSlots())],
    });

    await act(async () => {
      root?.render(<DndProvider backend={HTML5Backend}>{view(derived)}</DndProvider>);
    });

    expect(editorRef.current!.getEditor()).toBe(before);
  });

  it("嵌套编辑器默认继承外层 kit", async () => {
    // 真实的嵌套发生在扩展的 render 里（如内容链接预览），内层不传 kit
    const hostExtension = defineExtension({
      id: "test.host",
      elements: [
        {
          type: "host",
          kind: "block",
          render: ({ attributes, children }) => (
            <div {...attributes}>
              <div contentEditable={false}>
                <Editor initValue={docOf("marker")} readonly />
              </div>
              {children}
            </div>
          ),
        },
      ],
    });
    const kit = createEditorKit({
      ...slots,
      extensions: [hostExtension, markerExtension("marker", "outer")],
    });
    const host = await render(<Editor kit={kit} initValue={docOf("host")} readonly />);
    expect(host.querySelector("[data-mark='outer']")).toBeTruthy();
  });

  it("并列的两个编辑器各用各的分发表，不串台", async () => {
    const outerKit = createEditorKit({
      ...slots,
      extensions: [markerExtension("marker", "outer")],
    });
    const innerKit = createEditorKit({
      ...slots,
      extensions: [markerExtension("marker", "inner")],
    });
    const host = await render(
      <div>
        <Editor kit={outerKit} initValue={docOf("marker")} readonly />
        <Editor kit={innerKit} initValue={docOf("marker")} readonly />
      </div>
    );
    expect(host.querySelectorAll("[data-mark='outer']")).toHaveLength(1);
    expect(host.querySelectorAll("[data-mark='inner']")).toHaveLength(1);
  });
});

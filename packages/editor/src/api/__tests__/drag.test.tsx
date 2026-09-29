// P8：拖拽声明化（01 §5.4）——声明归一、装配聚合、chrome 锚定与祖先链判定。
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import type { Descendant } from "slate";

import { Editor, createBareEditorKit } from "../../index";
import { defineElement, defineExtension } from "../extension";
import Base from "../../extensions/base";
import IExtension from "../../extensions/types";
import { createDefaultEditorSlots, IEditorSlots } from "../../services";
import { normalizeDragSpec } from "../drag";

const paragraph = (text: string): Descendant =>
  ({ type: "paragraph", children: [{ type: "formatted", text }] }) as Descendant;

describe("normalizeDragSpec", () => {
  it("未声明没有 chrome；true 是全开简写；对象原样（缺省字段补 false 语义由调用方兜底）", () => {
    expect(normalizeDragSpec(undefined)).toBeUndefined();
    expect(normalizeDragSpec(true)).toEqual({ self: true, children: true });
    expect(normalizeDragSpec(false)).toEqual({ self: false, children: false });
    expect(normalizeDragSpec({ self: false, children: true })).toEqual({
      self: false,
      children: true,
    });
  });
});

/** 只渲染段落与勾选项的最小编辑器：legacy 段落 + v2 勾选项 */
class LegacyParagraphExtension extends Base implements IExtension {
  type = "paragraph";
  override dragSpec = true;
  getPlugins() {
    return [];
  }
  render(props: any) {
    return <p {...props.attributes}>{props.children}</p>;
  }
}

const checkListExtension = defineExtension({
  id: "test.check-list-item",
  elements: [
    defineElement({
      type: "check-list-item",
      kind: "block",
      render: ({ attributes, children }) => <div {...attributes}>{children}</div>,
      // 勾选项整体可拖、内部子内容不参与、只接受同类
      drag: {
        self: true,
        children: false,
        accepts: dragElement => dragElement.type === "check-list-item",
      },
    }),
  ],
});

describe("拖拽声明 → 装配与 chrome", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    container?.remove();
    container = null;
    document.body.innerHTML = "";
  });

  const render = async (ui: ReactNode) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<DndProvider backend={HTML5Backend}>{ui}</DndProvider>);
    });
    return container;
  };

  const kitOptions = {
    services: [register => register(IEditorSlots, createDefaultEditorSlots())],
  };

  it("legacy dragSpec 与 v2 defineElement.drag 都进装配；未声明的类型没有 chrome", async () => {
    const kit = createBareEditorKit({
      ...kitOptions,
      extensions: [new LegacyParagraphExtension(), checkListExtension],
    });
    expect(kit.assembly.dragSpecs.get("paragraph")).toEqual({ self: true, children: true });
    expect(kit.assembly.dragSpecs.get("check-list-item")?.self).toBe(true);
    expect(kit.assembly.dragSpecs.has("header")).toBe(false);
  });

  it("有声明的块渲染 ed-block chrome 与手柄；children:false 的祖先屏蔽子块手柄", async () => {
    const kit = createBareEditorKit({
      ...kitOptions,
      extensions: [new LegacyParagraphExtension(), checkListExtension],
    });
    const doc: Descendant[] = [
      paragraph("独立段落"),
      {
        type: "check-list-item",
        checked: false,
        children: [paragraph("勾选项里的段落")],
      } as Descendant,
    ];
    const host = await render(<Editor kit={kit} initValue={doc} readonly={false} />);

    const blocks = host.querySelectorAll<HTMLElement>(".ed-block");
    expect(blocks.length).toBeGreaterThanOrEqual(2);

    // 文档序三个手柄：独立段落（可拖）、勾选项内部段落（被 children:false 屏蔽）、勾选项自身（可拖）
    const handles = [...host.querySelectorAll<HTMLElement>("[data-drag-handle]")];
    expect(handles.length).toBe(3);
    expect(handles[0].hasAttribute("data-block-reveal")).toBe(true);
    expect(handles[1].hasAttribute("data-block-reveal")).toBe(false);
    expect(handles[2].hasAttribute("data-block-reveal")).toBe(true);
  });

  it("未声明的块（无 drag 声明）不渲染 chrome，DOM 与迁移前一致", async () => {
    class PlainExtension extends Base implements IExtension {
      type = "plain";
      getPlugins() {
        return [];
      }
      render(props: any) {
        return <div {...props.attributes}>{props.children}</div>;
      }
    }
    const kit = createBareEditorKit({ ...kitOptions, extensions: [new PlainExtension()] });
    const doc: Descendant[] = [
      { type: "plain", children: [{ type: "formatted", text: "" }] } as Descendant,
    ];
    const host = await render(<Editor kit={kit} initValue={doc} readonly={false} />);
    expect(host.querySelector(".ed-block")).toBeNull();
    expect(host.querySelector("[data-drag-handle]")).toBeNull();
  });
});

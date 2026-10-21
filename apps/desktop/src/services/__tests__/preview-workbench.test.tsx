// 源码预览块：空块占位、悬停操作条、源码编辑、渲染出错保留上次结果
import { createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { afterEach, describe, expect, it, vi } from "vitest";

// CodeMirror 5 测量文字要用 Range 的几何接口，jsdom 未实现
const emptyRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
Range.prototype.getBoundingClientRect = emptyRect as unknown as () => DOMRect;
Range.prototype.getClientRects = (() => []) as unknown as () => DOMRectList;

const renderMermaidSvg = vi.fn();
vi.mock("@tau/editor/extensions/diagram/mermaid", async importOriginal => ({
  ...(await importOriginal<typeof import("@tau/editor/extensions/diagram/mermaid")>()),
  renderMermaidSvg: (...args: unknown[]) => renderMermaidSvg(...args),
}));

import { Editor as EditorComponent, createEditorKit, type EditorRef } from "@tau/editor";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { IEditorSlots } from "@tau/editor/extensions/media/services";
import { mathExtensions } from "@tau/editor/extensions/math";
import { diagramExtensions } from "@tau/editor/extensions/diagram";

const mount = async (initValue: Descendant[], readonly = false) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const ref = createRef<EditorRef>();
  const kit = createEditorKit({
    extensions: [...mathExtensions, ...diagramExtensions],
    services: [register => register(IEditorSlots, createDefaultEditorSlots())],
  });
  await act(async () => {
    root.render(
      <DndProvider backend={HTML5Backend}>
        <EditorComponent ref={ref} kit={kit} readonly={readonly} initValue={initValue} />
      </DndProvider>
    );
  });
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  return {
    container,
    done: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
};

const blockMath = (tex: string) =>
  [
    { type: "block-math", tex, children: [{ type: "formatted", text: "" }] },
  ] as unknown as Descendant[];

const labels = (scope: ParentNode) =>
  Array.from(scope.querySelectorAll("button[aria-label]")).map(b => b.getAttribute("aria-label"));

const click = async (el: Element | null | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
};

afterEach(() => {
  renderMermaidSvg.mockReset();
});

describe("源码预览块", () => {
  it("空块显示带类型名的占位，不出操作条", async () => {
    const { container, done } = await mount(blockMath(""));
    expect(container.textContent).toContain("公式 · 点击开始编写");
    expect(labels(container)).toEqual([]);
    await done();
  });

  it("可编辑时操作条是编辑 / 删除，只读时只有复制源码", async () => {
    const editable = await mount(blockMath("x^2"));
    expect(labels(editable.container)).toEqual(["编辑", "删除"]);
    await editable.done();

    const readonly = await mount(blockMath("x^2"), true);
    const readonlyLabels = labels(readonly.container);
    expect(readonlyLabels).toEqual(["复制源码"]);
    await readonly.done();
  });

  it("进入编辑后有类型标题行与完成按钮，完成后回到预览", async () => {
    const { container, done } = await mount(blockMath("x^2"));
    await click(container.querySelector('button[aria-label="编辑"]'));
    const finish = Array.from(container.querySelectorAll("button")).find(
      b => b.textContent === "完成"
    );
    expect(finish).toBeTruthy();
    expect(container.textContent).toContain("公式");
    await click(finish);
    expect(
      Array.from(container.querySelectorAll("button")).some(b => b.textContent === "完成")
    ).toBe(false);
    await done();
  });

  it("Mermaid 渲染出错时保留上一次的图，错误交给块的错误条", async () => {
    const chart = "graph LR\n  A -> B";
    renderMermaidSvg.mockRejectedValue(new Error("Parse error on line 2"));
    const { container, done } = await mount([
      {
        type: "mermaid",
        chart,
        svg: '<svg data-testid="cached"></svg>',
        compiledFrom: chart,
        children: [{ type: "formatted", text: "" }],
      },
    ] as unknown as Descendant[]);
    // Mermaid 扩展懒加载，等它挂载并上报错误
    await vi.waitFor(async () => {
      await act(async () => {
        await Promise.resolve();
      });
      expect(container.textContent).toContain("Parse error on line 2");
    });
    expect(container.textContent).toContain("预览保留上一次成功的结果");
    const cached = container.querySelector('[data-testid="cached"]');
    expect(cached).toBeTruthy();
    expect(cached?.closest(".opacity-40")).toBeTruthy();
    await done();
  });

  it("公式一开始就写错时显示 KaTeX 的错误，不提示「保留上一次结果」", async () => {
    const { container, done } = await mount(blockMath("\\frac{1}{"));
    await vi.waitFor(() => expect(container.textContent).toContain("KaTeX parse error"));
    expect(container.textContent).not.toContain("预览保留上一次成功的结果");
    await done();
  });
});

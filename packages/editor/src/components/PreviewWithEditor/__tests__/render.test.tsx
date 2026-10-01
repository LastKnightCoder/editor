// 源码预览块：空块占位、悬停操作条、渲染出错保留上次结果、全屏工作台
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
vi.mock("@tau/shared", async importOriginal => ({
  ...(await importOriginal<typeof import("@tau/shared")>()),
  renderMermaidSvg: (...args: unknown[]) => renderMermaidSvg(...args),
}));

import { Editor as EditorComponent, createEditorKit } from "../../../index";
import type { EditorRef } from "../../../types/editor";
import { createDefaultEditorSlots, IEditorSlots } from "../../../services";

const mount = async (initValue: Descendant[], readonly = false) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const ref = createRef<EditorRef>();
  const kit = createEditorKit({
    services: [register => register(IEditorSlots, createDefaultEditorSlots())],
  });
  await act(async () => {
    root.render(
      <DndProvider backend={HTML5Backend}>
        <EditorComponent ref={ref} kit={kit} readonly={readonly} initValue={initValue} />
      </DndProvider>
    );
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
    expect(labels(container)).not.toContain("全屏");
    await done();
  });

  it("可编辑时操作条是编辑 / 全屏 / 删除，只读时换成复制源码 / 全屏", async () => {
    const editable = await mount(blockMath("x^2"));
    expect(labels(editable.container)).toEqual(expect.arrayContaining(["编辑", "全屏", "删除"]));
    await editable.done();

    const readonly = await mount(blockMath("x^2"), true);
    const readonlyLabels = labels(readonly.container);
    expect(readonlyLabels).toEqual(expect.arrayContaining(["复制源码", "全屏"]));
    expect(readonlyLabels).not.toContain("编辑");
    expect(readonlyLabels).not.toContain("删除");
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

  describe("全屏工作台", () => {
    const zoomLabel = () =>
      Array.from(document.body.querySelectorAll("span")).find(s =>
        /^\d+%$/.test(s.textContent ?? "")
      )?.textContent;
    const dialog = () => document.body.querySelector<HTMLElement>('[role="dialog"]');
    const stage = () => dialog()?.querySelector<HTMLElement>(".cursor-grab, .cursor-grabbing");
    const content = () => stage()?.querySelector<HTMLElement>("[style*='translate']");
    const open = async () => {
      const mounted = await mount(blockMath("x^2"));
      await click(mounted.container.querySelector('button[aria-label="全屏"]'));
      expect(dialog()).toBeTruthy();
      return mounted;
    };

    it("缩放按钮改变比例，源码栏可收起，关闭后卸载", async () => {
      const { done } = await open();
      expect(zoomLabel()).toBe("100%");
      await click(document.body.querySelector('button[aria-label="放大 (+)"]'));
      expect(zoomLabel()).toBe("125%");
      await click(document.body.querySelector('button[aria-label="收起源码"]'));
      expect(document.body.querySelector('button[aria-label="显示源码"]')).toBeTruthy();
      await click(document.body.querySelector('button[aria-label="关闭 (Esc)"]'));
      expect(dialog()).toBeNull();
      await done();
    });

    it("Esc 关闭全屏，且不冒泡给宿主的 Esc 仲裁", async () => {
      const { done } = await open();
      const hostEsc = vi.fn();
      window.addEventListener("keydown", hostEsc);
      await act(async () => {
        dialog()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      window.removeEventListener("keydown", hostEsc);
      expect(dialog()).toBeNull();
      expect(hostEsc).not.toHaveBeenCalled();
      await done();
    });

    it("滚轮缩放画布", async () => {
      const { done } = await open();
      await act(async () => {
        stage()?.dispatchEvent(
          new WheelEvent("wheel", { deltaY: -200, bubbles: true, cancelable: true })
        );
      });
      expect(Number.parseInt(zoomLabel() ?? "0", 10)).toBeGreaterThan(100);
      await done();
    });

    it("拖动画布平移，移动不足阈值时不算拖动", async () => {
      const { done } = await open();
      const target = stage();
      expect(target).toBeTruthy();
      const pointer = async (type: string, x: number, y: number) => {
        await act(async () => {
          target?.dispatchEvent(
            new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y })
          );
        });
      };
      await pointer("pointerdown", 100, 100);
      await pointer("pointermove", 101, 101);
      expect(content()?.style.transform).toContain("translate(0px, 0px)");
      await pointer("pointermove", 140, 90);
      expect(content()?.style.transform).toContain("translate(40px, -10px)");
      await pointer("pointerup", 140, 90);
      await done();
    });
  });
});

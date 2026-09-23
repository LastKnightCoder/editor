import { act, type PointerEvent as ReactPointerEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useImageResize, type ResizeDirection } from "../useImageResize";

describe("图片基准尺寸与显示尺寸换算", () => {
  let root: Root;
  let host: HTMLDivElement;
  let resize: ReturnType<typeof useImageResize>;
  let element: HTMLDivElement;
  const onResizeEnd = vi.fn();

  async function mount(fontSize: number, displayedWidth: number, options = {}) {
    host = document.createElement("div");
    document.body.appendChild(host);
    const editor = document.createElement("div");
    editor.dataset.slateEditor = "true";
    editor.style.padding = "0 40px";
    Object.defineProperty(editor, "clientWidth", { value: 680 });
    element = document.createElement("div");
    element.style.fontSize = `${fontSize}px`;
    element.getBoundingClientRect = () =>
      ({ width: displayedWidth, height: displayedWidth / 2 }) as DOMRect;
    element.setPointerCapture = vi.fn();
    element.releasePointerCapture = vi.fn();
    editor.appendChild(element);
    document.body.appendChild(editor);
    function Probe() {
      resize = useImageResize({
        initialSize: { width: 320, height: 160 },
        aspectRatio: 2,
        emElementRef: { current: element },
        onResizeEnd,
        ...options,
      });
      return null;
    }
    root = createRoot(host);
    await act(async () => root.render(<Probe />));
  }

  async function drag(deltaX: number, deltaY = 0, direction: ResizeDirection = "e") {
    await act(async () =>
      resize.handleResizeStart(
        {
          clientX: 0,
          clientY: 0,
          pointerId: 1,
          target: element,
          preventDefault() {},
          stopPropagation() {},
        } as unknown as ReactPointerEvent,
        direction
      )
    );
    await act(async () =>
      document.dispatchEvent(new MouseEvent("pointermove", { clientX: deltaX, clientY: deltaY }))
    );
    await act(async () => document.dispatchEvent(new MouseEvent("pointerup")));
  }

  afterEach(async () => {
    await act(async () => root?.unmount());
    document.body.innerHTML = "";
    onResizeEnd.mockClear();
  });

  it.each([16, 24, 40, 8])("%ipx 字号下按视觉增量换算基准尺寸", async fontSize => {
    const scale = fontSize / 16;
    await mount(fontSize, 160 * scale);
    await drag(40);
    expect(resize.size.width).toBeCloseTo(160 + 40 / scale);
    expect(resize.size.height).toBeCloseTo((160 + 40 / scale) / 2);
    expect(onResizeEnd).toHaveBeenCalledWith(resize.size);
  });

  it("从受限的实际显示宽度起拖，不跳回存储宽度", async () => {
    await mount(40, 600);
    await drag(-50);
    expect(resize.size.width).toBe(220);
  });

  it("纵向拖拽也遵守扣除编辑器内边距后的最大宽度", async () => {
    await mount(40, 500);
    await drag(0, 200, "s");
    expect(resize.size).toEqual({ width: 240, height: 120 });
  });

  it("未移动不写回尺寸", async () => {
    await mount(40, 600);
    await drag(0);
    expect(onResizeEnd).not.toHaveBeenCalled();
  });

  it("只读时不能开始拖拽", async () => {
    await mount(40, 600, { readonly: true });
    await drag(40);
    expect(onResizeEnd).not.toHaveBeenCalled();
    expect(resize.isResizing).toBe(false);
  });

  it("未接入 em 的视频仍以像素保存", async () => {
    await mount(40, 600, { emElementRef: undefined });
    await drag(40);
    expect(resize.size).toEqual({ width: 360, height: 180 });
  });
});

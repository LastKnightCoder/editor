import { extensionsWithLayer } from "./extensions.fixture";
import { createRichTextExtension } from "../extensions/builtins";
import { createServiceRegistry } from "../extensions";
import { IWhiteboardRichText, embeddedTextOptions } from "../extensions/text";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WhiteBoard from "../WhiteBoard";
import { useBoard } from "../hooks/useBoard";
import type Board from "../Board";
import type { WhiteboardTextEditorProps as WhiteboardEditorProps } from "../extensions/text";

let root: Root;
let host: HTMLDivElement;
let board: Board;
let showEditor: (version: number) => void;

function DelayedEditor({ style, className }: WhiteboardEditorProps) {
  const [version, setVersion] = useState(0);
  showEditor = setVersion;
  return version === 0 ? (
    <div role="status">正在加载正文</div>
  ) : (
    <div key={version} data-slate-editor style={style} className={className} />
  );
}

function Capture() {
  board = useBoard();
  return null;
}

const setScrollMetrics = (editor: HTMLElement, scrollTop: number, scrollHeight = 500) => {
  Object.defineProperties(editor, {
    clientHeight: { configurable: true, value: 100 },
    scrollHeight: { configurable: true, value: scrollHeight },
  });
  editor.scrollTop = scrollTop;
};
const wheel = (target: HTMLElement, deltaY: number, ctrlKey = false, deltaX = 0) => {
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY,
    deltaX,
    ctrlKey,
  });
  target.dispatchEvent(event);
  return event;
};

beforeEach(async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <WhiteBoard
        initData={[
          {
            id: "text",
            type: "richtext",
            contentId: 1,
            x: 0,
            y: 0,
            width: 300,
            height: 100,
            maxWidth: 300,
            maxHeight: 100,
            resized: true,
            readonly: false,
            content: [{ type: "paragraph", children: [{ type: "formatted", text: "正文" }] }],
          },
        ]}
        showToolbar={false}
        showAttributeSetter={false}
        showStatusBar={false}
        extensions={[
          ...extensionsWithLayer(Capture).filter(item => item.id !== "tau.richtext"),
          createRichTextExtension(),
        ]}
        services={createServiceRegistry(register =>
          register(IWhiteboardRichText, { Editor: DelayedEditor, kit: embeddedTextOptions.kit })
        )}
      />
    )
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("白板文本滚轮仲裁", () => {
  it("文本工具待创建时显示文本光标，但空白处仍可连续平移", async () => {
    const canvas = host.querySelector<HTMLElement>("[data-whiteboard-root]")!;
    await act(async () => {
      board.setActiveTool("tau.richtext.create");
    });
    expect(canvas.classList.contains("cursor-text")).toBe(true);
    expect(board.interactions.isCreateGestureActive()).toBe(false);
    for (let round = 1; round <= 3; round++) {
      await act(async () => {
        wheel(canvas, 4);
      });
      expect(board.viewPort.minY).toBe(round * 40);
    }
    expect(board.activeTool).toBe("tau.richtext.create");
  });

  it("实际绘制期间暂停平移，取消绘制后恢复", async () => {
    const canvas = host.querySelector<HTMLElement>("[data-whiteboard-root]")!;
    await act(async () => {
      board.setActiveTool("tau.geometry.create", { geometryType: "rect" });
      expect(
        board.interactions.tryStartCreateGesture(
          new MouseEvent("pointerdown", { button: 0, clientX: 0, clientY: 0 }) as PointerEvent
        )
      ).toBe(true);
    });
    expect(board.interactions.isCreateGestureActive()).toBe(true);
    await act(async () => {
      wheel(canvas, 4);
    });
    expect(board.viewPort.minY).toBe(0);
    await act(async () => {
      board.interactions.cancel();
      wheel(canvas, 4);
    });
    expect(board.viewPort.minY).toBe(40);
  });

  it("异步挂载的正文仍优先滚动，画布不接管且保留默认滚动", async () => {
    expect(host.querySelector("[data-slate-editor]")).toBeNull();
    const viewportWheel = vi.spyOn(board, "onWheel").mockImplementation(() => {});
    await act(async () => showEditor(1));
    const editor = host.querySelector<HTMLElement>("[data-slate-editor]")!;
    setScrollMetrics(editor, 50);
    const down = wheel(editor, 30),
      up = wheel(editor, -30);
    expect(viewportWheel).not.toHaveBeenCalled();
    expect(down.defaultPrevented).toBe(false);
    expect(up.defaultPrevented).toBe(false);
  });

  it.each([
    [0, -30, 500],
    [400, 30, 500],
    [0, 30, 100],
  ])("滚动边界或无溢出时也不移动画布（位置=%s，方向=%s）", async (top, delta, height) => {
    await act(async () => showEditor(1));
    const editor = host.querySelector<HTMLElement>("[data-slate-editor]")!;
    setScrollMetrics(editor, top, height);
    const viewportWheel = vi.spyOn(board, "onWheel").mockImplementation(() => {});
    const event = wheel(editor, delta);
    expect(viewportWheel).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("Ctrl 滚轮仍交给画布缩放，普通横向滚轮留在正文", async () => {
    await act(async () => showEditor(1));
    const editor = host.querySelector<HTMLElement>("[data-slate-editor]")!;
    setScrollMetrics(editor, 50);
    const viewportWheel = vi.spyOn(board, "onWheel").mockImplementation(() => {});
    const zoom = wheel(editor, 30, true);
    const horizontal = wheel(editor, 0, false, 30);
    expect(viewportWheel).toHaveBeenCalledExactlyOnceWith(zoom);
    expect(horizontal.defaultPrevented).toBe(false);
  });

  it("画布空白处仍可滚动平移", () => {
    const viewportWheel = vi.spyOn(board, "onWheel").mockImplementation(() => {});
    const canvas = host.querySelector<HTMLElement>("[data-whiteboard-root]")!;
    const event = wheel(canvas, 30);
    expect(viewportWheel).toHaveBeenCalledExactlyOnceWith(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("触摸板连续滑动会实际平移视口，不丢弃短时间内的位移", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    const canvas = host.querySelector<HTMLElement>("[data-whiteboard-root]")!;
    const initial = { ...board.viewPort };
    await act(async () => {
      wheel(canvas, 0);
      expect(wheel(canvas, 4, false, 3).defaultPrevented).toBe(true);
      expect(wheel(canvas, 6, false, 2).defaultPrevented).toBe(true);
    });
    expect(board.viewPort.minX).toBe(initial.minX + 50);
    expect(board.viewPort.minY).toBe(initial.minY + 100);
    expect(board.viewPort.zoom).toBe(initial.zoom);
  });

  it("平移与缩放不会互相节流，被限频的缩放仍阻止默认行为", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    const canvas = host.querySelector<HTMLElement>("[data-whiteboard-root]")!;
    const initialZoom = board.viewPort.zoom;
    await act(async () => {
      wheel(canvas, 4);
      wheel(canvas, -30, true);
    });
    expect(board.viewPort.zoom).toBeCloseTo(initialZoom * 1.1);
    const afterZoom = { ...board.viewPort };
    await act(async () => {
      expect(wheel(canvas, -30, true).defaultPrevented).toBe(true);
      wheel(canvas, -4, false, -3);
    });
    expect(board.viewPort.zoom).toBe(afterZoom.zoom);
    expect(board.viewPort.minX).toBe(afterZoom.minX - 30);
    expect(board.viewPort.minY).toBe(afterZoom.minY - 40);
  });

  it("多轮滑动与重渲染后仍持续更新画布视口", async () => {
    const canvas = host.querySelector<HTMLElement>("[data-whiteboard-root]")!;
    const svg = host.querySelector("[data-whiteboard-canvas]")!;
    for (let round = 1; round <= 5; round++) {
      await act(async () => {
        wheel(canvas, 4, false, 3);
      });
      expect(board.viewPort.minX).toBe(round * 30);
      expect(board.viewPort.minY).toBe(round * 40);
      expect(svg.getAttribute("viewBox")?.split(" ").slice(0, 2)).toEqual([
        String(round * 30),
        String(round * 40),
      ]);
    }
  });

  it("正文 DOM 重建后监听新节点，并清除旧节点的监听", async () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    await act(async () => showEditor(1));
    const old = host.querySelector<HTMLElement>("[data-slate-editor]")!;
    setScrollMetrics(old, 50);
    await act(async () => showEditor(2));
    const current = host.querySelector<HTMLElement>("[data-slate-editor]")!;
    expect(current).not.toBe(old);
    setScrollMetrics(current, 50);
    const viewportWheel = vi.spyOn(board, "onWheel").mockImplementation(() => {});
    expect(wheel(current, 30).defaultPrevented).toBe(false);
    expect(viewportWheel).not.toHaveBeenCalled();
    host.querySelector("[data-whiteboard-root]")!.append(old);
    now += 250;
    const oldEvent = wheel(old, 30);
    expect(viewportWheel).toHaveBeenCalledExactlyOnceWith(oldEvent);
  });

  it("从画布起滑，经过正文和惯性尾段仍平移，停顿后可在正文重新起滑", async () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    await act(async () => showEditor(1));
    const editor = host.querySelector<HTMLElement>("[data-slate-editor]")!;
    const canvas = host.querySelector<HTMLElement>("[data-whiteboard-root]")!;
    setScrollMetrics(editor, 50);
    await act(async () => {
      wheel(canvas, 4);
    });
    for (const delta of [4, 2, 1]) {
      now += 100;
      await act(async () => {
        expect(wheel(editor, delta).defaultPrevented).toBe(true);
      });
    }
    expect(board.viewPort.minY).toBe(110);
    expect(editor.scrollTop).toBe(50);
    now += 250;
    await act(async () => {
      expect(wheel(editor, 4).defaultPrevented).toBe(false);
    });
    expect(board.viewPort.minY).toBe(110);
  });

  it("从正文起滑，经过空白处仍滚动原正文，停顿后画布可重新起滑", async () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    await act(async () => showEditor(1));
    const editor = host.querySelector<HTMLElement>("[data-slate-editor]")!;
    const canvas = host.querySelector<HTMLElement>("[data-whiteboard-root]")!;
    setScrollMetrics(editor, 50);
    expect(wheel(editor, 4).defaultPrevented).toBe(false);
    now += 100;
    await act(async () => {
      expect(wheel(canvas, 4).defaultPrevented).toBe(true);
    });
    expect(editor.scrollTop).toBe(54);
    expect(board.viewPort.minY).toBe(0);
    now += 250;
    await act(async () => {
      wheel(canvas, 4);
    });
    expect(board.viewPort.minY).toBe(40);
  });

  it("起始正文卸载后不残留手势归属", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    await act(async () => showEditor(1));
    const editor = host.querySelector<HTMLElement>("[data-slate-editor]")!;
    const canvas = host.querySelector<HTMLElement>("[data-whiteboard-root]")!;
    wheel(editor, 4);
    await act(async () => showEditor(2));
    await act(async () => {
      wheel(canvas, 4);
    });
    expect(board.viewPort.minY).toBe(40);
  });

  it("画布手势不会接管宿主浮层中的滚动", async () => {
    const canvas = host.querySelector<HTMLElement>("[data-whiteboard-root]")!;
    const overlay = document.createElement("div");
    overlay.setAttribute("data-whiteboard-overlay", "");
    canvas.append(overlay);
    await act(async () => {
      wheel(canvas, 4);
      expect(wheel(overlay, 4).defaultPrevented).toBe(false);
    });
    expect(board.viewPort.minY).toBe(40);
    overlay.remove();
  });
});

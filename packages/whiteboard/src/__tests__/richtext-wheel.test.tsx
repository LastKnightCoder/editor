import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WhiteBoard from "../WhiteBoard";
import { useBoard } from "../hooks/useBoard";
import type Board from "../Board";
import type { WhiteboardEditorProps } from "../host";

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
        slots={{ Editor: DelayedEditor, Layers: Capture }}
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

  it("正文 DOM 重建后监听新节点，并清除旧节点的监听", async () => {
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
    const oldEvent = wheel(old, 30);
    expect(viewportWheel).toHaveBeenCalledExactlyOnceWith(oldEvent);
  });
});

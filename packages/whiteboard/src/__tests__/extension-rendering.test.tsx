import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import WhiteBoard from "../WhiteBoard";
import { createVideoExtension } from "../extensions/builtins";
import { EHandlerPosition } from "../types";
import type { WhiteboardAPI } from "../extensions/api";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it("业务渲染仅收到受控 API，缩放回调在扩展内部绑定内核", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
  let body!: {
    board: WhiteboardAPI;
    element: any;
    onResizeStart: (...args: any[]) => void;
    onResize: (...args: any[]) => void;
    onResizeEnd: (...args: any[]) => void;
  };
  const extensions = [
    createVideoExtension({
      Body: (props: any) => {
        body = props as typeof body;
        return <g data-test-video />;
      },
    }),
  ];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <WhiteBoard
          extensions={extensions}
          initData={[
            { id: "video", type: "video", src: "video.mp4", x: 10, y: 20, width: 100, height: 80 },
          ]}
          initViewPort={{ minX: 0, minY: 0, width: 800, height: 600, zoom: 1 }}
          showToolbar={false}
          showAttributeSetter={false}
          showStatusBar={false}
        />
      )
    );
    expect(body.board).not.toHaveProperty("snap");
    expect(body.board).not.toHaveProperty("undos");
    expect(Object.isFrozen(body.element)).toBe(true);
    const original = body.element;
    await act(async () => {
      body.onResizeStart(original, { x: 110, y: 20 });
      body.onResize(
        original,
        EHandlerPosition.Right,
        { x: 110, y: 20 },
        { x: 160, y: 20 },
        false,
        false
      );
    });
    expect(body.board.getElement("video")?.width).toBe(150);
  } finally {
    await act(async () => root.unmount());
  }
});

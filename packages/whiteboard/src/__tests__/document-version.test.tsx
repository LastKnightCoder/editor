import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import WhiteBoard from "../WhiteBoard";
import Board from "../Board";
import { defineWhiteboardExtension, type WhiteboardAPI } from "../extensions/api";
import { useWhiteboardAPI } from "../extensions/runtime";
import {
  WHITEBOARD_DOCUMENT_VERSION,
  getDocumentVersion,
  isDocumentVersionSupported,
} from "../document-version";
import { DEFAULT_PAGE_SKETCH } from "../types";

const viewport = { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 };
const observer = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

afterEach(() => document.body.replaceChildren());

describe("文档版本工具", () => {
  it.each([
    [{}, 1],
    [{ version: undefined }, 1],
    [{ version: null }, 1],
    [{ version: 0 }, 1],
    [{ version: -1 }, 1],
    [{ version: 1.5 }, 1],
    [{ version: "2" }, 1],
    [{ version: 1 }, 1],
    [{ version: 2 }, 2],
    [{ version: 3 }, 3],
  ] as const)("getDocumentVersion(%j) → %p", (data, expected) => {
    expect(getDocumentVersion(data)).toBe(expected);
  });

  it("getDocumentVersion 对非对象入参归一为 1", () => {
    expect(getDocumentVersion(undefined)).toBe(1);
    expect(getDocumentVersion(null)).toBe(1);
    expect(getDocumentVersion("json")).toBe(1);
  });

  it.each([
    [1, true],
    [WHITEBOARD_DOCUMENT_VERSION, true],
    [WHITEBOARD_DOCUMENT_VERSION + 1, false],
  ] as const)("isDocumentVersionSupported(%p) → %p", (version, expected) => {
    expect(isDocumentVersionSupported(version)).toBe(expected);
  });

  it("内核快照始终写当前文档版本", () => {
    const board = new Board(
      [],
      viewport,
      { selectedElements: [], selectArea: null },
      [],
      [],
      false,
      DEFAULT_PAGE_SKETCH
    );
    expect(board.getSnapshot().version).toBe(WHITEBOARD_DOCUMENT_VERSION);
    board.apply({
      type: "set_viewport",
      properties: { ...viewport },
      newProperties: { minX: 10 },
    });
    expect(board.getSnapshot().version).toBe(WHITEBOARD_DOCUMENT_VERSION);
    board.destroy();
  });
});

function captureExtension(onApi: (api: WhiteboardAPI) => void) {
  let captured = false;
  return defineWhiteboardExtension({
    id: "test.capture",
    create: () => ({
      layers: [
        {
          id: "test.capture.layer",
          position: "outside" as const,
          component: function Capture() {
            const api = useWhiteboardAPI();
            if (!captured) {
              captured = true;
              onApi(api);
            }
            return null;
          },
        },
      ],
    }),
  });
}

async function mountBoard(options: { version?: number; readonly?: boolean }) {
  vi.stubGlobal("ResizeObserver", observer);
  const onChange = vi.fn();
  let api: WhiteboardAPI | undefined;
  const extensions = [captureExtension(value => (api = value))];
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <WhiteBoard
        initData={[]}
        initViewPort={viewport}
        showToolbar={false}
        showAttributeSetter={false}
        showStatusBar={false}
        version={options.version}
        readonly={options.readonly}
        onChange={onChange}
        extensions={extensions}
      />
    );
  });
  return {
    onChange,
    api: () => api!,
    panViewPort: () =>
      act(() => {
        api!.apply({
          type: "set_viewport",
          properties: { ...viewport },
          newProperties: { minX: 40 },
        });
      }),
    unmount: async () => {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    },
  };
}

describe("文档版本过高时只读且不写回", () => {
  it("version 超过支持范围：视口变化不触发 onChange，画布只读并带原因", async () => {
    const board = await mountBoard({ version: WHITEBOARD_DOCUMENT_VERSION + 1 });
    try {
      board.panViewPort();
      expect(board.onChange).not.toHaveBeenCalled();
      expect(board.api().readonly).toBe(true);
      expect(board.api().readonlyReason).toBe("document-too-new");
    } finally {
      await board.unmount();
    }
  });

  it("version=2 与缺省：onChange 正常写回当前版本，无只读原因", async () => {
    for (const version of [WHITEBOARD_DOCUMENT_VERSION, undefined]) {
      const board = await mountBoard({ version });
      try {
        board.panViewPort();
        expect(board.onChange).toHaveBeenCalledTimes(1);
        expect(board.onChange.mock.calls[0][0].version).toBe(WHITEBOARD_DOCUMENT_VERSION);
        expect(board.api().readonly).toBe(false);
        expect(board.api().readonlyReason).toBeNull();
      } finally {
        await board.unmount();
      }
    }
  });

  it("宿主显式 readonly 的普通只读不带原因", async () => {
    const board = await mountBoard({ readonly: true });
    try {
      expect(board.api().readonly).toBe(true);
      expect(board.api().readonlyReason).toBeNull();
    } finally {
      await board.unmount();
    }
  });
});

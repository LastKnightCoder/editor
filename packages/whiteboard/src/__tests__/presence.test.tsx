// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import EventEmitter from "eventemitter3";
import Board from "../Board";
import BoardContent from "../components/BoardContent";
import { BoardContext, SelectionContext, ViewPortContext } from "../context";
import type { WhiteboardDocumentBinding } from "../document";
import { readWhiteboardPresence, type WhiteboardPeer } from "@tau/collaboration";
import {
  previewPeerElements,
  alignPeerSelections,
  useWhiteboardPresence,
  WhiteboardPresenceOverlay,
} from "../collaboration/presence";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const element = { id: "rect", type: "geometry", x: 0, y: 0, width: 100, height: 80, rotation: 0 };
const peer: WhiteboardPeer = {
  clientId: 1,
  name: "甲",
  pageId: "page",
  cursor: { x: 20, y: 30 },
  moving: true,
  selection: [
    {
      id: "rect",
      minX: 200,
      minY: 300,
      maxX: 300,
      maxY: 380,
      geometry: { x: 200, y: 300, width: 100, height: 80, rotation: 0 },
    },
  ],
};

it("拖动预览只改变渲染副本，松手等待文档接力，取消即恢复", () => {
  const original = [element];
  expect(previewPeerElements(original, [peer])[0].x).toBe(200);
  expect(original[0].x).toBe(0);
  expect(previewPeerElements(original, [])).toBe(original);
  const released = { ...peer, moving: false, version: "AQ==" };
  expect(previewPeerElements(original, [released], () => false)[0].x).toBe(200);
  expect(previewPeerElements(original, [released], () => true)).toBe(original);
  const getBounds = (node: typeof element) => ({
    minX: node.x,
    minY: node.y,
    maxX: node.x + node.width,
    maxY: node.y + node.height,
  });
  const projected = previewPeerElements(original, [released], () => false);
  expect(
    alignPeerSelections({ getBounds } as unknown as Board, projected, [released])[0].selection[0]
      .minX
  ).toBe(projected[0].x);
  expect(
    alignPeerSelections({ getBounds } as unknown as Board, original, [released])[0].selection[0]
      .minX
  ).toBe(0);
});

it("在线状态拒绝非有限坐标、过量选区和非法几何，并剥离未知字段", () => {
  expect(readWhiteboardPresence({ ...peer, cursor: { x: Infinity, y: 0 } })).toBeNull();
  expect(
    readWhiteboardPresence({ ...peer, selection: Array(65).fill(peer.selection[0]) })
  ).toBeNull();
  expect(
    readWhiteboardPresence({
      ...peer,
      selection: [{ ...peer.selection[0], geometry: { ...element, width: -1 } }],
    })
  ).toBeNull();
  const state = readWhiteboardPresence({ ...peer, secret: "不能透传" })!;
  expect(state).not.toHaveProperty("secret");
  expect(state).not.toHaveProperty("name");
});

it("真实元素层与远端选框同帧移动，本机已选中与松手后的网络等待都不分离", async () => {
  const viewport = { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 };
  const selection = { selectArea: null, selectedElements: [element] };
  const board = new Board(
    [element],
    viewport,
    selection,
    [
      {
        name: "geometry",
        render: (_board, { element: node }) => (
          <rect
            data-presence-element="true"
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
          />
        ),
        getBounds: (_board, node) => ({
          minX: node.x,
          minY: node.y,
          maxX: node.x + node.width,
          maxY: node.y + node.height,
        }),
      },
    ],
    [],
    false
  );
  let received = false;
  board.document = { hasPresenceVersion: () => received } as unknown as WhiteboardDocumentBinding;
  const host = document.createElement("div");
  const root = createRoot(host);
  const render = async (value: WhiteboardPeer) =>
    act(async () =>
      root.render(
        <BoardContext value={board}>
          <SelectionContext value={selection}>
            <ViewPortContext value={viewport}>
              <BoardContent
                board={board}
                viewPort={viewport}
                noneCenterConnectArrows={board.children}
                centerConnectArrows={[]}
                centerConnectAndSelectedArrows={[]}
                peers={[value]}
                gridVisible={false}
              />
            </ViewPortContext>
          </SelectionContext>
        </BoardContext>
      )
    );
  const assertPosition = (x: number) => {
    expect(host.querySelector("[data-presence-element]")?.getAttribute("x")).toBe(String(x));
    expect(host.querySelector("[data-whiteboard-presence] rect")?.getAttribute("x")).toBe(
      String(x)
    );
  };
  try {
    await render(peer);
    assertPosition(200);
    const released = { ...peer, moving: false, version: "AQ==" };
    await render(released);
    assertPosition(200);
    expect(board.children[0].x).toBe(0);
    received = true;
    board.replaceChildrenSilently([{ ...element, x: 200, y: 300 }]);
    await render(released);
    assertPosition(200);
    // 后续文档位置优先于协作者仍停留的旧选框坐标。
    board.replaceChildrenSilently([{ ...element, x: 250, y: 300 }]);
    await render(released);
    assertPosition(250);
  } finally {
    await act(async () => root.unmount());
    board.destroy();
  }
});

it("鼠标与选区按节流发送；页面隔离，失焦与卸载清空，不改变画布", async () => {
  vi.useFakeTimers();
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const emitter = new EventEmitter();
  const board = Object.assign(emitter, {
    children: [element],
    selection: { selectedElements: [element] },
    getBounds: () => ({ minX: 0, minY: 0, maxX: 100, maxY: 80 }),
  }) as unknown as Board;
  const pointerListeners = new Set<() => void>();
  let point = { x: 10, y: 15 };
  const pointer = {
    getSnapshot: () => point,
    setPoint: () => {},
    subscribe: (fn: () => void) => {
      pointerListeners.add(fn);
      return () => {
        pointerListeners.delete(fn);
      };
    },
  };
  const publishPresence = vi.fn();
  const peers = [peer, { ...peer, clientId: 2, pageId: "other" }];
  const channel = { getPeers: () => peers, subscribePeers: () => () => {}, publishPresence };
  function View() {
    const visible = useWhiteboardPresence(board, pointer, { pageId: "page", channel });
    return (
      <svg>
        <WhiteboardPresenceOverlay peers={visible} zoom={2} />
      </svg>
    );
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(<View />);
      await vi.advanceTimersByTimeAsync(120);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });
    expect(host.querySelectorAll("rect")).toHaveLength(1);
    expect(host.querySelector("g[transform]")?.getAttribute("transform")).toContain("scale(0.5)");
    publishPresence.mockClear();
    for (let i = 0; i < 100; i++) {
      point = { x: i, y: i };
      pointerListeners.forEach(fn => fn());
    }
    emitter.emit("element:move", [element]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });
    expect(publishPresence).toHaveBeenCalledTimes(1);
    expect(publishPresence.mock.calls[0][1]).toMatchObject({
      cursor: { x: 99, y: 99 },
      moving: true,
      selection: [{ id: "rect" }],
    });
    window.dispatchEvent(new Event("blur"));
    expect(publishPresence.mock.calls.at(-1)?.[1]).toBeNull();
    expect(board.children).toEqual([element]);
  } finally {
    await act(async () => root.unmount());
  }
  expect(pointerListeners.size).toBe(0);
  expect(publishPresence.mock.calls.at(-1)?.[1]).toBeNull();
});

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import WhiteBoard from "../WhiteBoard";
import type Board from "../Board";
import { useBoard } from "../hooks/useBoard";
import { useSketch } from "../extensions/authorHooks";
import { defineWhiteboardExtension, type WhiteboardElementDefinition } from "../extensions/api";
import { createInteractionExtension } from "../extensions/builtins";
import { buildSchematic } from "../schematic/schematic";
import { elementLabel, elementTypeMeta } from "../components/Sidebar/tree/typeMeta";
import { createWhiteboardSession } from "../public";
import { ARROW_CONNECT_ID, BOARD_TO_CONTAINER } from "../constants";

const node = () => ({
  id: "box",
  type: "acme.box",
  x: 0,
  y: 0,
  width: 100,
  height: 80,
  schemaVersion: 1,
  data: { label: "来自插件" },
});
const definition: WhiteboardElementDefinition = {
  type: "acme.box",
  sketch: true,
  presentation: { label: "测试图形", getName: element => element.data.label },
  interaction: { resize: { handles: "corners", preserveAspectRatio: true }, connect: "rect" },
  render: function Box({ element }) {
    const sketch = useSketch(element);
    return (
      <rect
        data-plugin-sketch={String(sketch.enabled)}
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
      />
    );
  },
  schematic: element => [
    {
      kind: "rect",
      x: element.x,
      y: element.y,
      w: element.width,
      h: element.height,
      r: 1,
      fill: "var(--tau-accent)",
    },
  ],
};
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("没有创建画布时可投影缩略图，元信息使用同一静态定义，手动名优先", () => {
  const create = vi.fn(() => ({}));
  const extension = defineWhiteboardExtension({ id: "acme.box", elements: [definition], create });
  expect(
    buildSchematic([node()], { aspect: 1.6, dark: false, definitions: extension.elements })
      ?.shapes[0]
  ).toMatchObject({ kind: "rect", fill: "var(--tau-accent)" });
  expect(create).not.toHaveBeenCalled();
  expect(elementTypeMeta("acme.box", () => definition).label).toBe("测试图形");
  expect(elementLabel(node(), undefined, () => definition)).toBe("来自插件");
  expect(elementLabel({ ...node(), name: "自定义名称" }, undefined, () => definition)).toBe(
    "自定义名称"
  );
});
it("投影函数不能改原数据，异常和更高数据版本使用通用缩略占位", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const original = node();
  const schematic = vi.fn((element: ReturnType<typeof node>) => {
    element.data.label = "不允许";
    return [];
  });
  expect(
    buildSchematic([original], {
      aspect: 1,
      dark: false,
      definitions: [{ ...definition, schematic }],
    })?.shapes
  ).toHaveLength(1);
  expect(original.data.label).toBe("来自插件");
  schematic.mockClear();
  buildSchematic([{ ...original, schemaVersion: 2 }], {
    aspect: 1,
    dark: false,
    definitions: [{ ...definition, schematic }],
  });
  expect(schematic).not.toHaveBeenCalled();
});
it("手绘声明和状态按画布隔离，不改变内置类型白名单", () => {
  const snapshot = {
    children: [node()],
    selection: { selectedElements: [], selectArea: null },
    viewPort: { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
    version: 1,
    sketch: { mode: "sketch" as const, level: "natural" as const },
  };
  const a = createWhiteboardSession(snapshot, [
    defineWhiteboardExtension({ id: "acme.box", elements: [definition], create: () => ({}) }),
  ]);
  const b = createWhiteboardSession(snapshot, [
    defineWhiteboardExtension({
      id: "acme.box",
      elements: [{ ...definition, sketch: undefined }],
      create: () => ({}),
    }),
  ]);
  try {
    expect(a.api.getSketch(node()).enabled).toBe(true);
    expect(b.api.getSketch(node()).enabled).toBe(false);
  } finally {
    a.dispose();
    b.dispose();
  }
});

it("声明生成角点手柄，复用内核缩放历史与矩形连接，手绘 hook 响应页面切换", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
  let board!: Board;
  function Capture() {
    board = useBoard();
    return null;
  }
  const initial = node();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  cleanups.push(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  await act(async () =>
    root.render(
      <WhiteBoard
        initData={[initial]}
        initSelection={{ selectedElements: [initial], selectArea: null }}
        initViewPort={{ minX: 0, minY: 0, width: 800, height: 600, zoom: 1 }}
        showToolbar={false}
        showStatusBar={false}
        showAttributeSetter={false}
        extensions={[
          createInteractionExtension(),
          defineWhiteboardExtension({ id: "acme.box", elements: [definition], create: () => ({}) }),
          defineWhiteboardExtension({
            id: "test.capture",
            create: () => ({
              layers: [{ id: "test.capture.layer", position: "canvas", component: Capture }],
            }),
          }),
        ]}
      />
    )
  );
  const host = BOARD_TO_CONTAINER.get(board)!;
  host.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 800,
    height: 600,
    right: 800,
    bottom: 600,
    toJSON() {},
  });
  expect(container.querySelectorAll("[data-resize-handle]")).toHaveLength(4);
  const fire = async (target: Element | Document, type: string, x: number, y: number) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
    });
    Object.defineProperty(event, "pointerId", { value: 50 });
    await act(async () => {
      target.dispatchEvent(event);
    });
  };
  const handle = container.querySelector('[data-resize-handle="bottom-right"] g')!;
  await fire(handle, "pointerdown", 100, 80);
  await fire(host, "pointermove", 200, 160);
  await fire(document, "pointerup", 200, 160);
  expect(board.children[0].width).toBe(200);
  expect(board.undos).toHaveLength(1);
  expect(board.getArrowBindPoint(board.children[0], ARROW_CONNECT_ID.RIGHT)).toEqual({
    x: 200,
    y: 80,
  });
  await act(async () => board.undo());
  expect(board.children[0].width).toBe(100);
  await act(async () =>
    board.extensions!.api.submit([
      {
        type: "set_sketch",
        properties: board.sketch,
        newProperties: { mode: "sketch", level: "natural" },
      },
    ])
  );
  expect(container.querySelector("[data-plugin-sketch]")?.getAttribute("data-plugin-sketch")).toBe(
    "true"
  );
  await act(async () => {
    board.readonly = true;
  });
  expect(container.querySelectorAll("[data-resize-handle]")).toHaveLength(0);
});

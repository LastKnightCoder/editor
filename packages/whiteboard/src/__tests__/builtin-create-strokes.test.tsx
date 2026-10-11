/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import Board from "../Board";
import WhiteBoard from "../WhiteBoard";
import { SELECT_TOOL_ID, ARROW_TOOL_ID, HANDWRITE_TOOL_ID } from "../constants/tools";
import { createStandardWhiteboardExtensions } from "../extensions/builtins";
import { defineWhiteboardExtension, type WhiteboardExtension } from "../extensions/api";
import { handwriteCreateSpec, MAX_STROKE_POINTS } from "../extensions/creators/handwrite";
import { useBoard } from "../hooks/useBoard";
import {
  buildStrokeOutline,
  denormalizePoints,
  getPointsBounds,
  getPrevHandwriteStyle,
  getPrevArrowStylePreset,
  normalizeOutline,
  normalizePoints,
  type HandwriteInputPoint,
} from "../utils";
import type { BoardElement, ContextMenuContext, Point, Selection } from "../types";

const geometrySeed = (id: string, x: number, y: number, width = 80, height = 60) =>
  ({ id, type: "geometry", x, y, width, height }) as BoardElement;

const richtextSeed = (id: string, x: number, y: number, width = 100, height = 100) =>
  ({
    id,
    type: "richtext",
    contentId: 1,
    x,
    y,
    width,
    height,
    maxWidth: width,
    maxHeight: height,
    resized: true,
    readonly: false,
    content: [{ type: "paragraph", children: [{ type: "formatted", text: id }] }],
  }) as BoardElement;

/** 旧 useCreateArrow 的元素构造（迁移前源码逻辑），用于字段级对比 */
const legacyArrowElement = (
  start: Point,
  end: Point,
  sourceSnap: { bindId: string; customOffset: { u: number; v: number } } | null = null
) => {
  const preset = getPrevArrowStylePreset();
  return {
    id: "legacy",
    type: "arrow",
    lineType: preset.lineType,
    source: {
      marker: preset.sourceMarker,
      ...(sourceSnap
        ? {
            bindId: sourceSnap.bindId,
            connectId: "custom",
            customOffset: sourceSnap.customOffset,
          }
        : {}),
    },
    target: {
      marker: preset.targetMarker,
    },
    points: [start, end],
    lineWidth: preset.lineWidth,
    themeColorId: preset.themeColorId,
    dashed: preset.dashed,
    dashArray: preset.dashArray,
    animated: preset.animated,
    animationSpeed: preset.animationSpeed,
  };
};

/** 旧 useCreateHandwrite 的 createElementFromPoints（迁移前源码逻辑），用于字段级对比 */
const legacyHandwriteFromPoints = (
  points: HandwriteInputPoint[],
  style: ReturnType<typeof getPrevHandwriteStyle>,
  id: string
) => {
  if (points.length < 2) return null;
  const outline = buildStrokeOutline(points, style);
  const bounds = getPointsBounds(outline);
  if (!bounds) return null;
  return {
    id,
    type: "handwrite",
    name: "手写",
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    resizable: true,
    points: normalizePoints(points, bounds),
    outline: normalizeOutline(outline, bounds),
    style,
  };
};

/** 旧 up 路径：从临时元素的归一化点重建（双归一化与旧实现浮点一致） */
const legacyHandwriteRebuilt = (
  element: NonNullable<ReturnType<typeof legacyHandwriteFromPoints>>
) =>
  legacyHandwriteFromPoints(
    denormalizePoints(element.points, {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    }),
    element.style,
    element.id
  );

interface RenderResult {
  board: Board;
  host: HTMLDivElement;
  root: Root;
  canvas: Element;
  fire: (
    type: "pointerdown" | "pointermove" | "pointerup",
    x: number,
    y: number,
    modifiers?: { shiftKey?: boolean; altKey?: boolean; pressure?: number }
  ) => Promise<void>;
  unmount: () => Promise<void>;
}

/** 容器对 pointermove 有 25ms 节流：连续移动之间留出真实间隔保证每次都送达 */
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const renderWhiteBoard = async (
  initData: BoardElement[],
  extraExtensions: readonly WhiteboardExtension[] = []
): Promise<RenderResult> => {
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
  const extensions: readonly WhiteboardExtension[] = [
    ...createStandardWhiteboardExtensions(),
    ...extraExtensions,
    defineWhiteboardExtension({
      id: "test.capture",
      create: () => ({
        layers: [{ id: "test.capture.layer", position: "canvas", component: Capture }],
      }),
    }),
  ];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <WhiteBoard
        extensions={extensions}
        initData={initData}
        initViewPort={{ minX: 0, minY: 0, width: 800, height: 600, zoom: 1 }}
        showToolbar={false}
        showAttributeSetter={false}
        showStatusBar={false}
      />
    );
  });
  const canvas = host.querySelector("svg[data-whiteboard-canvas]")!;
  const fire = async (
    type: "pointerdown" | "pointermove" | "pointerup",
    x: number,
    y: number,
    modifiers?: { shiftKey?: boolean; altKey?: boolean; pressure?: number }
  ) => {
    await act(async () => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        clientX: x,
        clientY: y,
        shiftKey: !!modifiers?.shiftKey,
        altKey: !!modifiers?.altKey,
      });
      if (modifiers?.pressure !== undefined) {
        Object.defineProperty(event, "pressure", { value: modifiers.pressure });
      }
      canvas.dispatchEvent(event);
    });
  };
  return {
    board,
    host,
    root,
    canvas,
    fire,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
    },
  };
};

const emptyMenuContext = (board: Board): ContextMenuContext => ({
  board,
  clientX: 0,
  clientY: 0,
  viewPortPoint: { x: 0, y: 0 },
  selectedElements: [],
  hitElements: [],
  targetElements: [],
  isHitSelected: false,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("arrow 创建工具", () => {
  it("拖动创建：字段与旧构造逻辑一致、单撤销步、创建后选中并回到选择工具，拖动中文档不变且预览不画描边", async () => {
    const { board, host, fire, unmount } = await renderWhiteBoard([]);
    board.setActiveTool(ARROW_TOOL_ID);

    const childrenBefore = board.children;
    await fire("pointerdown", 100, 100);
    await sleep(30);
    await fire("pointermove", 200, 160);
    expect(board.children).toBe(childrenBefore);
    expect(board.creationPreview?.element.type).toBe("arrow");
    expect(host.querySelector("[data-creation-preview-bounds]")).toBeNull();

    await fire("pointerup", 200, 160);
    expect(board.children).toHaveLength(1);
    const created = board.children.find(element => element.type === "arrow")!;
    const legacy = legacyArrowElement({ x: 100, y: 100 }, { x: 200, y: 160 });
    expect({ ...created, id: undefined }).toStrictEqual({ ...legacy, id: undefined });
    expect(board.selection.selectedElements.map(element => element.id)).toEqual([created.id]);
    expect(board.activeTool).toBe(SELECT_TOOL_ID);
    expect(board.undos).toHaveLength(1);
    board.undo();
    expect(board.children).toHaveLength(0);
    await unmount();
  });

  it("Shift 将终点吸附到 45° 方向（保持长度）", async () => {
    const { board, fire, unmount } = await renderWhiteBoard([]);
    board.setActiveTool(ARROW_TOOL_ID);
    await fire("pointerdown", 100, 100);
    await sleep(30);
    await fire("pointermove", 200, 160, { shiftKey: true });
    await fire("pointerup", 200, 160, { shiftKey: true });
    const created = board.children.find(element => element.type === "arrow")!;
    const snapped = 100 + Math.hypot(100, 60) * Math.cos(Math.PI / 4);
    expect(created.points[1].x).toBeCloseTo(snapped, 6);
    expect(created.points[1].y).toBeCloseTo(snapped, 6);
    await unmount();
  });

  it("按住 Alt 按下：起点吸附自定义连接点并写入 source 绑定（与旧逻辑字段一致）", async () => {
    const { board, fire, unmount } = await renderWhiteBoard([richtextSeed("text-a", 200, 100)]);
    board.setActiveTool(ARROW_TOOL_ID);

    await fire("pointerdown", 308, 150, { altKey: true });
    await sleep(30);
    await fire("pointermove", 360, 150, { altKey: true });
    await fire("pointerup", 360, 150, { altKey: true });

    expect(board.children).toHaveLength(2);
    const created = board.children.find(element => element.type === "arrow")!;
    const legacy = legacyArrowElement(
      { x: 300, y: 150 },
      { x: 360, y: 150 },
      { bindId: "text-a", customOffset: { u: 1, v: 0.5 } }
    );
    expect({ ...created, id: undefined }).toStrictEqual({ ...legacy, id: undefined });
    await unmount();
  });

  it("终点靠近元素固定连接点时吸附并写入 target 绑定", async () => {
    const { board, fire, unmount } = await renderWhiteBoard([richtextSeed("text-a", 200, 100)]);
    board.setActiveTool(ARROW_TOOL_ID);

    await fire("pointerdown", 100, 150);
    await sleep(30);
    // 超过阈值：创建箭头（尚无 tau.arrow.update）
    await fire("pointermove", 150, 150);
    await sleep(30);
    // 端点移到右边连接点上：发出 tau.arrow.update，元素进入候选
    await fire("pointermove", 300, 150);
    await sleep(30);
    // 下一帧吸附到候选连接点
    await fire("pointermove", 305, 150);
    await fire("pointerup", 305, 150);

    const created = board.children.find(element => element.type === "arrow")!;
    expect(created.target).toMatchObject({
      bindId: "text-a",
      connectId: "right",
    });
    expect(created.points[1]).toEqual({ x: 300, y: 150 });
    expect(created.source).not.toHaveProperty("bindId");
    await unmount();
  });

  it("拖动中按住 Alt：终点吸附自定义连接点（射线-边缘交点）并发出 custom-snap 事件", async () => {
    const { board, fire, unmount } = await renderWhiteBoard([richtextSeed("text-a", 200, 100)]);
    const customSnapSpy = vi.fn();
    board.on("tau.arrow.custom-snap", customSnapSpy);
    board.setActiveTool(ARROW_TOOL_ID);

    await fire("pointerdown", 100, 150);
    await sleep(30);
    await fire("pointermove", 150, 150, { altKey: true });
    await sleep(30);
    await fire("pointermove", 310, 150, { altKey: true });
    await sleep(30);
    await fire("pointermove", 312, 150, { altKey: true });
    await fire("pointerup", 312, 150, { altKey: true });

    const created = board.children.find(element => element.type === "arrow")!;
    expect(created.target).toMatchObject({
      bindId: "text-a",
      connectId: "custom",
      customOffset: { u: 1, v: 0.5 },
    });
    expect(created.points[1]).toEqual({ x: 300, y: 150 });
    expect(customSnapSpy).toHaveBeenCalledWith({ point: { x: 300, y: 150 } });
    await unmount();
  });

  it("单击不创建且工具保持", async () => {
    const { board, fire, unmount } = await renderWhiteBoard([]);
    board.setActiveTool(ARROW_TOOL_ID);
    await fire("pointerdown", 100, 100);
    await fire("pointerup", 103, 100);
    expect(board.children).toHaveLength(0);
    expect(board.activeTool).toBe(ARROW_TOOL_ID);
    expect(board.undos).toHaveLength(0);
    await unmount();
  });

  it("拖动中发出与旧实现一致的事件（tau.arrow.update / tau.arrow.drop / tau.arrow.move-end）", async () => {
    const { board, fire, unmount } = await renderWhiteBoard([richtextSeed("text-a", 200, 100)]);
    const updateSpy = vi.fn();
    const dropSpy = vi.fn();
    const moveEndSpy = vi.fn();
    board.on("tau.arrow.update", updateSpy);
    board.on("tau.arrow.drop", dropSpy);
    board.on("tau.arrow.move-end", moveEndSpy);
    board.setActiveTool(ARROW_TOOL_ID);

    await fire("pointerdown", 100, 150);
    await sleep(30);
    await fire("pointermove", 150, 150);
    expect(updateSpy).not.toHaveBeenCalled();
    await sleep(30);
    await fire("pointermove", 300, 150);
    await sleep(30);
    await fire("pointermove", 305, 150);
    expect(updateSpy).toHaveBeenCalled();
    expect(updateSpy.mock.calls.at(-1)![0].currentPoint).toEqual({ x: 305, y: 150 });
    expect(dropSpy).toHaveBeenCalledWith({ elementId: "text-a", connectId: "right" });
    expect(moveEndSpy).not.toHaveBeenCalled();

    await fire("pointerup", 305, 150);
    expect(moveEndSpy).toHaveBeenCalled();
    await unmount();
  });
});

describe("handwrite 创建工具", () => {
  it("多点拖动：一次插入、字段与旧逻辑一致、压力入点、工具保持、选区清空、单撤销步、预览不画描边", async () => {
    const { board, host, fire, unmount } = await renderWhiteBoard([geometrySeed("seed", 0, 0)]);
    board.apply(
      {
        type: "set_selection",
        properties: board.selection,
        newProperties: { selectArea: null, selectedElements: [board.children[0]] },
      },
      false
    );
    expect(board.selection.selectedElements).toHaveLength(1);
    board.setActiveTool(HANDWRITE_TOOL_ID);

    await fire("pointerdown", 100, 100, { pressure: 0.8 });
    await sleep(30);
    await fire("pointermove", 120, 110, { pressure: 0.4 });
    await sleep(30);
    await fire("pointermove", 140, 120, { pressure: 0 });
    await sleep(30);
    await fire("pointermove", 160, 130, { pressure: 0.6 });
    expect(board.children).toHaveLength(1);
    expect(board.creationPreview?.element.type).toBe("handwrite");
    // 手写笔迹的预览不画包围盒描边
    expect(host.querySelector("[data-creation-preview-bounds]")).toBeNull();

    await fire("pointerup", 160, 130);
    expect(board.children).toHaveLength(2);
    const created = board.children[1];
    expect(created.type).toBe("handwrite");

    const style = getPrevHandwriteStyle();
    const inputPoints: HandwriteInputPoint[] = [
      { x: 100, y: 100, pressure: 0.8 },
      { x: 120, y: 110, pressure: 0.4 },
      { x: 140, y: 120, pressure: 0.5 },
      { x: 160, y: 130, pressure: 0.6 },
    ];
    const legacy = legacyHandwriteRebuilt(legacyHandwriteFromPoints(inputPoints, style, "x")!);
    expect({ ...created, id: "x" }).toStrictEqual({ ...legacy!, id: "x" });
    // 压力值进入点数据（归一化坐标，压力原样保留）
    expect(
      (created as unknown as { points: HandwriteInputPoint[] }).points.map(point => point.pressure)
    ).toEqual([0.8, 0.4, 0.5, 0.6]);

    expect(board.activeTool).toBe(HANDWRITE_TOOL_ID);
    expect(board.selection.selectedElements).toHaveLength(0);
    expect(board.undos).toHaveLength(1);
    board.undo();
    expect(board.children.map(element => element.id)).toEqual(["seed"]);
    await unmount();
  });

  it("少于 2 个采样点不创建且工具保持", async () => {
    const { board, fire, unmount } = await renderWhiteBoard([]);
    board.setActiveTool(HANDWRITE_TOOL_ID);
    await fire("pointerdown", 100, 100);
    await sleep(30);
    // 1 屏幕像素：低于 1.5 采样阈值，不入点
    await fire("pointermove", 101, 100);
    await fire("pointerup", 101, 100);
    expect(board.children).toHaveLength(0);
    expect(board.creationPreview).toBeNull();
    expect(board.activeTool).toBe(HANDWRITE_TOOL_ID);
    expect(board.undos).toHaveLength(0);
    await unmount();
  });

  it("直接驱动手势：采样、2000 点截断与旧纯函数产出一致", async () => {
    const previewSpy = vi.fn();
    const selection: Selection = { selectArea: null, selectedElements: [] };
    const baseCtx = {
      start: { x: 0, y: 0 },
      shift: false,
      alt: false,
      zoom: 1,
      pressure: 0.5,
      api: { selection } as never,
    };
    const gesture = handwriteCreateSpec.gesture as {
      begin: (ctx: unknown) => {
        move: (ctx: unknown) => void;
        end: (ctx: unknown) => unknown;
      };
    };
    const session = gesture.begin({ ...baseCtx, point: { x: 0, y: 0 }, preview: previewSpy });

    // 低于采样阈值的移动不入点
    session.move({ ...baseCtx, point: { x: 1, y: 0 } });
    expect(previewSpy).not.toHaveBeenCalled();

    const totalMoves = MAX_STROKE_POINTS + 10;
    for (let i = 1; i <= totalMoves; i++) {
      session.move({ ...baseCtx, point: { x: i * 2, y: 0 } });
    }
    const result = session.end({ ...baseCtx, point: { x: totalMoves * 2, y: 0 }, moved: true }) as {
      element: BoardElement;
      operations: { type: string; newProperties: { selectedElements: BoardElement[] } }[];
    };
    expect(result.element.points).toHaveLength(MAX_STROKE_POINTS);

    const style = getPrevHandwriteStyle();
    const expectedPoints: HandwriteInputPoint[] = Array.from(
      { length: MAX_STROKE_POINTS },
      (_, i) => ({
        x: i * 2,
        y: 0,
        pressure: 0.5,
      })
    );
    const legacy = legacyHandwriteRebuilt(legacyHandwriteFromPoints(expectedPoints, style, "x")!);
    expect({ ...result.element, id: "x" }).toStrictEqual({ ...legacy!, id: "x" });
    // 插入与清空选区同属一个撤销步
    expect(result.operations[0].type).toBe("set_selection");
    expect(result.operations[0].newProperties.selectedElements).toEqual([]);
    // 预览不画包围盒描边
    expect(previewSpy).toHaveBeenLastCalledWith(expect.objectContaining({ type: "handwrite" }), {
      bounds: false,
    });
  });
});

describe("右键菜单入口（arrow / handwrite）", () => {
  it("空白处右键菜单激活对应创建工具", async () => {
    const { board, unmount } = await renderWhiteBoard([]);

    board.getPlugin("arrow")!.getContextMenu!(emptyMenuContext(board))
      .find(item => item.key === "create-arrow")!
      .onSelect(emptyMenuContext(board));
    expect(board.activeTool).toBe(ARROW_TOOL_ID);

    board.setActiveTool(SELECT_TOOL_ID);
    board.getPlugin("handwrite")!.getContextMenu!(emptyMenuContext(board))
      .find(item => item.key === "create-handwrite")!
      .onSelect(emptyMenuContext(board));
    expect(board.activeTool).toBe(HANDWRITE_TOOL_ID);
    await unmount();
  });
});

describe("创建手势的指针高频路径", () => {
  it("一次 pointermove 携带 5 个 coalesced 事件：逐点采样入 5 个点，预览批末只应用一次", async () => {
    const { board, canvas, fire, unmount } = await renderWhiteBoard([]);
    board.setActiveTool(HANDWRITE_TOOL_ID);

    const setPreviewSpy = vi.spyOn(board, "setCreationPreview");
    await fire("pointerdown", 100, 100, { pressure: 0.8 });
    await sleep(30);

    await act(async () => {
      const event = new MouseEvent("pointermove", {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 115,
        clientY: 100,
      });
      // 末尾样本与主事件同位同时戳：主事件去重，共 5 个样本
      const coalesced = [
        { clientX: 103, clientY: 100, pressure: 0.9, timeStamp: 1 },
        { clientX: 106, clientY: 100, pressure: 0.7, timeStamp: 2 },
        { clientX: 109, clientY: 100, pressure: 0.5, timeStamp: 3 },
        { clientX: 112, clientY: 100, pressure: 0.3, timeStamp: 4 },
        { clientX: 115, clientY: 100, pressure: 0.1, timeStamp: event.timeStamp },
      ];
      Object.defineProperty(event, "getCoalescedEvents", { value: () => coalesced });
      canvas.dispatchEvent(event);
    });

    expect(board.creationPreview?.element.type).toBe("handwrite");
    // 5 次采样只触发一次预览应用（批内合并）
    expect(setPreviewSpy).toHaveBeenCalledTimes(1);
    expect(
      (board.creationPreview!.element as unknown as { points: unknown[] }).points
    ).toHaveLength(6);

    await fire("pointerup", 115, 100);
    const created = board.children.find(element => element.type === "handwrite")!;
    expect((created as unknown as { points: HandwriteInputPoint[] }).points).toHaveLength(6);
    expect(
      (created as unknown as { points: HandwriteInputPoint[] }).points.map(point => point.pressure)
    ).toEqual([0.8, 0.9, 0.7, 0.5, 0.3, 0.1]);
    await unmount();
  });

  it("创建手势中连续两次间隔 <25ms 的 pointermove 都被处理（绕过容器节流）", async () => {
    const { board, fire, unmount } = await renderWhiteBoard([]);
    expect(board.interactions.isCreateGestureActive()).toBe(false);
    board.setActiveTool(HANDWRITE_TOOL_ID);

    await fire("pointerdown", 100, 100);
    // 不留 25ms 间隔：两次快速移动都必须送达手势（否则第二个点会被节流吞掉）
    await fire("pointermove", 110, 100);
    await fire("pointermove", 120, 100);
    expect(board.interactions.isCreateGestureActive()).toBe(true);
    expect(
      (board.creationPreview!.element as unknown as { points: unknown[] }).points
    ).toHaveLength(3);

    await fire("pointerup", 120, 100);
    expect(board.children.find(element => element.type === "handwrite")).toBeDefined();
    expect(board.interactions.isCreateGestureActive()).toBe(false);
    await unmount();
  });

  it("非创建状态下高频移动不进入绕过路径（节流行为保持）", async () => {
    const { board, fire, unmount } = await renderWhiteBoard([]);
    await fire("pointermove", 100, 100);
    await fire("pointermove", 110, 100);
    await fire("pointermove", 120, 100);
    expect(board.interactions.isCreateGestureActive()).toBe(false);
    await unmount();
  });
});

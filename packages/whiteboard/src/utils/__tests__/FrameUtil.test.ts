import { afterEach, describe, expect, it, vi } from "vitest";

// FrameUtil 静态导入会经 PathUtil -> BoardUtil -> Board 拉到依赖 Electron bridge 的模块，

import {
  FRAME_DEFAULT_BORDER_STYLE,
  FRAME_DEFAULT_TITLE_POSITION,
  FRAME_INLINE_TITLE_HEIGHT,
  FRAME_TITLE_GAP,
  FRAME_TITLE_HEIGHT,
  type FrameElement,
} from "../../types/frame";
import { FrameUtil } from "../FrameUtil";

const createFrame = (overrides: Partial<FrameElement> = {}): FrameElement => ({
  id: "frame-1",
  type: "frame",
  x: 100,
  y: 200,
  width: 400,
  height: 300,
  title: "Frame",
  children: [],
  backgroundColor: "rgba(59, 130, 246, 0.1)",
  borderColor: "#3b82f6",
  borderWidth: 2,
  borderRadius: 8,
  padding: 20,
  containmentPolicy: "partial",
  removalPolicy: "partial",
  autoResize: true,
  minWidth: 100,
  minHeight: 60,
  ...overrides,
});

describe("FrameUtil.getTitleY", () => {
  it("top 模式下标题位于 Frame 上方外部", () => {
    const frame = createFrame({ titlePosition: "top" });
    expect(FrameUtil.getTitleY(frame)).toBe(frame.y - FRAME_TITLE_HEIGHT - FRAME_TITLE_GAP);
  });

  it("缺省 titlePosition 视为 top", () => {
    const frame = createFrame();
    expect(FrameUtil.getTitleY(frame)).toBe(frame.y - FRAME_TITLE_HEIGHT - FRAME_TITLE_GAP);
  });

  it("inline 模式下标题位于 Frame 内部顶部", () => {
    const frame = createFrame({ titlePosition: "inline" });
    expect(FrameUtil.getTitleY(frame)).toBe(frame.y);
  });
});

describe("FrameUtil.getPrevTitlePosition", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("无存储时返回默认位置 top", () => {
    expect(FrameUtil.getPrevTitlePosition()).toBe(FRAME_DEFAULT_TITLE_POSITION);
  });

  it("读取已持久化的 inline 偏好", () => {
    FrameUtil.setLocalStorage("titlePosition", "inline");
    expect(FrameUtil.getPrevTitlePosition()).toBe("inline");
  });

  it("非法存储值回退为默认位置", () => {
    FrameUtil.setLocalStorage("titlePosition", "diagonal");
    expect(FrameUtil.getPrevTitlePosition()).toBe(FRAME_DEFAULT_TITLE_POSITION);
  });
});

describe("FrameUtil.getPrevBorderStyle", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("无存储时返回默认线型 solid", () => {
    expect(FrameUtil.getPrevBorderStyle()).toBe(FRAME_DEFAULT_BORDER_STYLE);
  });

  it("读取已持久化的 dashed 偏好", () => {
    FrameUtil.setLocalStorage("borderStyle", "dashed");
    expect(FrameUtil.getPrevBorderStyle()).toBe("dashed");
  });

  it("非法存储值回退为默认线型", () => {
    FrameUtil.setLocalStorage("borderStyle", "wavy");
    expect(FrameUtil.getPrevBorderStyle()).toBe(FRAME_DEFAULT_BORDER_STYLE);
  });
});

describe("FrameUtil.createFrame", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("沿用已持久化的 dotted 线型", () => {
    FrameUtil.setLocalStorage("borderStyle", "dotted");
    expect(FrameUtil.createFrame(0, 0, 100, 100).borderStyle).toBe("dotted");
  });
});

describe("FrameUtil.getInlineTopPadding", () => {
  it("top 模式下顶部 padding 等于 frame.padding", () => {
    const frame = createFrame({ titlePosition: "top", padding: 20 });
    expect(FrameUtil.getInlineTopPadding(frame)).toBe(20);
  });

  it("inline 模式下顶部 padding 包含标题预留高度", () => {
    const frame = createFrame({ titlePosition: "inline", padding: 20 });
    expect(FrameUtil.getInlineTopPadding(frame)).toBe(20 + FRAME_INLINE_TITLE_HEIGHT);
  });
});

describe("FrameUtil.calculateFrameFitBounds (inline 预留)", () => {
  const stubBoard = {
    getBounds: (el: { x: number; y: number; width: number; height: number }) => ({
      minX: el.x,
      minY: el.y,
      maxX: el.x + el.width,
      maxY: el.y + el.height,
    }),
  } as any;

  it("inline 模式下 fit 后顶部为内容预留标题空间，内容不被标题覆盖", () => {
    const child = {
      id: "c",
      type: "rect",
      x: 100,
      y: 200,
      width: 50,
      height: 50,
    } as any;
    const frame = createFrame({
      titlePosition: "inline",
      padding: 20,
      children: [child],
    });
    const bounds = FrameUtil.calculateFrameFitBounds(stubBoard, frame, [child]);
    const topPadding = frame.padding + FRAME_INLINE_TITLE_HEIGHT;
    expect(bounds.y).toBe(200 - topPadding);
    expect(bounds.height).toBe(50 + frame.padding + topPadding);
    // 内容顶部到 frame 顶部的距离应 >= 标题高度，确保不遮挡
    expect(200 - bounds.y).toBeGreaterThanOrEqual(FRAME_INLINE_TITLE_HEIGHT);
  });

  it("top 模式下 fit 行为不变", () => {
    const child = {
      id: "c",
      type: "rect",
      x: 100,
      y: 200,
      width: 50,
      height: 50,
    } as any;
    const frame = createFrame({
      titlePosition: "top",
      padding: 20,
      children: [child],
    });
    const bounds = FrameUtil.calculateFrameFitBounds(stubBoard, frame, [child]);
    expect(bounds.y).toBe(200 - frame.padding);
    expect(bounds.height).toBe(50 + 2 * frame.padding);
  });
});

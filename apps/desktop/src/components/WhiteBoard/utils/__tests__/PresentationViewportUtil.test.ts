import { describe, expect, it } from "vitest";
import type { BoardElement, ElementBounds } from "../../types/board";
import {
  FRAME_TITLE_GAP,
  FRAME_TITLE_HEIGHT,
  type FrameElement,
} from "../../types/frame";
import {
  getFramePresentationBounds,
  mergePresentationElementBounds,
} from "../PresentationViewportUtil";

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

const resolveBounds = (element: BoardElement): ElementBounds => ({
  minX: element.x,
  minY: element.y,
  maxX: element.x + element.width,
  maxY: element.y + element.height,
});

describe("PresentationViewportUtil", () => {
  it("合并 Frame 演示边界时应包含上方标题区域", () => {
    const frame = createFrame();
    const bounds = mergePresentationElementBounds([frame], resolveBounds);

    expect(bounds).toEqual(getFramePresentationBounds(frame));
    expect(bounds?.minY).toBe(frame.y - FRAME_TITLE_HEIGHT - FRAME_TITLE_GAP);
  });
});

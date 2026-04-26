import { describe, expect, it } from "vitest";
import {
  COLOR_PICKER_HEIGHT,
  OVERLAY_SAFE_MARGIN,
  TOOLBAR_HEIGHT,
  getColorPickerPosition,
  getToolbarPosition,
  isUsableRect,
} from "../overlayPosition";

const viewport = { width: 320, height: 240 };

const createRect = (overrides: Partial<DOMRect> = {}) =>
  ({
    left: 120,
    top: 120,
    right: 200,
    bottom: 144,
    width: 80,
    height: 24,
    x: 120,
    y: 120,
    toJSON: () => ({}),
    ...overrides,
  }) as DOMRect;

describe("overlayPosition", () => {
  it("普通选区优先显示在上方", () => {
    const position = getToolbarPosition(createRect(), viewport);

    expect(position.placement).toBe("above");
    expect(position.y).toBe(110);
  });

  it("顶部选区会翻转到下方", () => {
    const position = getToolbarPosition(
      createRect({ top: 8, bottom: 28 }),
      viewport,
    );

    expect(position.placement).toBe("below");
    expect(position.y).toBeGreaterThanOrEqual(OVERLAY_SAFE_MARGIN);
  });

  it("会钳制超出视口的水平位置", () => {
    const leftClamped = getToolbarPosition(
      createRect({ left: -40, width: 20 }),
      viewport,
    );
    const rightClamped = getToolbarPosition(
      createRect({ left: 400, width: 20, right: 420 }),
      viewport,
    );

    expect(leftClamped.x).toBe(OVERLAY_SAFE_MARGIN);
    expect(rightClamped.x).toBe(viewport.width - OVERLAY_SAFE_MARGIN);
  });

  it("颜色面板在上方布局时不会超出顶部", () => {
    const position = getColorPickerPosition(
      {
        x: 160,
        y: OVERLAY_SAFE_MARGIN + TOOLBAR_HEIGHT,
        placement: "above",
      },
      viewport,
    );

    expect(position.y).toBe(OVERLAY_SAFE_MARGIN);
  });

  it("颜色面板在下方布局时不会超出底部", () => {
    const position = getColorPickerPosition(
      {
        x: 160,
        y: viewport.height - OVERLAY_SAFE_MARGIN - TOOLBAR_HEIGHT,
        placement: "below",
      },
      viewport,
    );

    expect(position.y).toBe(
      viewport.height - OVERLAY_SAFE_MARGIN - COLOR_PICKER_HEIGHT,
    );
  });

  it("仅接受有可见面积的矩形", () => {
    expect(isUsableRect(createRect())).toBe(true);
    expect(
      isUsableRect(createRect({ width: 0, height: 0, right: 0, bottom: 0 })),
    ).toBe(false);
    expect(isUsableRect(null)).toBe(false);
  });
});

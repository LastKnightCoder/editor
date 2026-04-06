export type ToolbarPlacement = "above" | "below";

export interface OverlayViewport {
  width: number;
  height: number;
}

export interface OverlayPoint {
  x: number;
  y: number;
}

export interface ToolbarOverlayPosition extends OverlayPoint {
  placement: ToolbarPlacement;
}

export const TOOLBAR_ANCHOR_OFFSET = 10;
export const TOOLBAR_HEIGHT = 40;
export const COLOR_PICKER_HEIGHT = 34;
export const COLOR_PICKER_GAP = 8;
export const OVERLAY_SAFE_MARGIN = 12;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const hasFiniteRectValue = (value: number) => Number.isFinite(value);

export function isUsableRect(
  rect: DOMRect | null | undefined,
): rect is DOMRect {
  if (!rect) return false;

  const values = [
    rect.left,
    rect.top,
    rect.right,
    rect.bottom,
    rect.width,
    rect.height,
  ];
  if (!values.every(hasFiniteRectValue)) {
    return false;
  }

  return rect.width > 0 || rect.height > 0;
}

export function getToolbarPosition(
  rect: DOMRect,
  viewport: OverlayViewport,
): ToolbarOverlayPosition {
  const x = clamp(
    rect.left + rect.width / 2,
    OVERLAY_SAFE_MARGIN,
    viewport.width - OVERLAY_SAFE_MARGIN,
  );

  const preferredAboveY = rect.top - TOOLBAR_ANCHOR_OFFSET;
  const minVisibleAboveY = OVERLAY_SAFE_MARGIN + TOOLBAR_HEIGHT;
  if (preferredAboveY >= minVisibleAboveY) {
    return {
      x,
      y: preferredAboveY,
      placement: "above",
    };
  }

  const belowY = clamp(
    rect.bottom + TOOLBAR_ANCHOR_OFFSET,
    OVERLAY_SAFE_MARGIN,
    viewport.height - OVERLAY_SAFE_MARGIN - TOOLBAR_HEIGHT,
  );

  return {
    x,
    y: belowY,
    placement: "below",
  };
}

export function getColorPickerPosition(
  toolbar: ToolbarOverlayPosition,
  viewport: OverlayViewport,
): OverlayPoint {
  const preferredY =
    toolbar.placement === "above"
      ? toolbar.y - TOOLBAR_HEIGHT - COLOR_PICKER_HEIGHT - COLOR_PICKER_GAP
      : toolbar.y + TOOLBAR_HEIGHT + COLOR_PICKER_GAP;

  return {
    x: clamp(
      toolbar.x,
      OVERLAY_SAFE_MARGIN,
      viewport.width - OVERLAY_SAFE_MARGIN,
    ),
    y: clamp(
      preferredY,
      OVERLAY_SAFE_MARGIN,
      viewport.height - OVERLAY_SAFE_MARGIN - COLOR_PICKER_HEIGHT,
    ),
  };
}

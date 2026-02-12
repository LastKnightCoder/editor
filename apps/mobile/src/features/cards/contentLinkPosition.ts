export type ContentLinkPopoverPlacement = "top" | "bottom";

export type CalculateContentLinkPositionInput = {
  anchorRect: {
    top: number;
    bottom: number;
    left: number;
    width: number;
  };
  viewportWidth: number;
  viewportHeight: number;
  popoverWidth: number;
  popoverHeight: number;
  gap?: number;
};

export type ContentLinkPopoverPosition = {
  top: number;
  left: number;
  placement: ContentLinkPopoverPlacement;
};

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function calculateContentLinkPopoverPosition(
  input: CalculateContentLinkPositionInput,
): ContentLinkPopoverPosition {
  const {
    anchorRect,
    viewportWidth,
    viewportHeight,
    popoverWidth,
    popoverHeight,
    gap = 8,
  } = input;

  const availableBelow = viewportHeight - anchorRect.bottom - gap;
  const availableAbove = anchorRect.top - gap;
  const placeOnTop =
    availableBelow < popoverHeight && availableAbove > availableBelow;
  const placement: ContentLinkPopoverPlacement = placeOnTop ? "top" : "bottom";

  let top = placeOnTop
    ? anchorRect.top - popoverHeight - gap
    : anchorRect.bottom + gap;
  top = clamp(top, gap, Math.max(gap, viewportHeight - popoverHeight - gap));

  let left = anchorRect.left + anchorRect.width / 2 - popoverWidth / 2;
  left = clamp(left, gap, Math.max(gap, viewportWidth - popoverWidth - gap));

  return {
    top: Math.round(top),
    left: Math.round(left),
    placement,
  };
}

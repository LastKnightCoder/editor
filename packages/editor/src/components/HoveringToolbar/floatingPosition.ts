export type FloatingPlacement = "top" | "bottom";

export type FloatingAnchorRect = {
  top: number;
  bottom: number;
  left: number;
  width: number;
};

export type CalculateFloatingPositionInput = {
  anchorRect: FloatingAnchorRect;
  viewportWidth: number;
  viewportHeight: number;
  floatingWidth: number;
  floatingHeight: number;
  gap?: number;
  preferredPlacement?: FloatingPlacement;
};

export type FloatingPosition = {
  top: number;
  left: number;
  placement: FloatingPlacement;
};

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function calculateFloatingPosition(
  input: CalculateFloatingPositionInput,
): FloatingPosition {
  const {
    anchorRect,
    viewportWidth,
    viewportHeight,
    floatingWidth,
    floatingHeight,
    gap = 8,
    preferredPlacement = "bottom",
  } = input;

  const availableBelow = viewportHeight - anchorRect.bottom - gap;
  const availableAbove = anchorRect.top - gap;

  const placeOnTop =
    preferredPlacement === "top"
      ? availableAbove >= floatingHeight || availableAbove > availableBelow
      : availableBelow < floatingHeight && availableAbove > availableBelow;

  const placement: FloatingPlacement = placeOnTop ? "top" : "bottom";

  let top = placeOnTop
    ? anchorRect.top - floatingHeight - gap
    : anchorRect.bottom + gap;
  top = clamp(top, gap, Math.max(gap, viewportHeight - floatingHeight - gap));

  let left = anchorRect.left + anchorRect.width / 2 - floatingWidth / 2;
  left = clamp(left, gap, Math.max(gap, viewportWidth - floatingWidth - gap));

  return {
    top: Math.round(top),
    left: Math.round(left),
    placement,
  };
}

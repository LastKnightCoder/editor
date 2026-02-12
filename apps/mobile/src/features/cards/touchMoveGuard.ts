export const TOUCHMOVE_ALLOW_SELECTOR = '[data-allow-touchmove="true"]';

export function shouldPreventBackgroundTouchMove(params: {
  target: EventTarget | null;
  sheet: HTMLElement | null;
}): boolean {
  const { target, sheet } = params;
  if (!(target instanceof Node)) return false;
  if (sheet?.contains(target)) return false;
  if (target instanceof Element && target.closest(TOUCHMOVE_ALLOW_SELECTOR)) {
    return false;
  }
  return true;
}

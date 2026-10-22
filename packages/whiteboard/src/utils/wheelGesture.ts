import { isCanvasOverlayEvent } from "./events";

const scrollAreas = new WeakSet<HTMLElement>();
const GESTURE_IDLE_MS = 200;

export function registerWheelScrollArea(element: HTMLElement) {
  scrollAreas.add(element);
  return () => {
    scrollAreas.delete(element);
  };
}

/** wheel 没有标准结束事件，以连续事件间的空闲时间划分手势。 */
export function createWheelGestureHandler(
  container: HTMLElement,
  onCanvasWheel: (event: WheelEvent) => void
) {
  let owner: HTMLElement | null = null;
  let lastTime = -Infinity;

  return (event: WheelEvent) => {
    if (isCanvasOverlayEvent(event)) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("[data-whiteboard-root]") !== container) return;

    if (event.ctrlKey) {
      lastTime = -Infinity;
      owner = null;
      onCanvasWheel(event);
      return;
    }
    if (event.deltaX === 0 && event.deltaY === 0) return;

    const now = Date.now();
    if (
      now - lastTime > GESTURE_IDLE_MS ||
      (owner && (!container.contains(owner) || !scrollAreas.has(owner)))
    ) {
      owner = null;
      for (
        let element: Element | null = target;
        element && element !== container;
        element = element.parentElement
      ) {
        if (element instanceof HTMLElement && scrollAreas.has(element)) {
          owner = element;
          break;
        }
      }
    }
    lastTime = now;

    if (!owner) {
      onCanvasWheel(event);
      return;
    }

    if (target && owner.contains(target)) return;

    // 指针离开起始正文时，仍将本轮位移交给原正文，避免滚动画布或另一张卡片。
    event.stopPropagation();
    event.preventDefault();
    const unitX = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? owner.clientWidth : 1;
    const unitY = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? owner.clientHeight : 1;
    owner.scrollLeft += event.deltaX * unitX;
    owner.scrollTop += event.deltaY * unitY;
  };
}

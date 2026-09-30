type Box = { top: number; left: number; width?: number; height: number };

/**
 * 同一设备的其他视图（被沉浸层盖住的正文、另一个窗口）不算协作者：
 * 与成员列表「其他人排除本机设备」同一口径。旧数据没有设备 id 时照常显示。
 */
export function isOwnDevice(cursorUserId: string | undefined, localUserId: string | undefined) {
  return Boolean(cursorUserId && localUserId && cursorUserId === localUserId);
}

/**
 * 光标位置由屏幕矩形相减得到（屏幕像素），而光标层画在容器内部：
 * 容器（或祖先）有 CSS zoom 时 CSS 长度会再被放大一次，须除以容器的实际缩放。
 */
export function toContainerSpace<T extends Box>(box: T, zoom: number): T {
  if (!zoom || zoom === 1) return box;
  return {
    ...box,
    top: box.top / zoom,
    left: box.left / zoom,
    height: box.height / zoom,
    ...(box.width === undefined ? null : { width: box.width / zoom }),
  };
}

/** 元素的实际 CSS 缩放（含祖先 zoom）；不支持 currentCSSZoom 的环境按 1 */
export function effectiveZoom(element: Element | null | undefined) {
  return (element as (Element & { currentCSSZoom?: number }) | null)?.currentCSSZoom || 1;
}

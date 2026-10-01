/** 定位到某个元素后短暂描边提示；类名写成静态串，Tailwind 才能生成 */
const FLASH_CLASSES = ["ring-2", "ring-accent", "ring-offset-2", "ring-offset-surface"];

export function scrollToAndFlash(el: Element, durationMs = 1600): void {
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add(...FLASH_CLASSES);
  window.setTimeout(() => el.classList.remove(...FLASH_CLASSES), durationMs);
}

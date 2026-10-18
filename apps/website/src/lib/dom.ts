/** 页面内 SVG 雪碧图里的图标（<symbol id="i-*">，定义在 index.html 顶部） */
export const icon = (id: string, style = "") =>
  `<svg class="i"${style ? ` style="${style}"` : ""}><use href="#i-${id}"/></svg>`;

export const ICON_SRC = "/tau-icon.png";

export const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 必须存在的节点：缺失说明 index.html 与脚本不同步，直接抛错 */
export function mustQuery<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document
): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`找不到节点：${selector}`);
  return el;
}

export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

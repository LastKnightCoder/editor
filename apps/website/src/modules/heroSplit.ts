/** 首屏示意窗口：复制一份深色窗口叠在上面，沿固定斜线裁切，同时展示浅色与深色 */
import { mustQuery } from "../lib/dom.ts";

const SLASH = { top: 64, bottom: 36 };

/** 必须在 initTheme 之前调用，让深色副本也带上 data-follow 跟随主题 */
export function initHeroSplit() {
  const split = mustQuery(".split");
  const lightApp = mustQuery(".app", split);
  const darkApp = lightApp.cloneNode(true) as HTMLElement;
  darkApp.dataset.mode = "dark";
  darkApp.classList.add("is-dark");
  darkApp.setAttribute("aria-hidden", "true");
  lightApp.after(darkApp);

  split.style.setProperty("--top", `${SLASH.top}%`);
  split.style.setProperty("--bottom", `${SLASH.bottom}%`);
  split.querySelectorAll(".slash line").forEach(line => {
    line.setAttribute("x1", `${SLASH.top}%`);
    line.setAttribute("x2", `${SLASH.bottom}%`);
  });
}

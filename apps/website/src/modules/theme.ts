/**
 * 站点主题：主题族与名称来自 @tau/themes（与应用同一套），切换只改带 data-follow 的
 * 元素的 data-theme；明暗由各元素自己的 data-mode 决定。
 */
import { listThemes } from "@tau/themes";
import { mustQuery } from "../lib/dom.ts";

export const THEME_STORAGE_KEY = "tau-site-theme";

export function applyTheme(key: string) {
  document.querySelectorAll<HTMLElement>("[data-follow]").forEach(el => (el.dataset.theme = key));
  document
    .querySelectorAll<HTMLElement>("[data-theme-pick]")
    .forEach(el => el.setAttribute("aria-pressed", String(el.dataset.themePick === key)));
  try {
    localStorage.setItem(THEME_STORAGE_KEY, key);
  } catch {
    // 隐私模式下无法持久化，只影响下次打开的默认主题
  }
}

function savedTheme(keys: string[]) {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved && keys.includes(saved) ? saved : null;
  } catch {
    return null;
  }
}

/** 色点：左上半是该主题浅色的强调色，右下半是深色的页面底色 */
function renderSwatches() {
  mustQuery(".swatches").innerHTML = listThemes()
    .map(
      t => `<button class="swatch" data-theme-pick="${t.key}" title="${t.name}" aria-label="切换到${t.name}主题">
        <i data-theme="${t.key}" data-mode="light"></i><i data-theme="${t.key}" data-mode="dark"></i>
      </button>`
    )
    .join("");
}

export function initTheme() {
  renderSwatches();
  document.addEventListener("click", e => {
    const pick = (e.target as Element).closest<HTMLElement>("[data-theme-pick]");
    if (pick?.dataset.themePick) applyTheme(pick.dataset.themePick);
  });
  const keys = listThemes().map(t => t.key);
  applyTheme(savedTheme(keys) ?? keys[0]);
}

/**
 * 滚动条自动隐藏 —— 事件委托驱动，AppShell 初始化一次、全局滚动区生效。
 *
 * 为什么不用纯 CSS（.app *:hover::-webkit-scrollbar-thumb）：Chromium 的滚动条
 * 伪元素不随 :hover 常规重算，显形后可能冻结不消失。改为 mouseover/scroll/mouseout
 * 事件给活跃滚动容器切换 scrollbar-live 类（base.css 消费），行为 =
 * hover 或滚动中显形、停止滚动 700ms 且鼠标不在时隐藏、移出窗口立即隐藏。
 */

const HIDE_DELAY_MS = 700;
const LIVE_CLASS = "scrollbar-live";

export function initScrollbarAutoHide(): void {
  if (document.documentElement.dataset.scrollbarAutoHide) return;
  document.documentElement.dataset.scrollbarAutoHide = "1";

  let live: Element | null = null;
  let timer: number | undefined;

  const show = (el: Element) => {
    window.clearTimeout(timer);
    if (live === el) return;
    live?.classList.remove(LIVE_CLASS);
    live = el;
    el.classList.add(LIVE_CLASS);
  };

  const hideNow = () => {
    window.clearTimeout(timer);
    live?.classList.remove(LIVE_CLASS);
    live = null;
  };

  const scheduleHide = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      // 鼠标仍悬停在容器上则保持显示（matches 实时查询不受重绘冻结影响）
      if (live?.matches(":hover")) return;
      hideNow();
    }, HIDE_DELAY_MS);
  };

  /** 从事件目标向上找最近的可滚祖先（含自身） */
  const findScrollable = (from: Element | null): Element | null => {
    for (let el = from; el && el !== document.documentElement; el = el.parentElement) {
      const { overflowY } = getComputedStyle(el);
      if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) {
        return el;
      }
    }
    return null;
  };

  document.addEventListener("mouseover", e => {
    const el = findScrollable(e.target as Element | null);
    if (el) show(el);
    else if (live) scheduleHide(); // 移入非滚动区，计时隐藏
  });

  // scroll 不冒泡，capture 捕获所有内部滚动（含键盘滚动）
  document.addEventListener(
    "scroll",
    e => {
      if (e.target instanceof Element && e.target !== document.documentElement) {
        show(e.target);
        scheduleHide();
      }
    },
    true
  );

  // relatedTarget 为 null = 鼠标移出窗口，立即隐藏（避免 hover 状态冻结）
  document.addEventListener("mouseout", e => {
    if (!e.relatedTarget && live) hideNow();
  });
}

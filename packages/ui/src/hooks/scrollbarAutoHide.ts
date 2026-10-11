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

const runtimes = new WeakMap<Document, { users: number; dispose: () => void }>();

export function initScrollbarAutoHide(owner: Document = document): () => void {
  const existing = runtimes.get(owner);
  if (existing) {
    existing.users++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        if (--existing.users === 0) existing.dispose();
      }
    };
  }
  const abort = new AbortController();
  const runtime = {
    users: 1,
    dispose: () => {
      if (hoverRaf) cancelAnimationFrame(hoverRaf);
      abort.abort();
      hideNow();
      runtimes.delete(owner);
    },
  };
  runtimes.set(owner, runtime);

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

  /** 从事件目标向上找最近的可滚祖先（含自身）：纵向或横向可滚都算——横向滚动条同样
   *  hover 才显形，不识别横向会让无触控板的用户找不到可拖的滚动条。
   *  结果按起始元素缓存：解析要对祖先链逐层读 getComputedStyle 与 scrollHeight/clientHeight
   * （强制布局读取，画布等每帧写 DOM 的页面里单次可达百 ms），同元素链只解析一次；
   * 容器后续变得可滚的场景由 scroll 事件路径兜底（直接 show，不走这里） */
  const scrollAncestorCache = new WeakMap<Element, Element | null>();
  const findScrollable = (from: Element | null): Element | null => {
    if (!from) return null;
    const cached = scrollAncestorCache.get(from);
    if (cached !== undefined) return cached;
    const scrolls = (overflow: string) => overflow === "auto" || overflow === "scroll";
    let found: Element | null = null;
    for (
      let el: Element | null = from;
      el && el !== document.documentElement;
      el = el.parentElement
    ) {
      const { overflowX, overflowY } = getComputedStyle(el);
      if (
        (scrolls(overflowY) && el.scrollHeight > el.clientHeight) ||
        (scrolls(overflowX) && el.scrollWidth > el.clientWidth)
      ) {
        found = el;
        break;
      }
    }
    scrollAncestorCache.set(from, found);
    return found;
  };

  // mouseover 高频（指针划过密集元素时每帧多次），合帧到每帧至多一次、取最新目标
  let hoverRaf = 0;
  let latestHoverTarget: Element | null = null;
  const handleHover = (e: Event) => {
    latestHoverTarget = e.target as Element | null;
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      const el = findScrollable(latestHoverTarget);
      if (el) show(el);
      else if (live) scheduleHide(); // 移入非滚动区，计时隐藏
    });
  };

  owner.addEventListener("mouseover", handleHover, { signal: abort.signal });

  // scroll 不冒泡，capture 捕获所有内部滚动（含键盘滚动）
  owner.addEventListener(
    "scroll",
    e => {
      if (e.target instanceof Element && e.target !== document.documentElement) {
        show(e.target);
        scheduleHide();
      }
    },
    { capture: true, signal: abort.signal }
  );

  // relatedTarget 为 null = 鼠标移出窗口，立即隐藏（避免 hover 状态冻结）
  owner.addEventListener(
    "mouseout",
    e => {
      if (!e.relatedTarget && live) hideNow();
    },
    { signal: abort.signal }
  );
  let released = false;
  return () => {
    if (!released) {
      released = true;
      if (--runtime.users === 0) runtime.dispose();
    }
  };
}

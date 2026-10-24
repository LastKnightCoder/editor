import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@tau/ui";

/** 单次滚动增量超过该值才切换收起 / 展开，避免惯性尾巴来回抖动 */
const SCROLL_DELTA = 6;
/** 离顶部不足该距离时总是展开 */
const TOP_ZONE = 24;
/** 正文末尾距按钮顶边不足该距离即视为会被遮住 */
const FAB_GAP = 8;
/** 正文末尾进入可视区前该距离就开始淡出，滚到底时按钮已经让开 */
const END_LEAD = 24;

type ReadingModeFabProps = {
  /** 阅读态且可编辑、且没有块选择 / 标注条等底部浮层时为 true */
  visible: boolean;
  /** 在 click 中同步调用（iOS 手势内聚焦才弹键盘） */
  onEnter: () => void;
  /**
   * 正文滚动容器：下滑收起为圆形图标，上滑或回到顶部时展开；
   * 末尾（最后一个子元素的底边）滚进按钮区域时按钮淡出，正文末尾不为按钮额外留白
   */
  getScrollContainer: () => HTMLElement | null;
};

/** 阅读态右下角的「编辑」悬浮按钮；编辑态由配件栏右端的「完成」退出 */
export function ReadingModeFab(props: ReadingModeFabProps) {
  const { visible, onEnter, getScrollContainer } = props;
  const [collapsed, setCollapsed] = useState(false);
  const [nearEnd, setNearEnd] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!visible) {
      setNearEnd(false);
      return;
    }
    const scroll = getScrollContainer();
    if (!scroll) return;
    // 只按位置判断、不随淡出改变按钮几何（仅改透明度），避免显隐来回切换
    const updateNearEnd = () => {
      const end = scroll.lastElementChild;
      const button = buttonRef.current;
      if (!end || !button) return;
      const contentBottom = end.getBoundingClientRect().bottom;
      const viewportBottom = scroll.getBoundingClientRect().bottom;
      const fabTop = button.getBoundingClientRect().top;
      setNearEnd(contentBottom > fabTop - FAB_GAP && contentBottom < viewportBottom + END_LEAD);
    };
    let last = scroll.scrollTop;
    const handleScroll = () => {
      const top = scroll.scrollTop;
      const delta = top - last;
      if (top < TOP_ZONE) setCollapsed(false);
      else if (delta > SCROLL_DELTA) setCollapsed(true);
      else if (delta < -SCROLL_DELTA) setCollapsed(false);
      if (top < TOP_ZONE || Math.abs(delta) > SCROLL_DELTA) last = top;
      updateNearEnd();
    };
    updateNearEnd();
    scroll.addEventListener("scroll", handleScroll, { passive: true });
    // 图片加载、内容刷新会改变末尾位置
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateNearEnd);
    observer?.observe(scroll);
    if (scroll.lastElementChild) observer?.observe(scroll.lastElementChild);
    return () => {
      scroll.removeEventListener("scroll", handleScroll);
      observer?.disconnect();
    };
  }, [getScrollContainer, visible]);

  if (!visible) return null;

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label="编辑"
      aria-hidden={nearEnd}
      tabIndex={nearEnd ? -1 : undefined}
      onClick={onEnter}
      className={cn(
        "bg-accent text-ink-inverse shadow-lift absolute bottom-[calc(var(--mobile-safe-bottom)+20px)] right-5 z-20 flex h-[50px] items-center justify-center rounded-full text-[15px] font-bold transition-[padding,transform,opacity] duration-200 active:scale-95",
        collapsed ? "w-[50px]" : "gap-1.5 pl-4 pr-[18px]",
        nearEnd && "pointer-events-none opacity-0"
      )}
    >
      <Pencil size={17} strokeWidth={2.4} aria-hidden />
      {collapsed ? null : <span>编辑</span>}
    </button>
  );
}

export default ReadingModeFab;

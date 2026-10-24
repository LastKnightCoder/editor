import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@tau/ui";

/** 按钮高度 50 + 距底 20：正文末尾按此让出，滚到底时最后一行不被遮住 */
const FAB_OCCLUSION = 70;
const OCCLUSION_VAR = "--mobile-editor-toolbar-occlusion";
/** 单次滚动增量超过该值才切换收起 / 展开，避免惯性尾巴来回抖动 */
const SCROLL_DELTA = 6;
/** 离顶部不足该距离时总是展开 */
const TOP_ZONE = 24;

type ReadingModeFabProps = {
  /** 阅读态且可编辑、且没有块选择 / 标注条等底部浮层时为 true */
  visible: boolean;
  /** 在 click 中同步调用（iOS 手势内聚焦才弹键盘） */
  onEnter: () => void;
  /** 正文滚动容器：下滑收起为圆形图标，上滑或回到顶部时展开 */
  getScrollContainer: () => HTMLElement | null;
};

/** 阅读态右下角的「编辑」悬浮按钮；编辑态由配件栏右端的「完成」退出 */
export function ReadingModeFab(props: ReadingModeFabProps) {
  const { visible, onEnter, getScrollContainer } = props;
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const scroll = getScrollContainer();
    if (!scroll) return;
    let last = scroll.scrollTop;
    const handleScroll = () => {
      const top = scroll.scrollTop;
      const delta = top - last;
      if (top < TOP_ZONE) setCollapsed(false);
      else if (delta > SCROLL_DELTA) setCollapsed(true);
      else if (delta < -SCROLL_DELTA) setCollapsed(false);
      else return;
      last = top;
    };
    scroll.addEventListener("scroll", handleScroll, { passive: true });
    return () => scroll.removeEventListener("scroll", handleScroll);
  }, [getScrollContainer, visible]);

  useEffect(() => {
    if (!visible) return;
    const root = document.documentElement;
    root.style.setProperty(OCCLUSION_VAR, `${FAB_OCCLUSION}px`);
    return () => {
      root.style.removeProperty(OCCLUSION_VAR);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="编辑"
      onClick={onEnter}
      className={cn(
        "bg-accent text-ink-inverse shadow-lift absolute bottom-[calc(var(--mobile-safe-bottom)+20px)] right-5 z-20 flex h-[50px] items-center justify-center rounded-full text-[15px] font-bold transition-[padding,transform] duration-200 active:scale-95",
        collapsed ? "w-[50px]" : "gap-1.5 pl-4 pr-[18px]"
      )}
    >
      <Pencil size={17} strokeWidth={2.4} aria-hidden />
      {collapsed ? null : <span>编辑</span>}
    </button>
  );
}

export default ReadingModeFab;

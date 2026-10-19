import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useReadOnly } from "slate-react";
import { Plus } from "lucide-react";

import type { ITabItem } from "../../types";
import { If } from "@tau/shared";
import TabTitle from "../TabTitle";

interface ITabsHeaderProps {
  tabs: ITabItem[];
  activeKey: string;
  onClickTab: (key: string) => void;
  onDeleteTab: (key: string) => void;
  onAddTab: () => void;
  onTitleChange: (key: string, title: string) => void;
  onMoveTab: (fromKey: string, insertAt: number) => void;
}

type FadeEdge = "none" | "left" | "right" | "both";

const FADE_WIDTH = "36px";

// mask 只取 alpha 通道，黑色即「完全可见」，与主题色无关
const FADE_MASKS: Record<FadeEdge, string | undefined> = {
  none: undefined,
  left: `linear-gradient(to right, transparent, #000 ${FADE_WIDTH})`,
  right: `linear-gradient(to right, #000 calc(100% - ${FADE_WIDTH}), transparent)`,
  both: `linear-gradient(to right, transparent, #000 ${FADE_WIDTH}, #000 calc(100% - ${FADE_WIDTH}), transparent)`,
};

const getFadeEdge = (node: HTMLElement): FadeEdge => {
  const maxScroll = node.scrollWidth - node.clientWidth;
  const left = node.scrollLeft > 1;
  const right = node.scrollLeft < maxScroll - 1;
  if (left && right) return "both";
  if (left) return "left";
  if (right) return "right";
  return "none";
};

const TabsHeader = (props: ITabsHeaderProps) => {
  const { tabs, activeKey, onAddTab, onClickTab, onDeleteTab, onTitleChange, onMoveTab } = props;
  const readOnly = useReadOnly();
  // 拖拽插入指示：在 index 号 Tab 的左/右两侧
  const [dropHint, setDropHint] = useState<{ index: number; before: boolean } | null>(null);
  const [fadeEdge, setFadeEdge] = useState<FadeEdge>("none");
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleReorder = (fromKey: string, toIndex: number, before: boolean) => {
    setDropHint(null);
    onMoveTab(fromKey, before ? toIndex : toIndex + 1);
  };

  // 被裁一侧渐隐，提示还有未显示的标签
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const update = () => setFadeEdge(getFadeEdge(node));
    update();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(node);
    node.addEventListener("scroll", update, { passive: true });
    return () => {
      observer?.disconnect();
      node.removeEventListener("scroll", update);
    };
  }, [tabs.length]);

  // 纵向滚轮转横向；需要 preventDefault，只能用非 passive 的原生监听
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      if (node.scrollWidth <= node.clientWidth) return;
      event.preventDefault();
      node.scrollLeft += event.deltaY;
    };
    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => node.removeEventListener("wheel", handleWheel);
  }, []);

  // 激活项滚入可视区；只改容器 scrollLeft，不用 scrollIntoView，避免带动文档纵向滚动
  useLayoutEffect(() => {
    const node = scrollRef.current;
    const activeTab = Array.from(node?.children ?? []).find(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child.dataset.tabKey === activeKey
    );
    if (!node || !activeTab) return;
    const start = activeTab.offsetLeft;
    const end = start + activeTab.offsetWidth;
    if (start < node.scrollLeft) {
      node.scrollLeft = start;
    } else if (end > node.scrollLeft + node.clientWidth) {
      node.scrollLeft = end - node.clientWidth;
    }
  }, [activeKey]);

  const maskImage = FADE_MASKS[fadeEdge];
  const scrollStyle: CSSProperties | undefined = maskImage
    ? { maskImage, WebkitMaskImage: maskImage }
    : undefined;

  return (
    <div
      contentEditable={false}
      className="flex h-[42px] items-stretch gap-2.5 pl-4 pr-2 shadow-[inset_0_-1px_0_var(--ed-border)]"
    >
      <div
        ref={scrollRef}
        role="tablist"
        style={scrollStyle}
        className="relative flex min-w-0 flex-1 items-stretch gap-[22px] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab, index) => (
          <TabTitle
            key={tab.key}
            tab={tab}
            index={index}
            activeKey={activeKey}
            dropBefore={dropHint?.index === index && dropHint.before}
            dropAfter={dropHint?.index === index && !dropHint.before}
            onHoverDrop={setDropHint}
            onReorder={handleReorder}
            onClickTab={onClickTab}
            onDeleteTab={onDeleteTab}
            onTitleChange={onTitleChange}
          />
        ))}
      </div>
      <If condition={!readOnly}>
        <button
          aria-label="添加标签"
          title="添加标签"
          onClick={onAddTab}
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center self-center rounded-[7px] border-0 bg-transparent p-0 text-[var(--ed-text-tertiary)] transition-colors duration-200 hover:bg-[var(--ed-bg-hover)] hover:text-[var(--ed-text)]"
        >
          <Plus size={15} />
        </button>
      </If>
    </div>
  );
};

export default TabsHeader;

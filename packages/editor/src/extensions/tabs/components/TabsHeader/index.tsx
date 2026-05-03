import { useLayoutEffect, useRef } from "react";
import { useReadOnly } from "slate-react";
import { PlusOutlined } from "@ant-design/icons";

import { ITabsContent } from "../../../types";
import { If } from "@tau/shared";
import TabTitle from "../TabTitle";

interface ITabsHeaderProps {
  tabs: ITabsContent[];
  activeKey: string;
  onClickTab: (key: string) => void;
  onDeleteTab: (key: string) => void;
  onAddTab: () => void;
  onTitleChange: (key: string, title: string) => void;
}

const posCache = new Map<string, { left: number; width: number }>();

const TabsHeader = (props: ITabsHeaderProps) => {
  const { tabs, activeKey, onAddTab, onClickTab, onDeleteTab, onTitleChange } =
    props;
  const readOnly = useReadOnly();
  const containerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const cacheKey = tabs.map((t) => t.key).join(",");

  useLayoutEffect(() => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    if (!container || !indicator) return;
    const el = container.querySelector(
      `[data-tab-key="${activeKey}"]`,
    ) as HTMLElement;
    if (!el) return;

    const next = { left: el.offsetLeft, width: el.offsetWidth };
    const prev = posCache.get(cacheKey);

    if (prev && (prev.left !== next.left || prev.width !== next.width)) {
      indicator.style.transition = "none";
      indicator.style.left = prev.left + "px";
      indicator.style.width = prev.width + "px";
      indicator.getBoundingClientRect();
      indicator.style.transition = "left 220ms ease, width 220ms ease";
    } else {
      indicator.style.transition = "none";
    }

    indicator.style.left = next.left + "px";
    indicator.style.width = next.width + "px";
    posCache.set(cacheKey, next);
  }, [activeKey, tabs, cacheKey]);

  return (
    <div
      ref={containerRef}
      contentEditable={false}
      className="relative flex items-center gap-0.5 overflow-x-auto scrollbar-hide border-b border-zinc-200/70 dark:border-zinc-700/40 bg-zinc-50/60 dark:bg-zinc-800/20 px-3 pt-1"
    >
      {tabs.map((tab) => (
        <TabTitle
          key={tab.key}
          tab={tab}
          activeKey={activeKey}
          onClickTab={onClickTab}
          onDeleteTab={onDeleteTab}
          onTitleChange={onTitleChange}
        />
      ))}
      <If condition={!readOnly}>
        <button
          onClick={onAddTab}
          className="flex h-[1.5em] w-[1.5em] shrink-0 items-center justify-center rounded text-zinc-300 transition-colors hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400"
        >
          <PlusOutlined className="text-sm" />
        </button>
      </If>
      <div
        ref={indicatorRef}
        className="absolute bottom-0 h-[0.125em] rounded-full bg-zinc-600 dark:bg-zinc-400"
      />
    </div>
  );
};

export default TabsHeader;

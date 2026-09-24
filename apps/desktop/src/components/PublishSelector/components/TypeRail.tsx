import { memo } from "react";
import clsx from "clsx";
import { PublishContentType } from "@/types/publish";
import { TabConfig } from "../types";

/** 各类型图标色块（柔和标签色） */
const TYPE_TILE: Record<PublishContentType, string> = {
  card: "bg-tag-1-soft text-tag-1",
  article: "bg-tag-2-soft text-tag-2",
  quest: "bg-tag-3-soft text-tag-3",
  project: "bg-tag-4-soft text-tag-4",
  document: "bg-tag-5-soft text-tag-5",
};

interface TypeRailProps {
  tabs: TabConfig[];
  activeTab: PublishContentType;
  onTabChange: (tab: PublishContentType) => void;
  totalSelected: number;
  getSelectedCount: (type: PublishContentType) => number;
  getTotalCount: (type: PublishContentType) => number;
}

export const TypeRail = memo<TypeRailProps>(
  ({ tabs, activeTab, onTabChange, totalSelected, getSelectedCount, getTotalCount }) => {
    return (
      <nav className="flex w-[204px] shrink-0 flex-col gap-0.5 py-3.5 pl-3 pr-1.5">
        <div className="flex items-baseline gap-2 px-2 pb-2.5 pt-0.5">
          <span className="text-ink-1 text-[13px] font-semibold">发布内容</span>
          <span className="text-ink-3 font-mono text-[11px] tabular-nums">{totalSelected} 项</span>
        </div>

        {tabs.map(tab => {
          const active = tab.key === activeTab;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "flex items-center gap-2.5 rounded-[10px] px-[9px] py-2 text-left transition-colors",
                active ? "bg-selected" : "hover:bg-hover"
              )}
            >
              <span
                className={clsx(
                  "grid size-[26px] shrink-0 place-items-center rounded-[8px]",
                  TYPE_TILE[tab.key]
                )}
              >
                <Icon size={14} strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={clsx(
                    "block truncate text-[13px]",
                    active ? "text-accent-text font-semibold" : "text-ink-1 font-medium"
                  )}
                >
                  {tab.label}
                </span>
                <span className="text-ink-3 block truncate text-[11px]">{tab.description}</span>
              </span>
              <span className="text-ink-2 shrink-0 font-mono text-[11.5px] font-medium tabular-nums">
                {getSelectedCount(tab.key)}
                <span className="text-ink-3">/{getTotalCount(tab.key)}</span>
              </span>
            </button>
          );
        })}

        <div className="text-ink-3 mt-auto px-2 pb-0.5 pt-2.5 text-[11.5px] leading-[1.7]">
          勾选即保存，下次打开保持
        </div>
      </nav>
    );
  }
);

TypeRail.displayName = "TypeRail";

import { Tooltip } from "antd";
import type { TabType } from "../../../utils/types";

interface TabBarProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  onAllNotesClick: () => void;
  /** 当前页高亮数量，用于在「高亮」Tab 上展示徽标 */
  highlightCount?: number;
}

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  {
    id: "overview",
    label: "概览",
    icon: (
      <svg
        className="h-[18px] w-[18px]"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z"
        />
      </svg>
    ),
  },
  {
    id: "chat",
    label: "聊天",
    icon: (
      <svg
        className="h-[18px] w-[18px]"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
        />
      </svg>
    ),
  },
  {
    id: "notes",
    label: "笔记",
    icon: (
      <svg
        className="h-[18px] w-[18px]"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
        />
      </svg>
    ),
  },
  {
    id: "highlights",
    label: "高亮",
    icon: (
      <svg
        className="h-[18px] w-[18px]"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243-1.59-1.591"
        />
      </svg>
    ),
  },
];

export default function TabBar({
  currentTab,
  onTabChange,
  onAllNotesClick,
  highlightCount = 0,
}: TabBarProps) {
  return (
    <nav className="flex shrink-0 items-center gap-1.5 px-3 py-2">
      {TABS.map((tab) => {
        const isActive = currentTab === tab.id;
        const showBadge = tab.id === "highlights" && highlightCount > 0;
        return (
          <Tooltip key={tab.id} title={tab.label} placement="top">
            <button
              onClick={() => onTabChange(tab.id)}
              className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors before:absolute before:inset-x-2.5 before:top-0 before:h-[2px] before:rounded-full before:transition-opacity before:content-[""] ${
                isActive
                  ? "bg-[var(--sb-tab-active-bg)] text-[var(--sb-tab-active-text)] before:bg-[var(--sb-tab-indicator)] before:opacity-100"
                  : "text-gray-500 hover:bg-[var(--sb-tab-hover-bg)] hover:text-gray-700 before:opacity-0 dark:text-[#6e7681] dark:hover:text-[#adbac7]"
              }`}
            >
              {tab.icon}
              {showBadge && (
                <span className="absolute right-0.5 top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-[var(--sb-tab-badge-bg)] px-1 text-[10px] font-semibold leading-[16px] text-[var(--sb-tab-badge-text)]">
                  {highlightCount > 9 ? "9+" : highlightCount}
                </span>
              )}
            </button>
          </Tooltip>
        );
      })}

      {/* 弹性间隔，将全部笔记按钮推到右侧 */}
      <div className="flex-1" />

      {/* 全部笔记按钮 */}
      <Tooltip title="全部笔记" placement="top">
        <button
          onClick={onAllNotesClick}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-[var(--sb-tab-hover-bg)] hover:text-gray-700 dark:text-[#6e7681] dark:hover:text-[#adbac7]"
        >
          <svg
            className="h-[18px] w-[18px]"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
            />
          </svg>
        </button>
      </Tooltip>
    </nav>
  );
}

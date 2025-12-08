import { useState } from "react";
import classNames from "classnames";
import PageStyleTab from "./PageStyleTab";
import TransitionTab from "./TransitionTab";

interface InspectorPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

type TabKey = "style" | "transition";

const tabs: { key: TabKey; label: string }[] = [
  { key: "style", label: "样式" },
  { key: "transition", label: "过渡" },
];

// 无边框设计
const cls = {
  container:
    "flex flex-col bg-bg-container transition-all duration-200",
  header:
    "p-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-800",
  headerTitle: "text-sm font-semibold text-text-1",
  collapseButton:
    "p-1.5 rounded-lg text-text-2 hover:text-text-1 hover:bg-hover transition",
  // Tab 样式 - 增强激活状态，使用背景色块
  tabList:
    "flex px-3 gap-1 py-2 bg-gray-50/50 dark:bg-slate-900/50",
  tabItem:
    "px-4 py-2 text-xs font-medium cursor-pointer transition-all whitespace-nowrap relative rounded-lg",
  content: "flex-1 overflow-y-auto",
};

const InspectorPanel = ({ collapsed, onToggleCollapse }: InspectorPanelProps) => {
  const [activeTab, setActiveTab] = useState<TabKey>("style");

  if (collapsed) {
    return (
      <div className="w-12 flex flex-col items-center py-3 bg-bg-container">
        <button
          className={cls.collapseButton}
          onClick={onToggleCollapse}
          title="展开属性面板"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className={classNames(cls.container, "w-80")}>
      {/* 头部 */}
      <div className={cls.header}>
        <span className={cls.headerTitle}>属性</span>
        <button
          className={cls.collapseButton}
          onClick={onToggleCollapse}
          title="收起属性面板"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* 标签页 - 使用背景色块增强激活状态 */}
      <div className={cls.tabList}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <div
              key={tab.key}
              className={classNames(
                cls.tabItem,
                isActive
                  ? "bg-white dark:bg-slate-800 text-text-1 shadow-sm"
                  : "text-text-2 hover:text-text-1 hover:bg-gray-100/50 dark:hover:bg-slate-800/50"
              )}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </div>
          );
        })}
      </div>

      {/* 内容区 */}
      <div className={cls.content}>
        {activeTab === "style" && <PageStyleTab />}
        {activeTab === "transition" && <TransitionTab />}
      </div>
    </div>
  );
};

export default InspectorPanel;

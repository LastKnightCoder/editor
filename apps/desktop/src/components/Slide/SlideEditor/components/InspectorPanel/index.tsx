import { useState } from "react";
import classNames from "classnames";
import PageStyleTab from "./PageStyleTab";
import TransitionTab from "./TransitionTab";
import NotesTab from "./NotesTab";
import useThemeColors from "@/hooks/useThemeColors";

interface InspectorPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

type TabKey = "style" | "transition" | "notes";

const tabs: { key: TabKey; label: string }[] = [
  { key: "style", label: "样式" },
  { key: "transition", label: "过渡" },
  { key: "notes", label: "备注" },
];

// 无边框设计
const cls = {
  container:
    "flex flex-col bg-bg-container transition-all duration-200",
  header:
    "p-3 flex items-center justify-between",
  headerTitle: "text-sm font-semibold text-text-1",
  collapseButton:
    "p-1.5 rounded-lg text-text-2 hover:text-text-1 hover:bg-hover transition",
  // Tab 样式 - 极简通透，只有文字和下划线
  tabList:
    "flex px-3 gap-1",
  tabItem:
    "px-3 py-2.5 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap relative",
  content: "flex-1 overflow-y-auto",
};

const InspectorPanel = ({ collapsed, onToggleCollapse }: InspectorPanelProps) => {
  const [activeTab, setActiveTab] = useState<TabKey>("style");
  const themeColors = useThemeColors();

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

      {/* 标签页 - 只有文字和下划线，无背景色块 */}
      <div className={cls.tabList}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <div
              key={tab.key}
              className={classNames(
                cls.tabItem,
                isActive
                  ? themeColors.activeTextClass
                  : "text-text-2 hover:text-text-1"
              )}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {/* 选中时的底部指示条 */}
              {isActive && (
                <div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4/5 h-[2px] rounded-full"
                  style={{ backgroundColor: themeColors.accentColor }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 内容区 */}
      <div className={cls.content}>
        {activeTab === "style" && <PageStyleTab />}
        {activeTab === "transition" && <TransitionTab />}
        {activeTab === "notes" && <NotesTab />}
      </div>
    </div>
  );
};

export default InspectorPanel;

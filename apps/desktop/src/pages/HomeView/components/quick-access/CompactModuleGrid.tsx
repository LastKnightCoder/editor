import React, { useState, useEffect } from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import {
  StickyNote,
  FileText,
  Layout,
  FolderKanban,
  BookOpen,
  Calendar,
  FileType,
  CalendarDays,
  Timer,
  CheckSquare,
  HelpCircle,
  Rss,
  LucideIcon,
  CreditCard,
  BarChart3,
  Grid3x3,
} from "lucide-react";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";

interface ModuleConfig {
  key: string;
  name: string;
  icon: LucideIcon;
  tabType: TabType;
}

const MODULE_CONFIG: ModuleConfig[] = [
  { key: "card", name: "卡片", icon: StickyNote, tabType: TabType.CardList },
  {
    key: "flashcard",
    name: "闪卡",
    icon: CreditCard,
    tabType: TabType.FlashcardCenter,
  },
  {
    key: "article",
    name: "文章",
    icon: FileText,
    tabType: TabType.ArticleList,
  },
  {
    key: "whiteBoard",
    name: "白板",
    icon: Layout,
    tabType: TabType.WhiteBoardList,
  },
  {
    key: "project",
    name: "项目",
    icon: FolderKanban,
    tabType: TabType.ProjectList,
  },
  {
    key: "document",
    name: "文档",
    icon: BookOpen,
    tabType: TabType.DocumentList,
  },
  {
    key: "dailyNote",
    name: "日记",
    icon: Calendar,
    tabType: TabType.DailyNote,
  },
  { key: "pdf", name: "PDF", icon: FileType, tabType: TabType.PdfList },
  {
    key: "calendar",
    name: "日历",
    icon: CalendarDays,
    tabType: TabType.Calendar,
  },
  { key: "pomodoro", name: "番茄钟", icon: Timer, tabType: TabType.Pomodoro },
  { key: "todo", name: "待办", icon: CheckSquare, tabType: TabType.Todo },
  {
    key: "question",
    name: "问题",
    icon: HelpCircle,
    tabType: TabType.Questions,
  },
  { key: "feed", name: "RSS", icon: Rss, tabType: TabType.Feed },
  { key: "dataView", name: "数据", icon: BarChart3, tabType: TabType.DataView },
];

const STORAGE_KEY = "home_module_usage";

interface ModuleUsage {
  [key: string]: number; // timestamp of last use
}

const CompactModuleGrid: React.FC = () => {
  const themeColors = useThemeColors();
  const { createTab } = useTabStore();
  const [moduleUsage, setModuleUsage] = useState<ModuleUsage>({});

  // Load usage from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setModuleUsage(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Failed to load module usage:", error);
    }
  }, []);

  // Get top 8 most recently used modules
  const recentModules = React.useMemo(() => {
    const sorted = MODULE_CONFIG.map((module) => ({
      ...module,
      lastUsed: moduleUsage[module.key] || 0,
    }))
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .slice(0, 8);

    return sorted;
  }, [moduleUsage]);

  const handleModuleClick = (module: ModuleConfig) => {
    // Track usage
    const newUsage = {
      ...moduleUsage,
      [module.key]: Date.now(),
    };
    setModuleUsage(newUsage);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newUsage));

    // Open tab
    createTab(module.tabType);
  };

  const handleViewAll = () => {
    // Open a modal or navigate to full module grid
    // For now, we'll just scroll to the bottom where ModuleGrid might be
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {recentModules.map((module) => {
          const Icon = module.icon;
          return (
            <div
              key={module.key}
              onClick={() => handleModuleClick(module)}
              className={classNames(
                "flex flex-col items-center justify-center gap-2 p-4 rounded-xl cursor-pointer transition-all border",
                themeColors.cardBgClass,
                themeColors.cardBorderClass,
                themeColors.hoverClass,
              )}
            >
              <div
                className={classNames(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  "bg-gray-100 dark:bg-gray-800",
                )}
              >
                <Icon
                  className={classNames(
                    "w-5 h-5",
                    themeColors.secondaryTextClass,
                  )}
                />
              </div>
              <span
                className={classNames(
                  "text-xs font-medium text-center",
                  themeColors.textClass,
                )}
              >
                {module.name}
              </span>
            </div>
          );
        })}
      </div>

      <div
        onClick={handleViewAll}
        className={classNames(
          "mt-3 flex items-center justify-center gap-2 py-2 rounded-lg cursor-pointer transition-all",
          themeColors.hoverClass,
          themeColors.secondaryTextClass,
        )}
      >
        <Grid3x3 className="w-4 h-4" />
        <span className="text-sm">查看全部模块</span>
      </div>
    </div>
  );
};

export default CompactModuleGrid;

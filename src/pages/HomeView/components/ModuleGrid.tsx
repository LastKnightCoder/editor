import React from "react";
import {
  StickyNote,
  FileText,
  Layout,
  FolderKanban,
  BookOpen,
  Calendar,
  FileType,
  Database,
  Target,
  CalendarDays,
  MessageSquare,
  Sparkles,
  FolderOpen,
  Timer,
  CheckSquare,
  HelpCircle,
  BookMarked,
  LucideIcon,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import classNames from "classnames";
import { useState } from "react";
import { motion } from "framer-motion";
import useSettingStore from "@/stores/useSettingStore";
import useTabStore from "@/stores/useTabStore";
import useThemeColors from "@/hooks/useThemeColors";
import { TabType } from "@/types/tab";

interface ModuleConfig {
  tabType: TabType;
  icon: LucideIcon;
  key: string;
}

const MODULE_CONFIG: Record<string, ModuleConfig> = {
  card: {
    tabType: TabType.CardList,
    icon: StickyNote,
    key: "card",
  },
  article: {
    tabType: TabType.ArticleList,
    icon: FileText,
    key: "article",
  },
  whiteBoard: {
    tabType: TabType.WhiteBoardList,
    icon: Layout,
    key: "whiteBoard",
  },
  project: {
    tabType: TabType.ProjectList,
    icon: FolderKanban,
    key: "project",
  },
  document: {
    tabType: TabType.DocumentList,
    icon: BookOpen,
    key: "document",
  },
  dailyNote: {
    tabType: TabType.DailyNote,
    icon: Calendar,
    key: "dailyNote",
  },
  pdf: {
    tabType: TabType.PdfList,
    icon: FileType,
    key: "pdf",
  },
  vecDocuments: {
    tabType: TabType.VecDocument,
    icon: Database,
    key: "vecDocuments",
  },
  goal: {
    tabType: TabType.Goals,
    icon: Target,
    key: "goal",
  },
  calendar: {
    tabType: TabType.Calendar,
    icon: CalendarDays,
    key: "calendar",
  },
  chatManagement: {
    tabType: TabType.ChatManagement,
    icon: MessageSquare,
    key: "chatManagement",
  },
  promptManagement: {
    tabType: TabType.PromptManagement,
    icon: Sparkles,
    key: "promptManagement",
  },
  resourceManagement: {
    tabType: TabType.ResourceManagement,
    icon: FolderOpen,
    key: "resourceManagement",
  },
  pomodoro: {
    tabType: TabType.Pomodoro,
    icon: Timer,
    key: "pomodoro",
  },
  todo: {
    tabType: TabType.Todo,
    icon: CheckSquare,
    key: "todo",
  },
  question: {
    tabType: TabType.Questions,
    icon: HelpCircle,
    key: "question",
  },
  weread: {
    tabType: TabType.WeRead,
    icon: BookMarked,
    key: "weread",
  },
};

const ModuleGrid: React.FC = () => {
  const { setting } = useSettingStore();
  const { navigateTo } = useTabStore();
  const themeColors = useThemeColors();
  const [isExpanded, setIsExpanded] = useState(false);

  const enabledModules = Object.entries(setting.module)
    .filter(([_, config]) => config.enable)
    .map(([key, config]) => ({
      name: config.name,
      ...MODULE_CONFIG[key],
    }))
    .filter((module) => module.tabType); // 过滤掉没有配置的模块

  const handleModuleClick = (tabType: TabType) => {
    navigateTo(tabType);
  };

  return (
    <div className="w-full">
      <h2
        className={classNames(
          "text-lg font-semibold mb-4 transition-colors flex items-center justify-between",
          themeColors.textClass,
        )}
      >
        <span>快捷导航</span>
        {enabledModules.length > 12 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={classNames(
              "flex items-center gap-1 text-sm px-3 py-1 rounded-full transition-all",
              themeColors.hoverClass,
              themeColors.textClass,
            )}
          >
            {isExpanded ? "收起" : "展开"}
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        )}
      </h2>
      <motion.div
        initial={false}
        animate={{ height: isExpanded ? "auto" : 210 }}
        transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
        className="overflow-hidden"
      >
        <div
          className={classNames(
            "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 px-1 pt-1 pb-4",
          )}
        >
          {enabledModules.map((module) => {
            const Icon = module.icon;
            return (
              <button
                key={module.key}
                onClick={() => handleModuleClick(module.tabType)}
                className={classNames(
                  "group flex flex-col items-center justify-center p-3 rounded-2xl cursor-pointer transition-all duration-300 border border-transparent shadow-sm hover:shadow-lg",
                  themeColors.cardBgClass,
                  themeColors.hoverBorderClass,
                )}
              >
                <div
                  className={classNames(
                    "w-10 h-10 rounded-xl flex items-center justify-center mb-2 transition-colors",
                    themeColors.activeClass,
                  )}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span
                  className={classNames(
                    "text-xs font-medium text-center transition-colors",
                    themeColors.textClass,
                  )}
                >
                  {module.name}
                </span>
              </button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
};

export default ModuleGrid;

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
} from "lucide-react";
import useSettingStore from "@/stores/useSettingStore";
import useTabStore from "@/stores/useTabStore";
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
      <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">
        快捷导航
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {enabledModules.map((module) => {
          const Icon = module.icon;
          return (
            <button
              key={module.key}
              onClick={() => handleModuleClick(module.tabType)}
              className="flex flex-col items-center justify-center p-4 rounded-lg cursor-pointer transition-all bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-700 hover:shadow-md active:scale-100"
            >
              <Icon className="w-8 h-8 mb-2 text-indigo-500 dark:text-indigo-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-slate-300 text-center">
                {module.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ModuleGrid;

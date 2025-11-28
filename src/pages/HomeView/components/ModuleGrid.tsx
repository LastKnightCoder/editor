import React from "react";
import { useMemo, useCallback, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
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
  X,
  Plus,
} from "lucide-react";
import classNames from "classnames";
import { useState } from "react";
import { motion } from "framer-motion";
import useSettingStore, {
  DEFAULT_MODULE_ORDER,
} from "@/stores/useSettingStore";
import useTabStore from "@/stores/useTabStore";
import useThemeColors from "@/hooks/useThemeColors";
import { TabType } from "@/types/tab";
import { produce } from "immer";
import ModuleSelectModal from "./ModuleSelectModal";

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

const MODULE_CARD_TYPE = "module-card";

interface DragItem {
  key: string;
  index: number;
}

interface ModuleCardProps {
  module: {
    key: string;
    name: string;
    icon: LucideIcon;
    tabType: TabType;
  };
  index: number;
  isEditMode: boolean;
  onMove: (dragIndex: number, hoverIndex: number) => void;
  onDragEnd: () => void;
  onDisable?: (moduleKey: string) => void;
  onClick: (tabType: TabType) => void;
}

const ModuleCard: React.FC<ModuleCardProps> = ({
  module,
  index,
  isEditMode,
  onMove,
  onDragEnd,
  onDisable,
  onClick,
}) => {
  const ref = useRef<HTMLButtonElement>(null);
  const themeColors = useThemeColors();

  const [{ isDragging }, drag] = useDrag({
    type: MODULE_CARD_TYPE,
    item: { key: module.key, index },
    canDrag: isEditMode,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: () => {
      onDragEnd();
    },
  });

  const [{ isOver }, drop] = useDrop({
    accept: MODULE_CARD_TYPE,
    hover: (item: DragItem) => {
      if (item.index !== index) {
        onMove(item.index, index);
        item.index = index;
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  if (isEditMode) {
    drag(drop(ref));
  }

  const Icon = module.icon;

  return (
    <button
      ref={ref}
      onClick={() => !isEditMode && onClick(module.tabType)}
      className={classNames(
        "group flex flex-col items-center justify-center p-3 rounded-2xl transition-all duration-300 border border-transparent shadow-sm hover:shadow-lg relative",
        themeColors.cardBgClass,
        themeColors.hoverBorderClass,
        isEditMode && "cursor-move",
        !isEditMode && "cursor-pointer",
        isDragging && "opacity-40",
        isOver && isEditMode && "ring-2 ring-blue-400",
      )}
    >
      {isEditMode && onDisable && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDisable(module.key);
          }}
          className={classNames(
            "absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center transition-all z-10 shadow-md",
            "bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700",
            "text-white",
          )}
        >
          <X className="w-3 h-3" />
        </button>
      )}
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
};

interface AddModuleCardProps {
  onClick: () => void;
}

const AddModuleCard: React.FC<AddModuleCardProps> = ({ onClick }) => {
  const themeColors = useThemeColors();

  return (
    <button
      onClick={onClick}
      className={classNames(
        "group flex flex-col items-center justify-center p-3 rounded-2xl cursor-pointer transition-all duration-300 border-2 border-dashed shadow-sm hover:shadow-lg",
        themeColors.cardBgClass,
        "border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500",
      )}
    >
      <div
        className={classNames(
          "w-10 h-10 rounded-xl flex items-center justify-center mb-2 transition-colors",
          "bg-gray-100 dark:bg-gray-700 group-hover:bg-blue-100 dark:group-hover:bg-blue-900",
        )}
      >
        <Plus className="w-5 h-5 text-gray-500 dark:text-gray-400 group-hover:text-blue-500" />
      </div>
      <span
        className={classNames(
          "text-xs font-medium text-center transition-colors",
          "text-gray-500 dark:text-gray-400 group-hover:text-blue-500",
        )}
      >
        添加模块
      </span>
    </button>
  );
};

const ModuleGrid: React.FC = () => {
  const { setting } = useSettingStore();
  const { navigateTo } = useTabStore();
  const themeColors = useThemeColors();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [localModules, setLocalModules] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  // Auto expand when entering edit mode
  React.useEffect(() => {
    if (isEditMode && displayModules.length > 12) {
      setIsExpanded(true);
    }
  }, [isEditMode]);

  const enabledModules = useMemo(() => {
    const moduleEntries = Object.entries(setting.module)
      .filter(([_, config]) => config.enable)
      .map(([key, config]) => ({
        name: config.name,
        ...MODULE_CONFIG[key],
      }))
      .filter((module) => module.tabType);

    // Sort by stored order
    const order = setting.moduleOrder || DEFAULT_MODULE_ORDER;
    const sorted = moduleEntries.sort((a, b) => {
      const indexA = order.indexOf(a.key);
      const indexB = order.indexOf(b.key);

      // Handle modules not in order array (newly enabled)
      if (indexA === -1) return 1; // Move to end
      if (indexB === -1) return -1;

      return indexA - indexB;
    });

    return sorted;
  }, [setting.module, setting.moduleOrder]);

  // Sync localModules with enabledModules
  React.useEffect(() => {
    setLocalModules(enabledModules);
  }, [enabledModules]);

  const handleModuleClick = (tabType: TabType) => {
    navigateTo(tabType);
  };

  const moveModule = useCallback((dragIndex: number, hoverIndex: number) => {
    setLocalModules((prevModules) => {
      const newModules = [...prevModules];
      const [draggedModule] = newModules.splice(dragIndex, 1);
      newModules.splice(hoverIndex, 0, draggedModule);
      return newModules;
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    // Persist new order to store
    const newOrder = localModules.map((m) => m.key);
    useSettingStore.getState().updateModuleOrder(newOrder);
  }, [localModules]);

  const displayModules = isEditMode ? localModules : enabledModules;

  const disabledModules = useMemo(() => {
    return Object.entries(setting.module)
      .filter(([_, config]) => !config.enable)
      .map(([key, config]) => ({
        key,
        name: config.name,
      }));
  }, [setting.module]);

  const handleDisableModule = useCallback(
    (moduleKey: string) => {
      const newSetting = produce(setting, (draft) => {
        (draft.module as any)[moduleKey].enable = false;
      });
      useSettingStore.setState({ setting: newSetting });
    },
    [setting],
  );

  const handleEnableModules = useCallback(
    (moduleKeys: string[]) => {
      const newSetting = produce(setting, (draft) => {
        moduleKeys.forEach((key) => {
          (draft.module as any)[key].enable = true;
        });
      });
      useSettingStore.setState({ setting: newSetting });
      setShowAddModal(false);
    },
    [setting],
  );

  return (
    <div className="w-full">
      <h2
        className={classNames(
          "text-lg font-semibold mb-4 transition-colors flex items-center justify-between",
          themeColors.textClass,
        )}
      >
        <span>快捷导航</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className={classNames(
              "flex items-center gap-1 text-sm px-3 py-1 rounded-full transition-all",
              isEditMode ? themeColors.activeClass : themeColors.hoverClass,
              themeColors.textClass,
            )}
          >
            {isEditMode ? "完成" : "编辑"}
          </button>
          {displayModules.length > 12 && (
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
        </div>
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
          {displayModules.map((module, index) => (
            <ModuleCard
              key={module.key}
              module={module}
              index={index}
              isEditMode={isEditMode}
              onMove={moveModule}
              onDragEnd={handleDragEnd}
              onDisable={isEditMode ? handleDisableModule : undefined}
              onClick={handleModuleClick}
            />
          ))}
          {isEditMode && (
            <AddModuleCard onClick={() => setShowAddModal(true)} />
          )}
        </div>
      </motion.div>

      <ModuleSelectModal
        open={showAddModal}
        disabledModules={disabledModules}
        onCancel={() => setShowAddModal(false)}
        onConfirm={handleEnableModules}
      />
    </div>
  );
};

export default ModuleGrid;

import React from "react";
import { useMemo, useCallback, useRef, useState } from "react";
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
  BarChart3,
  Settings,
  Globe,
  CreditCard,
  Lightbulb,
} from "lucide-react";
import classNames from "classnames";
import { motion } from "motion/react";
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

interface EnabledModule extends ModuleConfig {
  name: string;
}

type ModuleSettingMap = Record<string, { enable: boolean; name: string }>;

const MODULE_CONFIG: Record<string, ModuleConfig> = {
  card: {
    tabType: TabType.CardList,
    icon: StickyNote,
    key: "card",
  },
  flashcard: {
    tabType: TabType.FlashcardCenter,
    icon: CreditCard,
    key: "flashcard",
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
  skillManagement: {
    tabType: TabType.SkillManagement,
    icon: Lightbulb,
    key: "skillManagement",
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
  webview: {
    tabType: TabType.WebView,
    icon: Globe,
    key: "webview",
  },
  dataView: {
    tabType: TabType.DataView,
    icon: BarChart3,
    key: "dataView",
  },
  settings: {
    tabType: TabType.Settings,
    icon: Settings,
    key: "settings",
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
  onDisable?: (moduleKey: string) => void;
  onClick: (tabType: TabType) => void;
}

const ModuleCard: React.FC<ModuleCardProps> = ({
  module,
  index,
  isEditMode,
  onMove,
  onDisable,
  onClick,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const themeColors = useThemeColors();

  const [{ isDragging }, drag] = useDrag({
    type: MODULE_CARD_TYPE,
    item: { key: module.key, index },
    canDrag: isEditMode,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
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

  drag(drop(ref));

  const Icon = module.icon;

  return (
    <div
      ref={ref}
      onClick={() => !isEditMode && onClick(module.tabType)}
      onKeyDown={(e) => {
        if (!isEditMode && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick(module.tabType);
        }
      }}
      role={!isEditMode ? "button" : undefined}
      tabIndex={!isEditMode ? 0 : -1}
      className={classNames(
        "group flex flex-col items-center justify-center py-3 px-4 rounded-2xl transition-all duration-300 border border-transparent shadow-sm relative",
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
            "absolute top-0 right-0 w-5 h-5 rounded-full flex items-center justify-center transition-all z-10 shadow-md",
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
    </div>
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
        "border-gray-300 dark:border-gray-600",
        themeColors.hoverBorderClass,
      )}
    >
      <div
        className={classNames(
          "w-10 h-10 rounded-xl flex items-center justify-center mb-2 transition-colors",
          "bg-gray-100 dark:bg-gray-700",
          themeColors.hoverClass.replace("hover:", "group-hover:"),
        )}
      >
        <Plus
          className={classNames(
            "w-5 h-5 text-gray-500 dark:text-gray-400",
            themeColors.hoverTextClass.replace("hover:", "group-hover:"),
          )}
        />
      </div>
      <span
        className={classNames(
          "text-xs font-medium text-center transition-colors",
          "text-gray-500 dark:text-gray-400",
          themeColors.hoverTextClass.replace("hover:", "group-hover:"),
        )}
      >
        添加模块
      </span>
    </button>
  );
};

const ModuleGrid: React.FC = () => {
  const setting = useSettingStore((state) => state.setting);
  const navigateTo = useTabStore((state) => state.navigateTo);
  const themeColors = useThemeColors();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [localModules, setLocalModules] = useState<EnabledModule[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  const editSnapshotRef = useRef<EnabledModule[]>([]);

  const enabledModules = useMemo(() => {
    const moduleEntries = Object.entries(setting.module)
      .filter(([key, config]) => config.enable && key !== "settings")
      .map(([key, config]) => ({
        name: config.name,
        ...MODULE_CONFIG[key],
      }))
      .filter((module) => module.tabType);

    const order = setting.moduleOrder || DEFAULT_MODULE_ORDER;
    const sorted = [...moduleEntries].sort((a, b) => {
      const indexA = order.indexOf(a.key);
      const indexB = order.indexOf(b.key);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    return sorted;
  }, [setting.module, setting.moduleOrder]);

  const handleStartEdit = useCallback(() => {
    editSnapshotRef.current = enabledModules;
    setLocalModules([...enabledModules]);
    setIsEditMode(true);
    if (enabledModules.length > 12) {
      setIsExpanded(true);
    }
  }, [enabledModules]);

  const handleFinishEdit = useCallback(() => {
    const localKeys = new Set(localModules.map((m) => m.key));
    const snapshotKeys = new Set(editSnapshotRef.current.map((m) => m.key));

    const toDisable = [...snapshotKeys].filter((k) => !localKeys.has(k));
    const toEnable = [...localKeys].filter((k) => !snapshotKeys.has(k));
    const orderChanged = !localModules.every(
      (m, i) => editSnapshotRef.current[i]?.key === m.key,
    );

    if (toDisable.length > 0 || toEnable.length > 0 || orderChanged) {
      const currentSetting = useSettingStore.getState().setting;
      const newSetting = produce(currentSetting, (draft) => {
        toDisable.forEach((key) => {
          (draft.module as ModuleSettingMap)[key].enable = false;
        });
        toEnable.forEach((key) => {
          (draft.module as ModuleSettingMap)[key].enable = true;
        });
        draft.moduleOrder = localModules.map((m) => m.key);
      });
      useSettingStore.setState({ setting: newSetting });
    }

    editSnapshotRef.current = [];
    setIsEditMode(false);
  }, [localModules]);

  const handleModuleClick = useCallback(
    (tabType: TabType) => {
      if (tabType === TabType.WebView) {
        navigateTo(tabType, { url: "" });
      } else {
        navigateTo(tabType);
      }
    },
    [navigateTo],
  );

  const moveModule = useCallback((dragIndex: number, hoverIndex: number) => {
    setLocalModules((prevModules) => {
      const newModules = [...prevModules];
      const [draggedModule] = newModules.splice(dragIndex, 1);
      newModules.splice(hoverIndex, 0, draggedModule);
      return newModules;
    });
  }, []);

  const displayModules = isEditMode ? localModules : enabledModules;

  const disabledModules = useMemo(() => {
    if (isEditMode) {
      const localKeys = new Set(localModules.map((m) => m.key));
      return Object.entries(setting.module)
        .filter(([key]) => !localKeys.has(key) && key !== "settings")
        .map(([key, config]) => ({ key, name: config.name }));
    }
    return Object.entries(setting.module)
      .filter(([key, config]) => !config.enable && key !== "settings")
      .map(([key, config]) => ({ key, name: config.name }));
  }, [setting.module, isEditMode, localModules]);

  const handleDisableModule = useCallback((moduleKey: string) => {
    setLocalModules((prev) => prev.filter((m) => m.key !== moduleKey));
  }, []);

  const handleEnableModules = useCallback(
    (moduleKeys: string[]) => {
      const newModules = moduleKeys
        .map((key) => {
          const config = MODULE_CONFIG[key];
          const moduleConfig = (setting.module as ModuleSettingMap)[key];
          if (!config || !moduleConfig) return null;
          return { name: moduleConfig.name, ...config };
        })
        .filter((m): m is EnabledModule => m !== null);
      setLocalModules((prev) => [...prev, ...newModules]);
      setShowAddModal(false);
    },
    [setting.module],
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
            onClick={isEditMode ? handleFinishEdit : handleStartEdit}
            className={classNames(
              "flex items-center gap-1 text-sm px-3 py-1 rounded-full transition-all",
              isEditMode ? themeColors.activeClass : themeColors.hoverClass,
              themeColors.textClass,
            )}
          >
            {isEditMode ? "完成编辑" : "编辑"}
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
            "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pt-1 pb-4",
          )}
        >
          {displayModules.map((module, index) => (
            <ModuleCard
              key={module.key}
              module={module}
              index={index}
              isEditMode={isEditMode}
              onMove={moveModule}
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

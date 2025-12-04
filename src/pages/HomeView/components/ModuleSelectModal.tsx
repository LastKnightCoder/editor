import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import classNames from "classnames";
import { X, LucideIcon } from "lucide-react";
import useThemeColors from "@/hooks/useThemeColors";
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
} from "lucide-react";
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

interface ModuleOption {
  key: string;
  name: string;
}

interface ModuleSelectModalProps {
  open: boolean;
  disabledModules: ModuleOption[];
  onCancel: () => void;
  onConfirm: (selectedKeys: string[]) => void;
}

const ModuleSelectModal: React.FC<ModuleSelectModalProps> = ({
  open,
  disabledModules,
  onCancel,
  onConfirm,
}) => {
  const themeColors = useThemeColors();
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setSelectedKeys([]);
    }
  }, [open]);

  const toggleModule = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const handleConfirm = () => {
    onConfirm(selectedKeys);
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onCancel}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className={classNames(
          "relative w-full max-w-2xl mx-4 rounded-2xl shadow-2xl overflow-hidden",
          themeColors.cardBgClass,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={classNames(
            "flex items-center justify-between px-6 py-4 border-b",
            themeColors.cardBorderClass,
          )}
        >
          <h2
            className={classNames(
              "text-lg font-semibold",
              themeColors.textClass,
            )}
          >
            添加模块
          </h2>
          <button
            onClick={onCancel}
            className={classNames(
              "p-1 rounded-lg transition-colors",
              themeColors.hoverClass,
            )}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 max-h-96 overflow-y-auto">
          {disabledModules.length === 0 ? (
            <div
              className={classNames(
                "text-center py-8 text-sm",
                "text-gray-500 dark:text-gray-400",
              )}
            >
              所有模块都已启用
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {disabledModules.map((module) => {
                const config = MODULE_CONFIG[module.key];
                const Icon = config?.icon;
                const isSelected = selectedKeys.includes(module.key);

                return (
                  <button
                    key={module.key}
                    onClick={() => toggleModule(module.key)}
                    className={classNames(
                      "group flex flex-col items-center justify-center p-3 rounded-2xl transition-all duration-300 border border-transparent shadow-sm hover:shadow-lg relative cursor-pointer",
                      themeColors.cardBgClass,
                      themeColors.hoverBorderClass,
                      isSelected && "border-2",
                      isSelected && themeColors.focusBorderClass,
                    )}
                  >
                    {Icon && (
                      <div
                        className={classNames(
                          "w-10 h-10 rounded-xl flex items-center justify-center mb-2 transition-colors",
                          themeColors.activeClass,
                        )}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                    )}
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
          )}
        </div>

        {/* Footer */}
        <div
          className={classNames(
            "flex items-center justify-end gap-3 px-6 py-4 border-t",
            themeColors.cardBorderClass,
          )}
        >
          <button
            onClick={onCancel}
            className={classNames(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all",
              themeColors.hoverClass,
              themeColors.textClass,
            )}
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedKeys.length === 0}
            className={classNames(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-lg hover:shadow-xl",
              themeColors.primaryButtonClass,
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            确定 {selectedKeys.length > 0 && `(${selectedKeys.length})`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ModuleSelectModal;

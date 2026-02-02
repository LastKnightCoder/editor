import {
  memo,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { App } from "antd";
import {
  ListOrdered,
  Highlighter,
  Network,
  Presentation,
  CircleHelp,
  CreditCard,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Inbox,
} from "lucide-react";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";

import useThemeColors from "@/hooks/useThemeColors";
import { VLNote } from "@/types/vibe-learning";
import { getVLNotesByProjectId, deleteVLNote } from "@/commands/vibe-learning";
import { formatDate } from "@/utils";

export interface AppListViewRef {
  refreshNotes: () => Promise<void>;
}

interface AppItem {
  key: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  available: boolean;
  onClick?: () => void;
}

interface AppListViewProps {
  projectId: number;
  onOpenOutline: () => void;
  onOpenQuiz: () => void;
  onCreateNote: () => void;
  onEditNote: (note: VLNote) => void;
}

const AppListView = memo(
  forwardRef<AppListViewRef, AppListViewProps>((props, ref) => {
    const { projectId, onOpenOutline, onOpenQuiz, onCreateNote, onEditNote } =
      props;
    const { modal, message } = App.useApp();
    const themeColors = useThemeColors();

    const [notes, setNotes] = useState<VLNote[]>([]);
    const [loading, setLoading] = useState(true);

    // 加载笔记列表
    const loadNotes = useMemoizedFn(async () => {
      if (!projectId) return;
      setLoading(true);
      try {
        const data = await getVLNotesByProjectId(projectId);
        setNotes(data);
      } catch (error) {
        console.error("Failed to load notes:", error);
      } finally {
        setLoading(false);
      }
    });

    useEffect(() => {
      loadNotes();
    }, [projectId, loadNotes]);

    // 暴露刷新方法给父组件
    useImperativeHandle(ref, () => ({
      refreshNotes: loadNotes,
    }));

    // 删除笔记
    const handleDeleteNote = useMemoizedFn(
      (e: React.MouseEvent, note: VLNote) => {
        e.stopPropagation(); // 阻止事件冒泡，避免触发编辑

        modal.confirm({
          title: "删除笔记",
          content: `确定要删除"${note.title || "无标题笔记"}"吗？`,
          okText: "删除",
          cancelText: "取消",
          okButtonProps: { danger: true },
          onOk: async () => {
            try {
              await deleteVLNote(note.id);
              message.success("笔记已删除");
              loadNotes(); // 刷新列表
            } catch (error) {
              console.error("Failed to delete note:", error);
              message.error("删除失败");
            }
          },
        });
      },
    );

    // 应用列表配置
    const apps: AppItem[] = [
      {
        key: "outline",
        icon: <ListOrdered className="w-5 h-5" />,
        title: "学习大纲",
        description: "梳理学习路径",
        available: true,
        onClick: onOpenOutline,
      },
      {
        key: "highlights",
        icon: <Highlighter className="w-5 h-5" />,
        title: "重点提炼",
        description: "提取核心干货",
        available: false,
      },
      {
        key: "mindmap",
        icon: <Network className="w-5 h-5" />,
        title: "思维导图",
        description: "可视化知识结构",
        available: false,
      },
      {
        key: "ppt",
        icon: <Presentation className="w-5 h-5" />,
        title: "PPT",
        description: "高效汇报和演示",
        available: false,
      },
      {
        key: "quiz",
        icon: <CircleHelp className="w-5 h-5" />,
        title: "测验",
        description: "自测掌握程度",
        available: true,
        onClick: onOpenQuiz,
      },
      {
        key: "flashcard",
        icon: <CreditCard className="w-5 h-5" />,
        title: "记忆卡片",
        description: "碎片时间记忆",
        available: false,
      },
    ];

    return (
      <div className="flex flex-col h-full">
        {/* 标题栏 */}
        <div
          className={classNames(
            "px-4 py-3 border-b shrink-0",
            themeColors.borderClass,
          )}
        >
          <h3
            className={classNames(
              "text-base font-semibold m-0",
              themeColors.activeTextClass,
            )}
          >
            应用
          </h3>
        </div>

        {/* 滚动区域 */}
        <div className="flex-1 overflow-auto">
          {/* 应用网格 */}
          <div className="p-4">
            <div className="grid grid-cols-2 gap-3">
              {apps.map((app, index) => (
                <motion.div
                  key={app.key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  title={!app.available ? "开发中" : undefined}
                  className={classNames(
                    "p-4 rounded-xl border backdrop-blur-sm transition-all cursor-pointer",
                    app.available
                      ? [
                          themeColors.cardBgClass,
                          themeColors.cardBorderClass,
                          themeColors.hoverBorderClass,
                        ]
                      : [
                          "opacity-50 cursor-not-allowed",
                          themeColors.tagBgClass,
                          themeColors.cardBorderClass,
                        ],
                  )}
                  onClick={app.available ? app.onClick : undefined}
                >
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <span
                      className={
                        app.available
                          ? themeColors.iconTextClass
                          : themeColors.secondaryTextClass
                      }
                    >
                      {app.icon}
                    </span>
                    <span
                      className={classNames(
                        "text-sm font-semibold",
                        themeColors.activeTextClass,
                      )}
                    >
                      {app.title}
                    </span>
                    {!app.available && (
                      <Pencil
                        className={classNames(
                          "w-3.5 h-3.5 ml-auto",
                          themeColors.secondaryTextClass,
                        )}
                      />
                    )}
                  </div>
                  <p
                    className={classNames(
                      "text-xs m-0",
                      themeColors.secondaryTextClass,
                    )}
                  >
                    {app.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* 分隔线 */}
          <div className="px-4">
            <div className={classNames("border-t", themeColors.borderClass)} />
          </div>

          {/* 创作内容区域 */}
          <div className="p-4">
            <h4
              className={classNames(
                "text-sm font-semibold mb-3",
                themeColors.textClass,
              )}
            >
              创作内容
            </h4>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2
                  className={classNames(
                    "w-6 h-6 animate-spin",
                    themeColors.iconTextClass,
                  )}
                />
                <p
                  className={classNames(
                    "text-xs mt-2",
                    themeColors.secondaryTextClass,
                  )}
                >
                  加载中...
                </p>
              </div>
            ) : notes.length === 0 ? (
              <div
                className={classNames(
                  "flex flex-col items-center justify-center py-8 rounded-xl border-2 border-dashed",
                  themeColors.cardBorderClass,
                )}
              >
                <Inbox
                  className={classNames(
                    "w-10 h-10 mb-2",
                    themeColors.secondaryTextClass,
                  )}
                />
                <p
                  className={classNames(
                    "text-sm",
                    themeColors.secondaryTextClass,
                  )}
                >
                  暂无笔记
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <AnimatePresence>
                  {notes.map((note, index) => (
                    <motion.div
                      key={note.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ delay: index * 0.03 }}
                      className={classNames(
                        "group p-3 rounded-xl border backdrop-blur-sm cursor-pointer transition-all",
                        themeColors.cardBgClass,
                        themeColors.cardBorderClass,
                        themeColors.hoverBorderClass,
                      )}
                      onClick={() => onEditNote(note)}
                    >
                      <div className="flex items-center gap-2.5">
                        <Pencil
                          className={classNames(
                            "w-4 h-4 shrink-0",
                            themeColors.secondaryTextClass,
                          )}
                        />
                        <span
                          className={classNames(
                            "flex-1 text-sm font-medium truncate",
                            themeColors.activeTextClass,
                          )}
                        >
                          {note.title || "无标题笔记"}
                        </span>
                        <div className="relative shrink-0 w-14 h-6 flex items-center justify-end">
                          <span
                            className={classNames(
                              "text-xs group-hover:opacity-0 transition-opacity",
                              themeColors.secondaryTextClass,
                            )}
                          >
                            {formatDate(note.updateTime, true)}
                          </span>
                          <button
                            type="button"
                            className="absolute right-0 top-0 flex items-center justify-center w-6 h-6 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100 border-none bg-transparent cursor-pointer"
                            onClick={(e) => handleDeleteNote(e, note)}
                            title="删除笔记"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* 底部新建笔记按钮 */}
        <div
          className={classNames(
            "p-4 border-t shrink-0",
            themeColors.borderClass,
          )}
        >
          <button
            type="button"
            className={classNames(
              "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all border",
              themeColors.cardBgClass,
              themeColors.cardBorderClass,
              themeColors.textClass,
              themeColors.hoverClass,
            )}
            onClick={onCreateNote}
          >
            <Plus className="w-4 h-4" />
            <span>新建笔记</span>
          </button>
        </div>
      </div>
    );
  }),
);

AppListView.displayName = "AppListView";

export default AppListView;

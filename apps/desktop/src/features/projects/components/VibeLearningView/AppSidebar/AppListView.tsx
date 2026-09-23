import { memo, useEffect, useState, useMemo, forwardRef, useImperativeHandle } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ListOrdered,
  Highlighter,
  FileText,
  Network,
  Presentation,
  FileBarChart,
  CircleHelp,
  Mic,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Inbox,
  Play,
  Trophy,
  Clock,
  History,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import PodcastPlayer from "@/components/PodcastPlayer";
import type { IPodcast } from "@/types/podcast";
import { getPodcastById } from "@/commands/podcast";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";

import CustomModal from "@/components/CustomModal";
import useThemeColors from "@/hooks/useThemeColors";
import useVLQuizStore from "@/stores/useVLQuizStore";
import useOutlineGenerationStore from "@/stores/useOutlineGenerationStore";
import { VLNote } from "@/types/vibe-learning";
import type { VLQuizSet, VLQuizRecord } from "@/types";
import {
  getVLNotesByProjectId,
  deleteVLNote,
  ensureVLNoteResource,
} from "@/commands/vibe-learning";
import { formatDate } from "@/utils";
import QuizTestModal from "./apps/QuizTestModal";
import QuizEditModal from "./apps/QuizEditModal";
import { toast, ConfirmDialog } from "@tau/ui";

export interface AppListViewRef {
  refreshNotes: () => Promise<void>;
  refreshQuizSets: () => void;
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
  mainDbName: string;
  onResourcesChange: () => void;
  onOpenOutline: () => void;
  onOpenHighlights: () => void;
  onOpenArticle: () => void;
  onOpenQuiz: () => void;
  onOpenMindMap: () => void;
  onOpenPPT: () => void;
  onOpenReport: () => void;
  onOpenPodcast: () => void;
  onCreateNote: () => void;
  onEditNote: (note: VLNote) => void;
  onEditPPT?: (note: VLNote) => void;
  onEditReport?: (note: VLNote) => void;
}

const AppListView = memo(
  forwardRef<AppListViewRef, AppListViewProps>((props, ref) => {
    const {
      projectId,
      mainDbName,
      onResourcesChange,
      onOpenOutline,
      onOpenHighlights,
      onOpenArticle,
      onOpenQuiz,
      onOpenMindMap,
      onOpenPPT,
      onOpenReport,
      onOpenPodcast,
      onCreateNote,
      onEditNote,
      onEditPPT,
      onEditReport,
    } = props;
    const themeColors = useThemeColors();
    /* 命令式 confirm → 声明式：待确认删除（笔记/测验集） */
    const [pendingConfirm, setPendingConfirm] = useState<null | {
      title: string;
      description: string;
      action: () => void | Promise<void>;
    }>(null);

    const [notes, setNotes] = useState<VLNote[]>([]);
    const [loading, setLoading] = useState(true);
    const [addingResourceNoteIds, setAddingResourceNoteIds] = useState<number[]>([]);

    // 测验集相关状态
    const {
      quizSetsByProject,
      loadingQuizSets,
      loadingRecords,
      fetchQuizSets,
      deleteQuizSet,
      fetchRecords,
      recordsByQuizSet,
      setCurrentProject,
      startTest,
    } = useVLQuizStore();

    const [showTestModal, setShowTestModal] = useState(false);
    const [showRecordsModal, setShowRecordsModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedQuizSet, setSelectedQuizSet] = useState<VLQuizSet | null>(null);

    // 获取当前项目的测验集
    const quizSets = useMemo(
      () => quizSetsByProject[projectId] ?? [],
      [quizSetsByProject, projectId]
    );

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

    // 初始化测验集
    useEffect(() => {
      setCurrentProject(projectId);
      fetchQuizSets(projectId);
    }, [projectId, setCurrentProject, fetchQuizSets]);

    // 为每个测验集加载记录（用于显示最佳成绩）
    useEffect(() => {
      quizSets.forEach(quizSet => {
        if (!recordsByQuizSet[quizSet.id]) {
          fetchRecords({ quizSetId: quizSet.id });
        }
      });
    }, [quizSets, recordsByQuizSet, fetchRecords]);

    // 暴露刷新方法给父组件
    useImperativeHandle(ref, () => ({
      refreshNotes: loadNotes,
      refreshQuizSets: () => fetchQuizSets(projectId),
    }));

    // 删除笔记
    const handleDeleteNote = useMemoizedFn((e: React.MouseEvent, note: VLNote) => {
      e.stopPropagation(); // 阻止事件冒泡，避免触发编辑
      setPendingConfirm({
        title: "删除笔记",
        description: `确定要删除"${note.title || "无标题笔记"}"吗？`,
        action: async () => {
          try {
            await deleteVLNote(note.id);
            toast.success("笔记已删除");
            loadNotes(); // 刷新列表
          } catch (error) {
            console.error("Failed to delete note:", error);
            toast.error("删除失败");
          }
        },
      });
    });

    const handleAddNoteToResources = useMemoizedFn(async (e: React.MouseEvent, note: VLNote) => {
      e.stopPropagation();

      if (addingResourceNoteIds.includes(note.id)) {
        return;
      }

      setAddingResourceNoteIds(prev => [...prev, note.id]);
      try {
        const result = await ensureVLNoteResource({
          projectId,
          mainDbName,
          contentId: note.contentId,
          title: note.title || "无标题笔记",
          noteType: note.type,
          originalId: note.id,
        });

        if (result.created) {
          onResourcesChange();
          toast.success("已添加到资源列表");
        } else {
          toast.info("该内容已在资源列表中");
        }
      } catch (error) {
        console.error("Failed to add note to resources:", error);
        toast.error("添加到资源列表失败");
      } finally {
        setAddingResourceNoteIds(prev => prev.filter(itemId => itemId !== note.id));
      }
    });

    // 开始测验
    const handleStartTest = useMemoizedFn(async (quizSet: VLQuizSet) => {
      try {
        await startTest(quizSet.id);
        setSelectedQuizSet(quizSet);
        setShowTestModal(true);
      } catch (error) {
        toast.error((error as Error).message || "无法开始测验");
      }
    });

    // 关闭测验弹窗
    const handleCloseTest = useMemoizedFn(() => {
      setShowTestModal(false);
      setSelectedQuizSet(null);
      // 刷新记录
      if (selectedQuizSet) {
        fetchRecords({ quizSetId: selectedQuizSet.id });
      }
    });

    // 删除测验集
    const handleDeleteQuizSet = useMemoizedFn((e: React.MouseEvent, quizSet: VLQuizSet) => {
      e.stopPropagation();
      setPendingConfirm({
        title: "删除测验集",
        description: `确定要删除"${quizSet.name}"吗？相关的测验记录也会被删除。`,
        action: async () => {
          try {
            await deleteQuizSet(quizSet.id);
            toast.success("测验集已删除");
          } catch (error) {
            toast.error("删除失败");
          }
        },
      });
    });

    // 查看测验记录
    const handleViewRecords = useMemoizedFn(async (quizSet: VLQuizSet) => {
      setSelectedQuizSet(quizSet);
      setShowRecordsModal(true);
      await fetchRecords({ quizSetId: quizSet.id });
    });

    // 关闭记录弹窗
    const handleCloseRecords = useMemoizedFn(() => {
      setShowRecordsModal(false);
    });

    // 打开编辑弹窗
    const handleOpenEdit = useMemoizedFn((quizSet: VLQuizSet) => {
      setSelectedQuizSet(quizSet);
      setShowEditModal(true);
    });

    // 关闭编辑弹窗
    const handleCloseEdit = useMemoizedFn(() => {
      setShowEditModal(false);
      // 刷新列表以获取更新后的数据
      fetchQuizSets(projectId);
    });

    // 获取最佳成绩
    const getBestScore = (quizSetId: number): number | null => {
      const records = recordsByQuizSet[quizSetId] ?? [];
      if (records.length === 0) return null;
      return Math.max(...records.map(r => r.score));
    };

    // 获取最近一次测验
    const getLatestRecord = (quizSetId: number): VLQuizRecord | null => {
      const records = recordsByQuizSet[quizSetId] ?? [];
      if (records.length === 0) return null;
      return records[0]; // 已按时间排序
    };

    // 应用列表配置
    const apps: AppItem[] = [
      {
        key: "outline",
        icon: <ListOrdered className="h-5 w-5" />,
        title: "学习大纲",
        description: "梳理学习路径",
        available: true,
        onClick: onOpenOutline,
      },
      {
        key: "highlights",
        icon: <Highlighter className="h-5 w-5" />,
        title: "重点提炼",
        description: "提取核心干货",
        available: true,
        onClick: onOpenHighlights,
      },
      {
        key: "article",
        icon: <FileText className="h-5 w-5" />,
        title: "文章生成",
        description: "生成可阅读长文",
        available: true,
        onClick: onOpenArticle,
      },
      {
        key: "mindmap",
        icon: <Network className="h-5 w-5" />,
        title: "思维导图",
        description: "可视化知识结构",
        available: true,
        onClick: onOpenMindMap,
      },
      {
        key: "ppt",
        icon: <Presentation className="h-5 w-5" />,
        title: "PPT",
        description: "高效汇报和演示",
        available: true,
        onClick: onOpenPPT,
      },
      {
        key: "report",
        icon: <FileBarChart className="h-5 w-5" />,
        title: "报告",
        description: "数据分析报告",
        available: true,
        onClick: onOpenReport,
      },
      {
        key: "quiz",
        icon: <CircleHelp className="h-5 w-5" />,
        title: "测验",
        description: "自测掌握程度",
        available: true,
        onClick: onOpenQuiz,
      },
      {
        key: "podcast",
        icon: <Mic className="h-5 w-5" />,
        title: "播客生成",
        description: "AI 生成对话播客",
        available: true,
        onClick: onOpenPodcast,
      },
    ];

    return (
      <div className="flex h-full flex-col">
        {/* 标题栏 */}
        <div className={classNames("shrink-0 border-b px-4 py-3", themeColors.borderClass)}>
          <h3 className={classNames("m-0 text-base font-semibold", themeColors.activeTextClass)}>
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
                    "cursor-pointer rounded-xl border p-4 backdrop-blur-sm transition-all",
                    app.available
                      ? [
                          themeColors.cardBgClass,
                          themeColors.cardBorderClass,
                          themeColors.hoverBorderClass,
                        ]
                      : [
                          "cursor-not-allowed opacity-50",
                          themeColors.tagBgClass,
                          themeColors.cardBorderClass,
                        ]
                  )}
                  onClick={app.available ? app.onClick : undefined}
                >
                  <div className="mb-1.5 flex items-center gap-2.5">
                    <span
                      className={
                        app.available ? themeColors.iconTextClass : themeColors.secondaryTextClass
                      }
                    >
                      {app.icon}
                    </span>
                    <span
                      className={classNames("text-sm font-semibold", themeColors.activeTextClass)}
                    >
                      {app.title}
                    </span>
                    {!app.available && (
                      <Pencil
                        className={classNames(
                          "ml-auto h-3.5 w-3.5",
                          themeColors.secondaryTextClass
                        )}
                      />
                    )}
                  </div>
                  <p className={classNames("m-0 text-xs", themeColors.secondaryTextClass)}>
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
            <h4 className={classNames("mb-3 text-sm font-semibold", themeColors.textClass)}>
              创作内容
            </h4>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2
                  className={classNames("h-6 w-6 animate-spin", themeColors.iconTextClass)}
                />
                <p className={classNames("mt-2 text-xs", themeColors.secondaryTextClass)}>
                  加载中...
                </p>
              </div>
            ) : notes.length === 0 ? (
              <div
                className={classNames(
                  "flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-8",
                  themeColors.cardBorderClass
                )}
              >
                <Inbox className={classNames("mb-2 h-10 w-10", themeColors.secondaryTextClass)} />
                <p className={classNames("text-sm", themeColors.secondaryTextClass)}>暂无笔记</p>
              </div>
            ) : (
              <div className="space-y-2">
                <AnimatePresence>
                  {notes.map((note, index) => (
                    <NoteListItem
                      key={note.id}
                      note={note}
                      index={index}
                      onClick={() => onEditNote(note)}
                      onAddToResources={e => handleAddNoteToResources(e, note)}
                      addingToResources={addingResourceNoteIds.includes(note.id)}
                      onDelete={e => handleDeleteNote(e, note)}
                      onEditPPT={onEditPPT}
                      onEditReport={onEditReport}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* 分隔线 */}
          <div className="px-4">
            <div className={classNames("border-t", themeColors.borderClass)} />
          </div>

          {/* 测验集区域 */}
          <div className="p-4">
            <h4 className={classNames("mb-3 text-sm font-semibold", themeColors.textClass)}>
              测验集
            </h4>

            {loadingQuizSets ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2
                  className={classNames("h-6 w-6 animate-spin", themeColors.iconTextClass)}
                />
                <p className={classNames("mt-2 text-xs", themeColors.secondaryTextClass)}>
                  加载中...
                </p>
              </div>
            ) : quizSets.length === 0 ? (
              <div
                className={classNames(
                  "flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-8",
                  themeColors.cardBorderClass
                )}
              >
                <Inbox className={classNames("mb-2 h-10 w-10", themeColors.secondaryTextClass)} />
                <p className={classNames("mb-3 text-sm", themeColors.secondaryTextClass)}>
                  暂无测验集
                </p>
                <button
                  type="button"
                  onClick={onOpenQuiz}
                  className={classNames(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                    themeColors.primaryButtonClass
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                  创建测验
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {quizSets.map((quizSet, index) => {
                    const bestScore = getBestScore(quizSet.id);
                    const latestRecord = getLatestRecord(quizSet.id);

                    return (
                      <motion.div
                        key={quizSet.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ delay: index * 0.03 }}
                        className={classNames(
                          "group rounded-xl border p-4 backdrop-blur-sm transition-all",
                          themeColors.cardBgClass,
                          themeColors.cardBorderClass,
                          themeColors.hoverBorderClass
                        )}
                      >
                        {/* 标题行 */}
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="shrink-0 text-xl">{quizSet.emoji}</span>
                            <span
                              className={classNames(
                                "truncate text-sm font-semibold",
                                themeColors.activeTextClass
                              )}
                            >
                              {quizSet.name}
                            </span>
                          </div>
                          <span
                            className={classNames(
                              "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium",
                              themeColors.tagBgClass,
                              themeColors.tagTextClass
                            )}
                          >
                            {quizSet.itemCount} 题
                          </span>
                        </div>

                        {/* 统计信息 */}
                        {(bestScore !== null || latestRecord) && (
                          <div
                            className={classNames(
                              "mb-3 flex items-center gap-4 pl-0.5 text-xs",
                              themeColors.secondaryTextClass
                            )}
                          >
                            {bestScore !== null && (
                              <span className="flex items-center gap-1.5">
                                <Trophy className="h-3.5 w-3.5 text-amber-500" />
                                最高 {bestScore.toFixed(0)}%
                              </span>
                            )}
                            {latestRecord && (
                              <span className="flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5" />
                                {formatDate(latestRecord.createTime, true)}
                              </span>
                            )}
                          </div>
                        )}

                        {/* 操作按钮 */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleStartTest(quizSet)}
                            disabled={quizSet.itemCount === 0}
                            className={classNames(
                              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                              themeColors.primaryButtonClass,
                              "disabled:cursor-not-allowed disabled:opacity-50"
                            )}
                          >
                            <Play className="h-3.5 w-3.5" />
                            测验
                          </button>
                          {(bestScore !== null || latestRecord !== null) && (
                            <button
                              type="button"
                              onClick={() => handleViewRecords(quizSet)}
                              title="查看测验记录"
                              className={classNames(
                                "flex h-7 w-7 items-center justify-center rounded-lg border transition-all",
                                themeColors.cardBorderClass,
                                themeColors.hoverClass,
                                themeColors.textClass
                              )}
                            >
                              <History className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(quizSet)}
                            title="编辑测验集"
                            className={classNames(
                              "flex h-7 w-7 items-center justify-center rounded-lg border transition-all",
                              "opacity-0 group-hover:opacity-100",
                              themeColors.cardBorderClass,
                              themeColors.hoverClass,
                              themeColors.textClass
                            )}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={e => handleDeleteQuizSet(e, quizSet)}
                            title="删除测验集"
                            className={classNames(
                              "flex h-7 w-7 items-center justify-center rounded-lg border transition-all",
                              "opacity-0 group-hover:opacity-100",
                              "border-red-200 dark:border-red-500/30",
                              "hover:bg-red-50 dark:hover:bg-red-500/10",
                              "text-red-500 dark:text-red-400"
                            )}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* 底部新建笔记按钮 */}
        <div className={classNames("shrink-0 border-t p-4", themeColors.borderClass)}>
          <button
            type="button"
            className={classNames(
              "flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-all",
              themeColors.cardBgClass,
              themeColors.cardBorderClass,
              themeColors.textClass,
              themeColors.hoverClass
            )}
            onClick={onCreateNote}
          >
            <Plus className="h-4 w-4" />
            <span>新建笔记</span>
          </button>
        </div>

        {/* 测验弹窗 */}
        <QuizTestModal open={showTestModal} quizSet={selectedQuizSet} onClose={handleCloseTest} />

        {/* 记录弹窗 */}
        <CustomModal
          open={showRecordsModal}
          title={
            selectedQuizSet ? (
              <div className="flex items-center gap-2">
                <span>{selectedQuizSet.emoji}</span>
                <span>{selectedQuizSet.name} - 测验记录</span>
              </div>
            ) : (
              "测验记录"
            )
          }
          onCancel={handleCloseRecords}
          width={500}
          footer={null}
        >
          {selectedQuizSet && (
            <QuizRecordsList
              records={recordsByQuizSet[selectedQuizSet.id] ?? []}
              loading={loadingRecords}
            />
          )}
        </CustomModal>

        {/* 编辑弹窗 */}
        <QuizEditModal open={showEditModal} quizSet={selectedQuizSet} onClose={handleCloseEdit} />

        <ConfirmDialog
          open={pendingConfirm !== null}
          onOpenChange={next => {
            if (!next) setPendingConfirm(null);
          }}
          title={pendingConfirm?.title ?? ""}
          description={pendingConfirm?.description ?? ""}
          danger
          confirmText="删除"
          onConfirm={async () => {
            const pending = pendingConfirm;
            setPendingConfirm(null);
            await pending?.action();
          }}
        />
      </div>
    );
  })
);

// 记录列表组件
interface QuizRecordsListProps {
  records: VLQuizRecord[];
  loading: boolean;
}

const QuizRecordsList = memo((props: QuizRecordsListProps) => {
  const { records, loading } = props;
  const themeColors = useThemeColors();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className={classNames("h-8 w-8 animate-spin", themeColors.iconTextClass)} />
        <p className={classNames("mt-3 text-sm", themeColors.secondaryTextClass)}>加载中...</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Inbox className={classNames("mb-3 h-12 w-12", themeColors.secondaryTextClass)} />
        <p className={classNames("text-sm", themeColors.secondaryTextClass)}>暂无测验记录</p>
      </div>
    );
  }

  const getScoreLevel = (score: number) => {
    if (score >= 90) return "excellent";
    if (score >= 70) return "good";
    if (score >= 60) return "pass";
    return "fail";
  };

  const levelConfig = {
    excellent: {
      text: "text-status-success",
      bg: "bg-[var(--th-success)]/10",
      border: "border-[var(--th-success)]/30",
    },
    good: {
      text: "text-status-info",
      bg: "bg-[var(--th-info)]/10",
      border: "border-[var(--th-info)]/30",
    },
    pass: {
      text: "text-status-warning",
      bg: "bg-[var(--th-warning)]/10",
      border: "border-[var(--th-warning)]/30",
    },
    fail: {
      text: "text-status-error",
      bg: "bg-[var(--th-danger)]/10",
      border: "border-[var(--th-danger)]/30",
    },
  };

  return (
    <div className="space-y-3">
      <AnimatePresence>
        {records.map((record, index) => {
          const scoreLevel = getScoreLevel(record.score);
          const config = levelConfig[scoreLevel];

          return (
            <motion.div
              key={record.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ delay: index * 0.05 }}
              className={classNames(
                "flex items-center justify-between rounded-xl border p-4",
                config.bg,
                config.border
              )}
            >
              <div className="flex items-center gap-4">
                <div className={classNames("text-2xl font-bold tabular-nums", config.text)}>
                  {record.score.toFixed(0)}%
                </div>
                <div className="flex flex-col gap-0.5">
                  <span
                    className={classNames(
                      "flex items-center gap-1.5 text-sm font-medium",
                      themeColors.activeTextClass
                    )}
                  >
                    <CheckCircle2 className="text-status-success h-4 w-4" />
                    {record.correctCount}/{record.totalCount} 题正确
                  </span>
                  <span
                    className={classNames(
                      "flex items-center gap-1.5 text-xs",
                      themeColors.secondaryTextClass
                    )}
                  >
                    <Clock className="h-3 w-3" />
                    用时 {Math.floor(record.duration / 60)}分{record.duration % 60}秒
                  </span>
                </div>
              </div>
              <div className={classNames("text-xs font-medium", themeColors.secondaryTextClass)}>
                {formatDate(record.createTime, true)}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
});

QuizRecordsList.displayName = "QuizRecordsList";

// 笔记列表项组件
interface NoteListItemProps {
  note: VLNote;
  index: number;
  onClick: () => void;
  onAddToResources: (e: React.MouseEvent) => void;
  addingToResources: boolean;
  onDelete: (e: React.MouseEvent) => void;
  onEditPPT?: (note: VLNote) => void;
  onEditReport?: (note: VLNote) => void;
}

const NoteListItem = memo((props: NoteListItemProps) => {
  const {
    note,
    index,
    onClick,
    onAddToResources,
    addingToResources,
    onDelete,
    onEditPPT,
    onEditReport,
  } = props;
  const themeColors = useThemeColors();

  // 检查是否是 PPT 类型
  const isPPT = note.type === "ppt";

  // 检查是否是报告类型
  const isReport = note.type === "report";

  // 检查是否正在生成
  const isGenerating = useOutlineGenerationStore(state => state.generatingNoteIds.has(note.id));

  // 播客数据（仅播客类型笔记需要）
  const [podcast, setPodcast] = useState<IPodcast | null>(null);
  const isPodcast = note.type === "podcast";

  // 加载播客数据
  useEffect(() => {
    if (isPodcast && note.podcastId) {
      getPodcastById(note.podcastId).then(setPodcast);
    }
  }, [isPodcast, note.podcastId]);

  // 根据笔记类型选择图标
  const getNoteIcon = () => {
    switch (note.type) {
      case "outline":
        return ListOrdered;
      case "highlights":
        return Highlighter;
      case "article":
        return FileText;
      case "mindmap":
        return Network;
      case "ppt":
        return Presentation;
      case "report":
        return FileBarChart;
      case "podcast":
        return Mic;
      default:
        return Pencil;
    }
  };
  const NoteIcon = getNoteIcon();

  // 播客类型笔记的渲染
  if (isPodcast) {
    return (
      <motion.div
        key={note.id}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 10 }}
        transition={{ delay: index * 0.03 }}
        className={classNames(
          "group rounded-xl border backdrop-blur-sm transition-all",
          themeColors.cardBgClass,
          themeColors.cardBorderClass
        )}
      >
        {/* 标题行 */}
        <div
          className={classNames(
            "flex cursor-pointer items-center gap-2.5 p-3",
            themeColors.hoverClass,
            "rounded-t-xl"
          )}
          onClick={onClick}
        >
          <Mic className={classNames("h-4 w-4 shrink-0", themeColors.iconTextClass)} />
          <span
            className={classNames(
              "flex-1 truncate text-sm font-medium",
              themeColors.activeTextClass
            )}
          >
            {note.title || "无标题播客"}
          </span>
          <button
            type="button"
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-gray-400 transition-all hover:bg-[var(--th-accent-soft)] hover:text-[var(--th-active-text)]"
            onClick={onAddToResources}
            title="添加到资源列表"
          >
            {addingToResources ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-gray-400 transition-all hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
            onClick={onDelete}
            title="删除笔记"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        {/* 播客播放器 */}
        {podcast && (
          <div className="px-3 pb-3" onClick={e => e.stopPropagation()}>
            <PodcastPlayer defaultPodcast={podcast} compact />
          </div>
        )}
        {!podcast && note.podcastId && (
          <div className="px-3 pb-3">
            <div className="flex items-center justify-center py-2">
              <Loader2
                className={classNames("h-4 w-4 animate-spin", themeColors.secondaryTextClass)}
              />
            </div>
          </div>
        )}
      </motion.div>
    );
  }

  // 其他类型笔记的渲染
  return (
    <motion.div
      key={note.id}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{ delay: index * 0.03 }}
      className={classNames(
        "group cursor-pointer rounded-xl border p-3 backdrop-blur-sm transition-all",
        themeColors.cardBgClass,
        themeColors.cardBorderClass,
        themeColors.hoverBorderClass
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-2.5">
        {isGenerating ? (
          <Loader2 className={classNames("text-status-info h-4 w-4 shrink-0 animate-spin")} />
        ) : (
          <NoteIcon className={classNames("h-4 w-4 shrink-0", themeColors.secondaryTextClass)} />
        )}
        <span
          className={classNames("flex-1 truncate text-sm font-medium", themeColors.activeTextClass)}
        >
          {note.title || "无标题笔记"}
          {isGenerating && (
            <span className="text-status-info ml-2 text-xs font-normal">生成中...</span>
          )}
        </span>
        <div className="relative flex shrink-0 items-center gap-1">
          {/* PPT 类型显示 AI 编辑按钮 */}
          {isPPT && onEditPPT && !isGenerating && (
            <button
              type="button"
              className="flex h-6 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent px-2 text-xs font-medium text-gray-400 opacity-0 transition-all hover:bg-[var(--th-accent-soft)] hover:text-[var(--th-active-text)] group-hover:opacity-100"
              onClick={e => {
                e.stopPropagation();
                onEditPPT(note);
              }}
              title="AI 编辑"
            >
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              AI 编辑
            </button>
          )}
          {/* 报告类型显示 AI 编辑按钮 */}
          {isReport && onEditReport && !isGenerating && (
            <button
              type="button"
              className="flex h-6 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent px-2 text-xs font-medium text-gray-400 opacity-0 transition-all hover:bg-[var(--th-accent-soft)] hover:text-[var(--th-active-text)] group-hover:opacity-100"
              onClick={e => {
                e.stopPropagation();
                onEditReport(note);
              }}
              title="AI 编辑"
            >
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              AI 编辑
            </button>
          )}
          <span
            className={classNames(
              "text-xs transition-opacity",
              themeColors.secondaryTextClass,
              (isPPT && onEditPPT) || (isReport && onEditReport) ? "group-hover:opacity-0" : ""
            )}
          >
            {formatDate(note.updateTime, true)}
          </span>
          {!isGenerating && (
            <button
              type="button"
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-gray-400 transition-all hover:bg-[var(--th-accent-soft)] hover:text-[var(--th-active-text)]"
              onClick={onAddToResources}
              title="添加到资源列表"
            >
              {addingToResources ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </button>
          )}
          {!isGenerating && (
            <button
              type="button"
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-gray-400 transition-all hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
              onClick={onDelete}
              title="删除笔记"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
});

NoteListItem.displayName = "NoteListItem";

AppListView.displayName = "AppListView";

export default AppListView;

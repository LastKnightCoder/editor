import { memo, useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Plus,
  Play,
  Trash2,
  Pencil,
  Trophy,
  Clock,
  History,
  CheckCircle2,
  Loader2,
  Inbox,
} from "lucide-react";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";

import CustomModal from "@/components/CustomModal";
import useVLQuizStore from "@/stores/useVLQuizStore";
import type { VLQuizSet, VLQuizRecord } from "@/types";
import { formatDate } from "@/utils";
import QuizGenerateModal from "./QuizGenerateModal";
import QuizTestModal from "./QuizTestModal";
import QuizEditModal from "./QuizEditModal";
import { toast, ConfirmDialog } from "@tau/ui";

interface QuizAppProps {
  projectId: number;
  mainDbName: string;
  onBack: () => void;
}

const QuizApp = memo((props: QuizAppProps) => {
  const { projectId, mainDbName, onBack } = props;

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

  // Local state
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [showRecordsModal, setShowRecordsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedQuizSet, setSelectedQuizSet] = useState<VLQuizSet | null>(null);

  // 获取当前项目的测验集
  const quizSets = useMemo(
    () => quizSetsByProject[projectId] ?? [],
    [quizSetsByProject, projectId]
  );

  // 初始化
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

  // 打开生成弹窗
  const handleOpenGenerate = useMemoizedFn(() => {
    setShowGenerateModal(true);
  });

  // 关闭生成弹窗
  const handleCloseGenerate = useMemoizedFn(() => {
    setShowGenerateModal(false);
    // 刷新列表
    fetchQuizSets(projectId);
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
  const [deleteQuizSetConfirm, setDeleteQuizSetConfirm] = useState<VLQuizSet | null>(null);
  const handleDeleteQuizSet = useMemoizedFn((quizSet: VLQuizSet) => {
    setDeleteQuizSetConfirm(quizSet);
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

  return (
    <div className="flex h-full flex-col">
      {/* 顶部栏 */}
      <div
        className={classNames(
          "flex shrink-0 items-center gap-3 border-b px-4 py-3",
          "border-line-1"
        )}
      >
        <button
          className={classNames(
            "flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent transition-all",
            "hover:bg-hover",
            "text-ink-1"
          )}
          onClick={onBack}
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={1.75} />
        </button>

        <h3 className={classNames("m-0 flex-1 text-base font-semibold", "text-accent-text")}>
          测验
        </h3>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto p-4">
        {loadingQuizSets ? (
          <div className="flex h-full flex-col items-center justify-center">
            <Loader2
              className={classNames("h-8 w-8 animate-spin", "text-accent-text")}
              strokeWidth={1.75}
            />
            <p className={classNames("mt-4 text-sm", "text-ink-2")}>加载中...</p>
          </div>
        ) : quizSets.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center">
            <div
              className={classNames(
                "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-8 py-12",
                "border-line-1"
              )}
            >
              <Inbox className={classNames("mb-4 h-16 w-16", "text-ink-2")} strokeWidth={1.75} />
              <p className={classNames("mb-6 text-base", "text-ink-2")}>暂无测验集</p>
              <button
                type="button"
                onClick={handleOpenGenerate}
                className={classNames(
                  "flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all",
                  "bg-accent hover:bg-accent-hover text-white"
                )}
              >
                <Plus className="h-4 w-4" strokeWidth={1.75} />
                创建测验
              </button>
            </div>
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
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.05 }}
                    className={classNames(
                      "group rounded-xl border p-4 backdrop-blur-sm transition-all",
                      "bg-surface",
                      "border-line-1",
                      "hover:border-line-1"
                    )}
                  >
                    {/* 标题行 */}
                    <div className="mb-2 flex items-center gap-3">
                      <span className="text-xl">{quizSet.emoji}</span>
                      <span
                        className={classNames(
                          "flex-1 truncate text-sm font-semibold",
                          "text-accent-text"
                        )}
                      >
                        {quizSet.name}
                      </span>
                      <span
                        className={classNames(
                          "rounded-md px-2 py-0.5 text-xs font-medium",
                          "bg-group",
                          "text-ink-2"
                        )}
                      >
                        {quizSet.itemCount} 题
                      </span>
                    </div>

                    {/* 描述 */}
                    {quizSet.description && (
                      <p className={classNames("mb-3 line-clamp-2 text-xs", "text-ink-2")}>
                        {quizSet.description}
                      </p>
                    )}

                    {/* 统计信息 */}
                    {(bestScore !== null || latestRecord) && (
                      <div
                        className={classNames("mb-3 flex items-center gap-4 text-xs", "text-ink-2")}
                      >
                        {bestScore !== null && (
                          <span className="flex items-center gap-1.5">
                            <Trophy className="h-3.5 w-3.5 text-amber-500" strokeWidth={1.75} />
                            最高 {bestScore.toFixed(0)}%
                          </span>
                        )}
                        {latestRecord && (
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
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
                          "bg-accent hover:bg-accent-hover text-white",
                          "disabled:cursor-not-allowed disabled:opacity-50"
                        )}
                      >
                        <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
                        开始测验
                      </button>
                      {(bestScore !== null || latestRecord !== null) && (
                        <button
                          type="button"
                          onClick={() => handleViewRecords(quizSet)}
                          title="查看测验记录"
                          className={classNames(
                            "flex h-8 w-8 items-center justify-center rounded-lg border transition-all",
                            "border-line-1",
                            "hover:bg-hover",
                            "text-ink-1"
                          )}
                        >
                          <History className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(quizSet)}
                        title="编辑测验集"
                        className={classNames(
                          "flex h-8 w-8 items-center justify-center rounded-lg border transition-all",
                          "opacity-0 group-hover:opacity-100",
                          "border-line-1",
                          "hover:bg-hover",
                          "text-ink-1"
                        )}
                      >
                        <Pencil className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteQuizSet(quizSet)}
                        title="删除测验集"
                        className={classNames(
                          "flex h-8 w-8 items-center justify-center rounded-lg border transition-all",
                          "opacity-0 group-hover:opacity-100",
                          "border-red-200",
                          "hover:bg-danger-soft",
                          "text-danger"
                        )}
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* 底部新建按钮 */}
      {quizSets.length > 0 && (
        <div className={classNames("shrink-0 border-t p-4", "border-line-1")}>
          <button
            type="button"
            onClick={handleOpenGenerate}
            className={classNames(
              "flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-all",
              "border-line-1",
              "bg-surface",
              "text-ink-1",
              "hover:bg-hover"
            )}
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            创建新测验
          </button>
        </div>
      )}

      {/* 生成弹窗 */}
      <QuizGenerateModal
        open={showGenerateModal}
        projectId={projectId}
        mainDbName={mainDbName}
        onClose={handleCloseGenerate}
      />

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
        open={deleteQuizSetConfirm !== null}
        onOpenChange={next => {
          if (!next) setDeleteQuizSetConfirm(null);
        }}
        title="删除测验集"
        description={
          deleteQuizSetConfirm
            ? `确定要删除"${deleteQuizSetConfirm.name}"吗？相关的测验记录也会被删除。`
            : ""
        }
        danger
        confirmText="删除"
        onConfirm={async () => {
          const quizSet = deleteQuizSetConfirm;
          setDeleteQuizSetConfirm(null);
          if (!quizSet) return;
          try {
            await deleteQuizSet(quizSet.id);
            toast.success("测验集已删除");
          } catch (error) {
            toast.error("删除失败");
          }
        }}
      />
    </div>
  );
});

// 记录列表组件
interface QuizRecordsListProps {
  records: VLQuizRecord[];
  loading: boolean;
}

const QuizRecordsList = memo((props: QuizRecordsListProps) => {
  const { records, loading } = props;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2
          className={classNames("h-8 w-8 animate-spin", "text-accent-text")}
          strokeWidth={1.75}
        />
        <p className={classNames("mt-3 text-sm", "text-ink-2")}>加载中...</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Inbox className={classNames("mb-3 h-12 w-12", "text-ink-2")} strokeWidth={1.75} />
        <p className={classNames("text-sm", "text-ink-2")}>暂无测验记录</p>
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
      bg: "bg-ok/10",
      border: "border-ok/30",
    },
    good: {
      text: "text-status-info",
      bg: "bg-info/10",
      border: "border-info/30",
    },
    pass: {
      text: "text-status-warning",
      bg: "bg-warn-soft",
      border: "border-warn/30",
    },
    fail: {
      text: "text-status-error",
      bg: "bg-danger/10",
      border: "border-danger/30",
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
                      "text-accent-text"
                    )}
                  >
                    <CheckCircle2 className="text-status-success h-4 w-4" strokeWidth={1.75} />
                    {record.correctCount}/{record.totalCount} 题正确
                  </span>
                  <span className={classNames("flex items-center gap-1.5 text-xs", "text-ink-2")}>
                    <Clock className="h-3 w-3" strokeWidth={1.75} />
                    用时 {Math.floor(record.duration / 60)}分{record.duration % 60}秒
                  </span>
                </div>
              </div>
              <div className={classNames("text-xs font-medium", "text-ink-2")}>
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

QuizApp.displayName = "QuizApp";

export default QuizApp;

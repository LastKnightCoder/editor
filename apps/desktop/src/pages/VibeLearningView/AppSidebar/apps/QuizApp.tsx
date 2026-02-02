import { memo, useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { App } from "antd";
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
import useThemeColors from "@/hooks/useThemeColors";
import useVLQuizStore from "@/stores/useVLQuizStore";
import type { VLQuizSet, VLQuizRecord } from "@/types";
import { formatDate } from "@/utils";
import QuizGenerateModal from "./QuizGenerateModal";
import QuizTestModal from "./QuizTestModal";
import QuizEditModal from "./QuizEditModal";

interface QuizAppProps {
  projectId: number;
  mainDbName: string;
  onBack: () => void;
}

const QuizApp = memo((props: QuizAppProps) => {
  const { projectId, mainDbName, onBack } = props;
  const { modal, message } = App.useApp();
  const themeColors = useThemeColors();

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
  const [selectedQuizSet, setSelectedQuizSet] = useState<VLQuizSet | null>(
    null,
  );

  // 获取当前项目的测验集
  const quizSets = useMemo(
    () => quizSetsByProject[projectId] ?? [],
    [quizSetsByProject, projectId],
  );

  // 初始化
  useEffect(() => {
    setCurrentProject(projectId);
    fetchQuizSets(projectId);
  }, [projectId, setCurrentProject, fetchQuizSets]);

  // 为每个测验集加载记录（用于显示最佳成绩）
  useEffect(() => {
    quizSets.forEach((quizSet) => {
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
      message.error((error as Error).message || "无法开始测验");
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
  const handleDeleteQuizSet = useMemoizedFn((quizSet: VLQuizSet) => {
    modal.confirm({
      title: "删除测验集",
      content: `确定要删除"${quizSet.name}"吗？相关的测验记录也会被删除。`,
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteQuizSet(quizSet.id);
          message.success("测验集已删除");
        } catch (error) {
          message.error("删除失败");
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
    return Math.max(...records.map((r) => r.score));
  };

  // 获取最近一次测验
  const getLatestRecord = (quizSetId: number): VLQuizRecord | null => {
    const records = recordsByQuizSet[quizSetId] ?? [];
    if (records.length === 0) return null;
    return records[0]; // 已按时间排序
  };

  return (
    <div className="flex flex-col h-full">
      {/* 顶部栏 */}
      <div
        className={classNames(
          "px-4 py-3 border-b shrink-0 flex items-center gap-3",
          themeColors.borderClass,
        )}
      >
        <button
          className={classNames(
            "flex items-center justify-center w-8 h-8 rounded-lg transition-all cursor-pointer border-none bg-transparent",
            themeColors.hoverClass,
            themeColors.textClass,
          )}
          onClick={onBack}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <h3
          className={classNames(
            "flex-1 text-base font-semibold m-0",
            themeColors.activeTextClass,
          )}
        >
          测验
        </h3>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto p-4">
        {loadingQuizSets ? (
          <div className="flex flex-col items-center justify-center h-full">
            <Loader2
              className={classNames(
                "w-8 h-8 animate-spin",
                themeColors.iconTextClass,
              )}
            />
            <p
              className={classNames(
                "text-sm mt-4",
                themeColors.secondaryTextClass,
              )}
            >
              加载中...
            </p>
          </div>
        ) : quizSets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div
              className={classNames(
                "flex flex-col items-center justify-center py-12 px-8 rounded-2xl border-2 border-dashed",
                themeColors.cardBorderClass,
              )}
            >
              <Inbox
                className={classNames(
                  "w-16 h-16 mb-4",
                  themeColors.secondaryTextClass,
                )}
              />
              <p
                className={classNames(
                  "text-base mb-6",
                  themeColors.secondaryTextClass,
                )}
              >
                暂无测验集
              </p>
              <button
                type="button"
                onClick={handleOpenGenerate}
                className={classNames(
                  "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all",
                  themeColors.primaryButtonClass,
                )}
              >
                <Plus className="w-4 h-4" />
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
                      "group p-4 rounded-xl border backdrop-blur-sm transition-all",
                      themeColors.cardBgClass,
                      themeColors.cardBorderClass,
                      themeColors.hoverBorderClass,
                    )}
                  >
                    {/* 标题行 */}
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xl">{quizSet.emoji}</span>
                      <span
                        className={classNames(
                          "flex-1 text-sm font-semibold truncate",
                          themeColors.activeTextClass,
                        )}
                      >
                        {quizSet.name}
                      </span>
                      <span
                        className={classNames(
                          "px-2 py-0.5 rounded-md text-xs font-medium",
                          themeColors.tagBgClass,
                          themeColors.tagTextClass,
                        )}
                      >
                        {quizSet.itemCount} 题
                      </span>
                    </div>

                    {/* 描述 */}
                    {quizSet.description && (
                      <p
                        className={classNames(
                          "text-xs mb-3 line-clamp-2",
                          themeColors.secondaryTextClass,
                        )}
                      >
                        {quizSet.description}
                      </p>
                    )}

                    {/* 统计信息 */}
                    {(bestScore !== null || latestRecord) && (
                      <div
                        className={classNames(
                          "flex items-center gap-4 text-xs mb-3",
                          themeColors.secondaryTextClass,
                        )}
                      >
                        {bestScore !== null && (
                          <span className="flex items-center gap-1.5">
                            <Trophy className="w-3.5 h-3.5 text-amber-500" />
                            最高 {bestScore.toFixed(0)}%
                          </span>
                        )}
                        {latestRecord && (
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
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
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                          themeColors.primaryButtonClass,
                          "disabled:opacity-50 disabled:cursor-not-allowed",
                        )}
                      >
                        <Play className="w-3.5 h-3.5" />
                        开始测验
                      </button>
                      {(bestScore !== null || latestRecord !== null) && (
                        <button
                          type="button"
                          onClick={() => handleViewRecords(quizSet)}
                          title="查看测验记录"
                          className={classNames(
                            "flex items-center justify-center w-8 h-8 rounded-lg border transition-all",
                            themeColors.cardBorderClass,
                            themeColors.hoverClass,
                            themeColors.textClass,
                          )}
                        >
                          <History className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(quizSet)}
                        title="编辑测验集"
                        className={classNames(
                          "flex items-center justify-center w-8 h-8 rounded-lg border transition-all",
                          "opacity-0 group-hover:opacity-100",
                          themeColors.cardBorderClass,
                          themeColors.hoverClass,
                          themeColors.textClass,
                        )}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteQuizSet(quizSet)}
                        title="删除测验集"
                        className={classNames(
                          "flex items-center justify-center w-8 h-8 rounded-lg border transition-all",
                          "opacity-0 group-hover:opacity-100",
                          "border-red-200 dark:border-red-500/30",
                          "hover:bg-red-50 dark:hover:bg-red-500/10",
                          "text-red-500 dark:text-red-400",
                        )}
                      >
                        <Trash2 className="w-4 h-4" />
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
        <div
          className={classNames(
            "p-4 border-t shrink-0",
            themeColors.borderClass,
          )}
        >
          <button
            type="button"
            onClick={handleOpenGenerate}
            className={classNames(
              "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all border",
              themeColors.cardBorderClass,
              themeColors.cardBgClass,
              themeColors.textClass,
              themeColors.hoverClass,
            )}
          >
            <Plus className="w-4 h-4" />
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
      <QuizTestModal
        open={showTestModal}
        quizSet={selectedQuizSet}
        onClose={handleCloseTest}
      />

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
      <QuizEditModal
        open={showEditModal}
        quizSet={selectedQuizSet}
        onClose={handleCloseEdit}
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
  const themeColors = useThemeColors();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2
          className={classNames(
            "w-8 h-8 animate-spin",
            themeColors.iconTextClass,
          )}
        />
        <p
          className={classNames("text-sm mt-3", themeColors.secondaryTextClass)}
        >
          加载中...
        </p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Inbox
          className={classNames(
            "w-12 h-12 mb-3",
            themeColors.secondaryTextClass,
          )}
        />
        <p className={classNames("text-sm", themeColors.secondaryTextClass)}>
          暂无测验记录
        </p>
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
      text: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-500/10",
      border: "border-emerald-200 dark:border-emerald-500/30",
    },
    good: {
      text: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-500/10",
      border: "border-blue-200 dark:border-blue-500/30",
    },
    pass: {
      text: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-500/10",
      border: "border-amber-200 dark:border-amber-500/30",
    },
    fail: {
      text: "text-red-600 dark:text-red-400",
      bg: "bg-red-50 dark:bg-red-500/10",
      border: "border-red-200 dark:border-red-500/30",
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
                "flex items-center justify-between p-4 rounded-xl border",
                config.bg,
                config.border,
              )}
            >
              <div className="flex items-center gap-4">
                <div
                  className={classNames(
                    "text-2xl font-bold tabular-nums",
                    config.text,
                  )}
                >
                  {record.score.toFixed(0)}%
                </div>
                <div className="flex flex-col gap-0.5">
                  <span
                    className={classNames(
                      "flex items-center gap-1.5 text-sm font-medium",
                      themeColors.activeTextClass,
                    )}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    {record.correctCount}/{record.totalCount} 题正确
                  </span>
                  <span
                    className={classNames(
                      "flex items-center gap-1.5 text-xs",
                      themeColors.secondaryTextClass,
                    )}
                  >
                    <Clock className="w-3 h-3" />
                    用时 {Math.floor(record.duration / 60)}分
                    {record.duration % 60}秒
                  </span>
                </div>
              </div>
              <div
                className={classNames(
                  "text-xs font-medium",
                  themeColors.secondaryTextClass,
                )}
              >
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

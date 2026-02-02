import { memo, useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  RefreshCw,
  CheckCircle2,
  Check,
  Loader2,
  Inbox,
  Sparkles,
  Search,
  BookOpen,
} from "lucide-react";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";
import { App } from "antd";

import CustomModal from "@/components/CustomModal";
import useQuizGeneration from "@/hooks/useQuizGeneration";
import useLLMConfig from "@/hooks/useLLMConfig";
import useVLQuizStore from "@/stores/useVLQuizStore";
import { getVLResourcesByProjectId } from "@/commands/vibe-learning";
import toolRegistry from "@/tools";
import {
  createVibeLearningSearchTool,
  createListResourcesTool,
  createReadResourceContentTool,
  createReadResourceRangeTool,
} from "@/tools/vibeLearningSearchTool";
import type { VLResource } from "@/types/vibe-learning";
import type {
  GeneratedQuizItem,
  CreateVLQuizItemInput,
  ToolCallExecutionState,
} from "@/types";
import { FLASHCARD_TYPE_META } from "@/utils/flashcard";

interface QuizGenerateModalProps {
  open: boolean;
  projectId: number;
  mainDbName: string;
  onClose: () => void;
}

type Step = "select-resources" | "generating" | "preview";

const QuizGenerateModal = memo((props: QuizGenerateModalProps) => {
  const { open, projectId, mainDbName, onClose } = props;
  const { message } = App.useApp();

  // LLM 配置
  const { providerConfig, modelConfig } = useLLMConfig("chat");

  // Quiz store
  const { createQuizSet, createItemsBatch } = useVLQuizStore();

  // 工具调用状态
  const [localToolExecutions, setLocalToolExecutions] = useState<
    ToolCallExecutionState[]
  >([]);

  // Quiz generation hook（启用工具模式）
  const {
    generatedItems,
    isGenerating,
    error: generationError,
    startGenerationWithTools,
    stopGeneration,
    toggleItemSelection,
    selectAll,
    deselectAll,
    reset: resetGeneration,
  } = useQuizGeneration(providerConfig, modelConfig, {
    enableTools: true,
    onToolCallsUpdate: (executions) => {
      setLocalToolExecutions(executions);
    },
  });

  // 注册 VibeLearning 专属工具
  useEffect(() => {
    if (!open) return;

    const sourceId = `quiz-generation-${projectId}`;

    // 注册项目专属工具
    const tools = [
      createVibeLearningSearchTool(projectId, mainDbName),
      createListResourcesTool(projectId),
      createReadResourceContentTool(projectId, mainDbName),
      createReadResourceRangeTool(projectId, mainDbName),
    ];
    toolRegistry.registerTools(sourceId, tools, true);

    return () => {
      // 清理工具
      toolRegistry.unregisterSource(sourceId);
    };
  }, [open, projectId, mainDbName]);

  // Local state
  const [step, setStep] = useState<Step>("select-resources");
  const [resources, setResources] = useState<VLResource[]>([]);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const [userPrompt, setUserPrompt] = useState("");
  const [quizName, setQuizName] = useState("");
  const [loadingResources, setLoadingResources] = useState(false);
  const [saving, setSaving] = useState(false);

  // 获取选中的测验题数量
  const selectedCount = useMemo(
    () => generatedItems.filter((item) => item.selected).length,
    [generatedItems],
  );

  // 重置状态
  const resetState = useMemoizedFn(() => {
    setStep("select-resources");
    setSelectedResourceIds([]);
    setUserPrompt("");
    setQuizName("");
    setLocalToolExecutions([]);
    resetGeneration();
  });

  // 加载资源列表
  const loadResources = useMemoizedFn(async () => {
    setLoadingResources(true);
    try {
      const data = await getVLResourcesByProjectId(projectId);
      // 过滤出已完成处理的资源
      const readyResources = data.filter((r) => r.markdownPath);
      setResources(readyResources);
      // 默认全选
      setSelectedResourceIds(readyResources.map((r) => r.id));
    } catch (error) {
      console.error("Failed to load resources:", error);
      message.error("加载资源失败");
    } finally {
      setLoadingResources(false);
    }
  });

  // 打开弹窗时加载资源
  useEffect(() => {
    if (open) {
      resetState();
      loadResources();
    }
  }, [open, loadResources, resetState]);

  // 切换资源选择
  const handleToggleResource = useMemoizedFn((resourceId: number) => {
    setSelectedResourceIds((prev) =>
      prev.includes(resourceId)
        ? prev.filter((id) => id !== resourceId)
        : [...prev, resourceId],
    );
  });

  // 全选/取消全选资源
  const handleToggleAllResources = useMemoizedFn(() => {
    if (selectedResourceIds.length === resources.length) {
      setSelectedResourceIds([]);
    } else {
      setSelectedResourceIds(resources.map((r) => r.id));
    }
  });

  // 获取选中资源的名称列表
  const getSelectedResourceNames = useMemoizedFn((): string[] => {
    return resources
      .filter((r) => selectedResourceIds.includes(r.id))
      .map((r) => r.name);
  });

  // 开始生成测验（使用工具模式，AI 自主获取资料内容）
  const handleStartGenerate = useMemoizedFn(async () => {
    if (selectedResourceIds.length === 0) {
      message.error("请选择至少一个资源");
      return;
    }

    setStep("generating");
    setLocalToolExecutions([]);

    // 获取选中的资源名称列表，传递给 AI
    const resourceNames = getSelectedResourceNames();
    // 使用工具模式生成，AI 会自主调用工具获取资料内容
    startGenerationWithTools(resourceNames, userPrompt || undefined);
  });

  // 监听生成完成
  useEffect(() => {
    if (step === "generating" && !isGenerating && generatedItems.length > 0) {
      setStep("preview");
      // 默认测验名称
      if (!quizName) {
        const selectedResources = resources.filter((r) =>
          selectedResourceIds.includes(r.id),
        );
        if (selectedResources.length === 1) {
          setQuizName(`${selectedResources[0].name} 测验`);
        } else {
          setQuizName(`测验 - ${new Date().toLocaleDateString()}`);
        }
      }
    }
  }, [
    step,
    isGenerating,
    generatedItems,
    quizName,
    resources,
    selectedResourceIds,
  ]);

  // 保存测验集
  const handleSave = useMemoizedFn(async () => {
    const selectedItems = generatedItems.filter((item) => item.selected);
    if (selectedItems.length === 0) {
      message.error("请选择至少一道题目");
      return;
    }

    if (!quizName.trim()) {
      message.error("请输入测验名称");
      return;
    }

    setSaving(true);
    try {
      // 创建测验集
      const quizSet = await createQuizSet({
        projectId,
        name: quizName.trim(),
        emoji: "📝",
        resourceIds: selectedResourceIds,
        prompt: userPrompt || undefined,
      });

      // 批量创建测验题
      const items: CreateVLQuizItemInput[] = selectedItems.map(
        (item, index) => ({
          quizSetId: quizSet.id,
          type: item.type,
          prompt: item.prompt,
          detail: item.detail,
          data: item.data,
          tags: item.tags,
          difficulty: item.difficulty,
          sortOrder: index,
        }),
      );

      await createItemsBatch(items);

      message.success("测验创建成功");
      onClose();
    } catch (error) {
      console.error("Failed to save quiz:", error);
      message.error("保存失败");
    } finally {
      setSaving(false);
    }
  });

  // 停止生成
  const handleStopGenerate = useMemoizedFn(() => {
    stopGeneration();
    if (generatedItems.length > 0) {
      setStep("preview");
    } else {
      setStep("select-resources");
    }
  });

  // 重新生成
  const handleRegenerate = useMemoizedFn(() => {
    resetGeneration();
    setStep("select-resources");
  });

  // 渲染资源选择步骤
  const renderResourceSelect = () => (
    <div className="space-y-5">
      {/* 资源列表 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
            选择资源
          </label>
          <button
            type="button"
            onClick={handleToggleAllResources}
            className="text-xs font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
          >
            {selectedResourceIds.length === resources.length
              ? "取消全选"
              : "全选"}
          </button>
        </div>

        {loadingResources ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
              加载资源中...
            </p>
          </div>
        ) : resources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <Inbox className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              暂无可用资源
            </p>
          </div>
        ) : (
          <div className="max-h-56 overflow-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            {resources.map((resource, index) => {
              const isSelected = selectedResourceIds.includes(resource.id);
              return (
                <motion.div
                  key={resource.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                  className={classNames(
                    "flex items-center gap-3 px-4 py-3 cursor-pointer transition-all",
                    "border-b border-gray-100 dark:border-gray-700/50 last:border-b-0",
                    isSelected
                      ? "bg-blue-50 dark:bg-blue-500/10"
                      : "hover:bg-gray-100 dark:hover:bg-gray-700/50",
                  )}
                  onClick={() => handleToggleResource(resource.id)}
                >
                  <div
                    className={classNames(
                      "shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                      isSelected
                        ? "bg-blue-500 border-blue-500"
                        : "border-gray-300 dark:border-gray-600",
                    )}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <FileText className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
                  <span className="flex-1 text-sm text-gray-700 dark:text-gray-200 truncate">
                    {resource.name}
                  </span>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* 额外提示 */}
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 block mb-2">
          额外要求（可选）
        </label>
        <textarea
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
          placeholder="例如：重点考察 XXX 概念，难度适中..."
          rows={3}
          className={classNames(
            "w-full px-4 py-3 rounded-xl text-sm outline-none transition-all resize-none",
            "bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700",
            "text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500",
            "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
          )}
        />
      </div>
    </div>
  );

  // 获取当前工具调用状态描述
  const getToolStatusText = useMemoizedFn(() => {
    const activeTools = localToolExecutions.filter(
      (t) => t.status === "executing" || t.status === "pending",
    );
    if (activeTools.length === 0) {
      if (generatedItems.length > 0) {
        return "正在生成测验题...";
      }
      return "正在分析资料...";
    }

    const executingTool = activeTools.find((t) => t.status === "executing");
    if (executingTool) {
      const toolNameMap: Record<string, string> = {
        list_project_resources: "获取资源列表",
        read_resource_content: "读取资源内容",
        read_resource_range: "分段读取内容",
        search_project_knowledge: "搜索知识库",
      };
      return toolNameMap[executingTool.toolName] || "执行工具调用";
    }

    return "准备获取资料...";
  });

  // 渲染工具调用进度
  const renderToolProgress = () => {
    if (localToolExecutions.length === 0) return null;

    const completedCount = localToolExecutions.filter(
      (t) => t.status === "success",
    ).length;
    const totalCount = localToolExecutions.length;

    return (
      <div className="w-full max-w-xs mt-4">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
          <span>资料获取进度</span>
          <span>
            {completedCount}/{totalCount}
          </span>
        </div>
        <div className="space-y-1.5 max-h-32 overflow-auto">
          {localToolExecutions.slice(-5).map((execution) => (
            <motion.div
              key={execution.toolCallId}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 text-xs"
            >
              {execution.status === "executing" ? (
                <Loader2 className="w-3 h-3 text-blue-500 animate-spin shrink-0" />
              ) : execution.status === "success" ? (
                <Check className="w-3 h-3 text-green-500 shrink-0" />
              ) : execution.status === "pending" ? (
                <div className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600 shrink-0" />
              ) : (
                <div className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
              )}
              <span
                className={classNames(
                  "truncate",
                  execution.status === "executing"
                    ? "text-blue-600 dark:text-blue-400"
                    : execution.status === "success"
                      ? "text-gray-500 dark:text-gray-400"
                      : "text-gray-400 dark:text-gray-500",
                )}
              >
                {execution.toolName === "search_project_knowledge" && (
                  <Search className="w-3 h-3 inline mr-1" />
                )}
                {execution.toolName === "read_resource_content" && (
                  <BookOpen className="w-3 h-3 inline mr-1" />
                )}
                {execution.toolName === "read_resource_range" && (
                  <FileText className="w-3 h-3 inline mr-1" />
                )}
                {execution.toolName}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    );
  };

  // 渲染生成中步骤
  const renderGenerating = () => (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="relative">
        <div className="w-20 h-20 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
          <Sparkles className="w-8 h-8 text-blue-500 animate-pulse" />
        </div>
        <motion.div
          className="absolute inset-0 w-20 h-20 rounded-full border-2 border-blue-500 border-t-transparent"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>
      <p className="text-base font-medium text-gray-700 dark:text-gray-200 mt-6">
        {getToolStatusText()}
      </p>
      {generatedItems.length > 0 && (
        <motion.p
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm text-blue-500 mt-2 font-medium"
        >
          已生成 {generatedItems.length} 道题目
        </motion.p>
      )}
      {renderToolProgress()}
      <button
        type="button"
        onClick={handleStopGenerate}
        className={classNames(
          "mt-6 px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
          "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300",
          "hover:bg-gray-200 dark:hover:bg-gray-700",
          "border border-gray-200 dark:border-gray-700",
        )}
      >
        停止生成
      </button>
    </div>
  );

  // 渲染预览步骤
  const renderPreview = () => (
    <div className="space-y-5">
      {/* 测验名称 */}
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 block mb-2">
          测验名称
        </label>
        <input
          type="text"
          value={quizName}
          onChange={(e) => setQuizName(e.target.value)}
          placeholder="输入测验名称"
          className={classNames(
            "w-full px-4 py-3 rounded-xl text-sm outline-none transition-all",
            "bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700",
            "text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500",
            "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
          )}
        />
      </div>

      {/* 题目列表 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
              生成的题目
            </label>
            <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
              {selectedCount}/{generatedItems.length}
            </span>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
            >
              全选
            </button>
            <button
              type="button"
              onClick={deselectAll}
              className="text-xs font-medium text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
            >
              取消
            </button>
          </div>
        </div>

        <div className="max-h-80 overflow-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <AnimatePresence>
            {generatedItems.map((item, index) => (
              <QuizItemPreview
                key={item.id}
                item={item}
                index={index}
                onToggle={() => toggleItemSelection(item.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>

      {generationError && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20"
        >
          <p className="text-sm text-red-600 dark:text-red-400">
            {generationError.message}
          </p>
        </motion.div>
      )}
    </div>
  );

  // 按钮样式
  const primaryButtonClass = classNames(
    "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
    "bg-blue-500 text-white",
    "hover:bg-blue-600",
    "disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed",
  );

  const secondaryButtonClass = classNames(
    "px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
    "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300",
    "hover:bg-gray-200 dark:hover:bg-gray-700",
    "border border-gray-200 dark:border-gray-700",
  );

  // 渲染底部按钮
  const renderFooter = () => {
    if (step === "generating") {
      return null;
    }

    if (step === "select-resources") {
      return (
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className={secondaryButtonClass}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleStartGenerate}
            disabled={selectedResourceIds.length === 0}
            className={classNames(
              primaryButtonClass,
              "flex items-center gap-2",
            )}
          >
            <Sparkles className="w-4 h-4" />
            生成测验
          </button>
        </div>
      );
    }

    return (
      <div className="flex justify-between">
        <button
          type="button"
          onClick={handleRegenerate}
          className={classNames(
            secondaryButtonClass,
            "flex items-center gap-2",
          )}
        >
          <RefreshCw className="w-4 h-4" />
          重新生成
        </button>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className={secondaryButtonClass}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={selectedCount === 0 || saving}
            className={classNames(
              primaryButtonClass,
              "flex items-center gap-2",
            )}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            保存测验
          </button>
        </div>
      </div>
    );
  };

  // 根据步骤获取标题
  const getModalTitle = () => {
    switch (step) {
      case "select-resources":
        return "创建测验";
      case "generating":
        return "生成中";
      case "preview":
        return "预览测验";
      default:
        return "创建测验";
    }
  };

  // 根据步骤获取副标题
  const getModalSubtitle = () => {
    switch (step) {
      case "select-resources":
        return "选择资源并自动生成测验题";
      case "generating":
        return "AI 正在根据资料生成测验题...";
      case "preview":
        return "检查并保存生成的测验题";
      default:
        return "";
    }
  };

  return (
    <CustomModal
      open={open}
      onCancel={onClose}
      width={600}
      centered
      destroyOnClose
      title={getModalTitle()}
      subtitle={getModalSubtitle()}
      icon={<Sparkles className="w-5 h-5 text-blue-500" />}
      iconBgColor="bg-blue-50 dark:bg-blue-500/20 border-blue-200 dark:border-blue-500/30"
      footer={renderFooter()}
      showCloseButton={step !== "generating"}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {step === "select-resources" && renderResourceSelect()}
          {step === "generating" && renderGenerating()}
          {step === "preview" && renderPreview()}
        </motion.div>
      </AnimatePresence>
    </CustomModal>
  );
});

QuizGenerateModal.displayName = "QuizGenerateModal";

// 题目预览组件
interface QuizItemPreviewProps {
  item: GeneratedQuizItem;
  index: number;
  onToggle: () => void;
}

const QuizItemPreview = memo((props: QuizItemPreviewProps) => {
  const { item, index, onToggle } = props;

  // 从 Descendant[] 中提取纯文本
  const getPromptText = (): string => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extractText = (nodes: any[]): string => {
      return nodes
        .map((node) => {
          if (node.text !== undefined) {
            return node.text;
          }
          if (node.children) {
            return extractText(node.children);
          }
          return "";
        })
        .join("");
    };
    return extractText(item.prompt).slice(0, 100);
  };

  const typeLabel = FLASHCARD_TYPE_META[item.type]?.label || item.type;
  const difficultyLabels: Record<string, string> = {
    foundation: "基础",
    standard: "标准",
    advanced: "进阶",
  };

  const difficultyColors: Record<string, string> = {
    foundation:
      "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400",
    standard:
      "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
    advanced: "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ delay: index * 0.02 }}
      className={classNames(
        "flex items-start gap-3 px-4 py-3 cursor-pointer transition-all",
        "border-b border-gray-100 dark:border-gray-700/50 last:border-b-0",
        item.selected
          ? "bg-blue-50 dark:bg-blue-500/10"
          : "hover:bg-gray-100 dark:hover:bg-gray-700/50",
      )}
      onClick={onToggle}
    >
      <div
        className={classNames(
          "shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all mt-0.5",
          item.selected
            ? "bg-blue-500 border-blue-500"
            : "border-gray-300 dark:border-gray-600",
        )}
      >
        {item.selected && <Check className="w-3 h-3 text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
            #{index + 1}
          </span>
          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
            {typeLabel}
          </span>
          <span
            className={classNames(
              "px-2 py-0.5 rounded-md text-[10px] font-semibold",
              difficultyColors[item.difficulty] ||
                "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400",
            )}
          >
            {difficultyLabels[item.difficulty] || item.difficulty}
          </span>
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-200 m-0 line-clamp-2 leading-relaxed">
          {getPromptText()}
        </p>
      </div>
    </motion.div>
  );
});

QuizItemPreview.displayName = "QuizItemPreview";

export default QuizGenerateModal;

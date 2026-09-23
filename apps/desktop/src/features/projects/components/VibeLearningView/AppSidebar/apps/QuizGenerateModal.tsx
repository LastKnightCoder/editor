import { memo, useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { RefreshCw, CheckCircle2, Check, Loader2, Sparkles } from "lucide-react";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";

import CustomModal from "@/components/CustomModal";
import useQuizGeneration from "@/hooks/useQuizGeneration";
import useLLMConfig from "@/hooks/useLLMConfig";
import useVLQuizStore from "@/stores/useVLQuizStore";
import useVLResourceSelection from "@/hooks/useVLResourceSelection";
import useVLTools from "@/hooks/useVLTools";
import type { GeneratedQuizItem, CreateVLQuizItemInput, ToolCallExecutionState } from "@/types";
import { FLASHCARD_TYPE_META } from "@/utils/flashcard";
import { GenerationConfigStep, GeneratingProgress } from "../components";
import { toast } from "@tau/ui";

interface QuizGenerateModalProps {
  open: boolean;
  projectId: number;
  mainDbName: string;
  onClose: () => void;
}

type Step = "select-resources" | "generating" | "preview";

const QuizGenerateModal = memo((props: QuizGenerateModalProps) => {
  const { open, projectId, mainDbName, onClose } = props;

  // LLM 配置
  const { providerConfig, modelConfig } = useLLMConfig("chat");

  // Quiz store
  const { createQuizSet, createItemsBatch } = useVLQuizStore();

  // 资源选择（使用公共 hook）
  const {
    resources,
    selectedResourceIds,
    loading: loadingResources,
    isAllSelected,
    loadResources,
    toggleResource,
    toggleAll,
    getSelectedResourceNames,
    reset: resetResources,
  } = useVLResourceSelection(projectId);

  // 工具调用状态
  const [localToolExecutions, setLocalToolExecutions] = useState<ToolCallExecutionState[]>([]);

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
    onToolCallsUpdate: executions => {
      setLocalToolExecutions(executions);
    },
  });

  // 注册 VibeLearning 专属工具（使用公共 Hook）
  useVLTools({
    projectId,
    mainDbName,
    sourceId: `quiz-generation-${projectId}`,
    enabled: open,
  });

  // Local state
  const [step, setStep] = useState<Step>("select-resources");
  const [userPrompt, setUserPrompt] = useState("");
  const [quizName, setQuizName] = useState("");
  const [saving, setSaving] = useState(false);

  // 获取选中的测验题数量
  const selectedCount = useMemo(
    () => generatedItems.filter(item => item.selected).length,
    [generatedItems]
  );

  // 重置状态
  const resetState = useMemoizedFn(() => {
    setStep("select-resources");
    setUserPrompt("");
    setQuizName("");
    setLocalToolExecutions([]);
    resetGeneration();
    resetResources();
  });

  // 打开弹窗时加载资源
  useEffect(() => {
    if (open) {
      resetState();
      loadResources();
    }
  }, [open, loadResources, resetState]);

  // 开始生成测验（使用工具模式，AI 自主获取资料内容）
  const handleStartGenerate = useMemoizedFn(async () => {
    if (selectedResourceIds.length === 0) {
      toast.error("请选择至少一个资源");
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
        const selectedResources = resources.filter(r => selectedResourceIds.includes(r.id));
        if (selectedResources.length === 1) {
          setQuizName(`${selectedResources[0].name} 测验`);
        } else {
          setQuizName(`测验 - ${new Date().toLocaleDateString()}`);
        }
      }
    }
  }, [step, isGenerating, generatedItems, quizName, resources, selectedResourceIds]);

  // 保存测验集
  const handleSave = useMemoizedFn(async () => {
    const selectedItems = generatedItems.filter(item => item.selected);
    if (selectedItems.length === 0) {
      toast.error("请选择至少一道题目");
      return;
    }

    if (!quizName.trim()) {
      toast.error("请输入测验名称");
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
      const items: CreateVLQuizItemInput[] = selectedItems.map((item, index) => ({
        quizSetId: quizSet.id,
        type: item.type,
        prompt: item.prompt,
        detail: item.detail,
        data: item.data,
        tags: item.tags,
        difficulty: item.difficulty,
        sortOrder: index,
      }));

      await createItemsBatch(items);

      toast.success("测验创建成功");
      onClose();
    } catch (error) {
      console.error("Failed to save quiz:", error);
      toast.error("保存失败");
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

  // 获取当前工具调用状态描述
  const getToolStatusText = useMemoizedFn(() => {
    const activeTools = localToolExecutions.filter(
      t => t.status === "executing" || t.status === "pending"
    );
    if (activeTools.length === 0) {
      if (generatedItems.length > 0) {
        return "正在生成测验题...";
      }
      return "正在分析资料...";
    }

    const executingTool = activeTools.find(t => t.status === "executing");
    if (executingTool) {
      const toolNameMap: Record<string, string> = {
        list_project_resources: "获取资源列表",
        read_resource_content: "读取资源内容",
        read_resource_lines: "按行补读内容",
        read_resource_range: "按字符补读内容",
        grep_resource_content: "精确搜索资料",
        batch_read_search_hits: "批量补读上下文",
        search_resource_content: "语义搜索资料",
        batch_search_project_knowledge: "批量搜索资料",
      };
      return toolNameMap[executingTool.toolName] || "执行工具调用";
    }

    return "准备获取资料...";
  });

  // 渲染资源选择步骤（使用公共组件）
  const renderResourceSelect = () => (
    <GenerationConfigStep
      resources={resources}
      selectedResourceIds={selectedResourceIds}
      loading={loadingResources}
      isAllSelected={isAllSelected}
      onToggleResource={toggleResource}
      onToggleAll={toggleAll}
      userPrompt={userPrompt}
      onUserPromptChange={setUserPrompt}
      promptPlaceholder="例如：重点考察 XXX 概念，难度适中..."
      promptTitle="额外要求（可选）"
      resourceTitle="选择资源"
      emptyResourceText="暂无可用资源"
    />
  );

  // 渲染生成中步骤（使用公共组件）
  const renderGenerating = () => (
    <GeneratingProgress
      statusText={getToolStatusText()}
      generatedCount={generatedItems.length}
      generatedUnit="道题目"
      toolExecutions={localToolExecutions}
      onStop={handleStopGenerate}
      showStopButton
    />
  );

  // 渲染预览步骤
  const renderPreview = () => (
    <div className="space-y-5">
      {/* 测验名称 */}
      <div>
        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
          测验名称
        </label>
        <input
          type="text"
          value={quizName}
          onChange={e => setQuizName(e.target.value)}
          placeholder="输入测验名称"
          className={classNames(
            "w-full rounded-xl px-4 py-3 text-sm outline-none transition-all",
            "border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-zinc-800/50",
            "text-gray-800 placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500",
            "focus:ring-[var(--th-accent)]/20 focus:border-[var(--th-border-focus)] focus:ring-2"
          )}
        />
      </div>

      {/* 题目列表 */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
              生成的题目
            </label>
            <span className="bg-[var(--th-info)]/15 dark:bg-[var(--th-accent)]/20 rounded-md px-2 py-0.5 text-xs font-bold text-[var(--th-active-text)]">
              {selectedCount}/{generatedItems.length}
            </span>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={selectAll}
              className="dark:hover: text-xs font-medium text-[var(--th-accent)] transition-colors hover:text-[var(--th-active-text)]"
            >
              全选
            </button>
            <button
              type="button"
              onClick={deselectAll}
              className="text-xs font-medium text-gray-500 transition-colors hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300"
            >
              取消
            </button>
          </div>
        </div>

        <div className="max-h-80 overflow-auto rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-zinc-800/50">
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
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/20 dark:bg-red-500/10"
        >
          <p className="text-sm text-red-600 dark:text-red-400">{generationError.message}</p>
        </motion.div>
      )}
    </div>
  );

  // 按钮样式
  const primaryButtonClass = classNames(
    "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
    "bg-[var(--th-btn-bg)] text-[var(--th-btn-text)]",
    "hover:bg-[var(--th-btn-hover)]",
    "disabled:bg-gray-200 dark:disabled:bg-zinc-800 disabled:text-gray-400 disabled:cursor-not-allowed"
  );

  const secondaryButtonClass = classNames(
    "px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
    "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300",
    "hover:bg-gray-200 dark:hover:bg-zinc-700",
    "border border-gray-200 dark:border-gray-700"
  );

  // 渲染底部按钮
  const renderFooter = () => {
    if (step === "generating") {
      return null;
    }

    if (step === "select-resources") {
      return (
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            取消
          </button>
          <button
            type="button"
            onClick={handleStartGenerate}
            disabled={selectedResourceIds.length === 0}
            className={classNames(primaryButtonClass, "flex items-center gap-2")}
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.75} />
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
          className={classNames(secondaryButtonClass, "flex items-center gap-2")}
        >
          <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
          重新生成
        </button>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={selectedCount === 0 || saving}
            className={classNames(primaryButtonClass, "flex items-center gap-2")}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
            ) : (
              <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />
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
      icon={<Sparkles className="h-5 w-5 text-[var(--th-text-secondary)]" strokeWidth={1.75} />}
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
        .map(node => {
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
    foundation: "bg-[var(--th-success)]/15 text-status-success",
    standard: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
    advanced: "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ delay: index * 0.02 }}
      className={classNames(
        "flex cursor-pointer items-start gap-3 px-4 py-3 transition-all",
        "border-b border-gray-100 last:border-b-0 dark:border-gray-700/50",
        item.selected ? "bg-[var(--th-accent-soft)]" : "hover:bg-gray-100 dark:hover:bg-zinc-700/50"
      )}
      onClick={onToggle}
    >
      <div
        className={classNames(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all",
          item.selected
            ? "border-[var(--th-accent)] bg-[var(--th-accent)]"
            : "border-gray-300 dark:border-gray-600"
        )}
      >
        {item.selected && <Check className="h-3 w-3 text-white" strokeWidth={1.75} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500">#{index + 1}</span>
          <span className="bg-[var(--th-info)]/15 dark:bg-[var(--th-accent)]/20 rounded-md px-2 py-0.5 text-[10px] font-semibold text-[var(--th-active-text)]">
            {typeLabel}
          </span>
          <span
            className={classNames(
              "rounded-md px-2 py-0.5 text-[10px] font-semibold",
              difficultyColors[item.difficulty] ||
                "bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-gray-400"
            )}
          >
            {difficultyLabels[item.difficulty] || item.difficulty}
          </span>
        </div>
        <p className="m-0 line-clamp-2 text-sm leading-relaxed text-gray-700 dark:text-gray-200">
          {getPromptText()}
        </p>
      </div>
    </motion.div>
  );
});

QuizItemPreview.displayName = "QuizItemPreview";

export default QuizGenerateModal;

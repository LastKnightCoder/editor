import { memo, useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { App } from "antd";
import { ListOrdered, Sparkles } from "lucide-react";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";
import { Descendant } from "slate";

import CustomModal from "@/components/CustomModal";
import useLLMConfig from "@/hooks/useLLMConfig";
import useVLResourceSelection from "@/hooks/useVLResourceSelection";
import useVLTools from "@/hooks/useVLTools";
import useOutlineGenerationStore from "@/stores/useOutlineGenerationStore";
import { createVLNote } from "@/commands/vibe-learning";
import { createContent, updateContent } from "@/commands";
import { VLNote } from "@/types/vibe-learning";
import { importFromMarkdown, getContentLength } from "@/utils";
import { GenerationConfigStep } from "../components";
import { runGenerationTask } from "@/services/generation-orchestrator";

interface OutlineGenerateModalProps {
  open: boolean;
  projectId: number;
  mainDbName: string;
  onClose: () => void;
  onNoteCreated?: (note: VLNote) => void;
}

const OutlineGenerateModal = memo((props: OutlineGenerateModalProps) => {
  const { open, projectId, mainDbName, onClose, onNoteCreated } = props;
  const { message } = App.useApp();

  // LLM 配置
  const { providerConfig, modelConfig } = useLLMConfig("chat");

  // 大纲生成状态 store
  const {
    startGeneration,
    updateContent: updateGeneratingContent,
    finishGeneration,
    setError,
  } = useOutlineGenerationStore();

  // 资源选择
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

  // 注册 VibeLearning 专属工具（使用公共 Hook）
  useVLTools({
    projectId,
    mainDbName,
    sourceId: `outline-generation-${projectId}`,
    enabled: open,
  });

  // 本地状态
  const [userPrompt, setUserPrompt] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // 重置状态
  const resetState = useMemoizedFn(() => {
    setUserPrompt("");
    setIsCreating(false);
    resetResources();
  });

  // 打开弹窗时加载资源
  useEffect(() => {
    if (open) {
      resetState();
      loadResources();
    }
  }, [open, loadResources, resetState]);

  // 在后台执行流式生成（使用工具模式，AI 自主获取资料）
  const runBackgroundGeneration = useMemoizedFn(
    async (noteId: number, contentId: number, resourceNames: string[], extraPrompt: string) => {
      let lastSavedContent = "";

      // 定期保存的定时器
      const saveInterval = setInterval(async () => {
        const currentContent = useOutlineGenerationStore.getState().getContent(noteId);
        if (currentContent && currentContent !== lastSavedContent) {
          try {
            const slateContent = importFromMarkdown(currentContent);
            await updateContent(contentId, slateContent);
            lastSavedContent = currentContent;
          } catch (e) {
            console.error("Failed to save outline:", e);
          }
        }
      }, 3000);

      if (!providerConfig || !modelConfig) {
        setError(noteId, "AI 模型未配置");
        return;
      }

      runGenerationTask(
        providerConfig,
        modelConfig,
        {
          taskType: "outline",
          sourceType: "vibe_learning",
          taskPayload: {},
          sourcePayload: {
            projectId,
            mainDbName,
            resourceNames,
            userPrompt: extraPrompt || undefined,
          },
        },
        {
          onUpdate: responseText => {
            updateGeneratingContent(noteId, responseText);
          },
          onFinish: async content => {
            clearInterval(saveInterval);
            // 最终保存
            try {
              const slateContent = importFromMarkdown(content);
              await updateContent(contentId, slateContent);
            } catch (e) {
              console.error("Failed to save final outline:", e);
            }
            finishGeneration(noteId);
          },
          onError: e => {
            clearInterval(saveInterval);
            console.error("Generate outline error:", e);
            setError(noteId, e.message || "生成大纲失败");
          },
          onController: controller => {
            abortControllerRef.current = controller;
          },
        }
      );
    }
  );

  // 开始生成大纲
  const handleStartGenerate = useMemoizedFn(async () => {
    if (selectedResourceIds.length === 0) {
      message.error("请选择至少一个资源");
      return;
    }

    if (!providerConfig || !modelConfig) {
      message.error("请先在设置中配置 AI 模型");
      return;
    }

    setIsCreating(true);

    try {
      // 1. 获取选中的资源名称列表
      const resourceNames = getSelectedResourceNames();

      // 2. 创建空笔记
      const emptyContent = [
        {
          type: "paragraph",
          disableDrag: false,
          children: [{ type: "formatted", text: "" }],
        },
      ] satisfies Descendant[];
      const count = getContentLength(emptyContent);
      const newContentId = await createContent(emptyContent, count);

      if (!newContentId) {
        throw new Error("创建内容失败");
      }

      const note = await createVLNote({
        projectId,
        contentId: newContentId,
        title: "学习大纲",
        type: "outline",
      });

      // 3. 标记为正在生成
      startGeneration(note.id);

      // 4. 回调通知创建了笔记
      onNoteCreated?.(note);

      // 5. 关闭弹窗
      onClose();

      // 6. 在后台启动流式生成（使用工具模式）
      runBackgroundGeneration(note.id, newContentId, resourceNames, userPrompt);
    } catch (e) {
      console.error("Failed to start outline generation:", e);
      message.error((e as Error).message || "生成失败");
      setIsCreating(false);
    }
  });

  // 关闭弹窗
  const handleClose = useMemoizedFn(() => {
    onClose();
  });

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
  const renderFooter = () => (
    <div className="flex justify-end gap-3">
      <button
        type="button"
        onClick={handleClose}
        disabled={isCreating}
        className={secondaryButtonClass}
      >
        取消
      </button>
      <button
        type="button"
        onClick={handleStartGenerate}
        disabled={selectedResourceIds.length === 0 || isCreating}
        className={classNames(primaryButtonClass, "flex items-center gap-2")}
      >
        <Sparkles className="h-4 w-4" />
        {isCreating ? "创建中..." : "生成大纲"}
      </button>
    </div>
  );

  return (
    <CustomModal
      open={open}
      onCancel={handleClose}
      width={650}
      centered
      destroyOnClose
      title="生成学习大纲"
      subtitle="选择资源，AI 将自动分析并生成结构化学习大纲"
      icon={<ListOrdered className="h-5 w-5 text-[var(--th-accent)]" />}
      iconBgColor="bg-[var(--th-accent-soft)] dark:bg-[var(--th-accent)]/20 border-[var(--th-border-focus)]/30"
      footer={renderFooter()}
      showCloseButton={!isCreating}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key="select-resources"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          <GenerationConfigStep
            resources={resources}
            selectedResourceIds={selectedResourceIds}
            loading={loadingResources}
            isAllSelected={isAllSelected}
            onToggleResource={toggleResource}
            onToggleAll={toggleAll}
            userPrompt={userPrompt}
            onUserPromptChange={setUserPrompt}
            promptPlaceholder="例如：重点关注核心概念，按难度递进排列..."
            promptTitle="额外要求（可选）"
            resourceTitle="选择资源"
            emptyResourceText="暂无可用资源"
          />
        </motion.div>
      </AnimatePresence>
    </CustomModal>
  );
});

OutlineGenerateModal.displayName = "OutlineGenerateModal";

export default OutlineGenerateModal;

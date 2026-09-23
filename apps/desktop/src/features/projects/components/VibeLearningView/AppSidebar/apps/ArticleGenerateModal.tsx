import { memo, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FileText, Sparkles } from "lucide-react";
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
import { runGenerationTask } from "@/services/generation-orchestrator";
import { VLNote } from "@/types/vibe-learning";
import { getContentLength, importFromMarkdown } from "@/utils";
import type { VideoEbookRewriteStyle } from "@/constants/prompts/video-ebook-rewrite";
import { GenerationConfigStep } from "../components";
import { toast } from "@tau/ui";

interface ArticleGenerateModalProps {
  open: boolean;
  projectId: number;
  mainDbName: string;
  onClose: () => void;
  onNoteCreated?: (note: VLNote) => void;
}

const STYLE_OPTIONS: Array<{
  label: string;
  value: VideoEbookRewriteStyle;
  description: string;
}> = [
  {
    label: "杂志长文",
    value: "magazine",
    description: "更有阅读感，兼顾叙事性与信息密度",
  },
  {
    label: "学术总结",
    value: "academic",
    description: "更严谨克制，强调定义、论证与结论",
  },
  {
    label: "轻松博客",
    value: "casual",
    description: "更自然亲切，适合顺畅阅读和理解",
  },
  {
    label: "技术文档",
    value: "technical",
    description: "更强调术语统一、结构清晰和可检索性",
  },
];

const ArticleGenerateModal = memo((props: ArticleGenerateModalProps) => {
  const { open, projectId, mainDbName, onClose, onNoteCreated } = props;

  const { providerConfig, modelConfig } = useLLMConfig("chat");
  const {
    startGeneration,
    updateContent: updateGeneratingContent,
    finishGeneration,
    setError,
  } = useOutlineGenerationStore();
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

  useVLTools({
    projectId,
    mainDbName,
    sourceId: `article-generation-${projectId}`,
    enabled: open,
  });

  const [userPrompt, setUserPrompt] = useState("");
  const [style, setStyle] = useState<VideoEbookRewriteStyle>("magazine");
  const [isCreating, setIsCreating] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  const resetState = useMemoizedFn(() => {
    setUserPrompt("");
    setStyle("magazine");
    setIsCreating(false);
    resetResources();
  });

  useEffect(() => {
    if (open) {
      resetState();
      loadResources();
    }
  }, [open, loadResources, resetState]);

  const runBackgroundGeneration = useMemoizedFn(
    async (
      noteId: number,
      contentId: number,
      resourceNames: string[],
      extraPrompt: string,
      articleStyle: VideoEbookRewriteStyle
    ) => {
      let lastSavedContent = "";

      const saveInterval = setInterval(async () => {
        const currentContent = useOutlineGenerationStore.getState().getContent(noteId);
        if (currentContent && currentContent !== lastSavedContent) {
          try {
            const slateContent = importFromMarkdown(currentContent);
            await updateContent(contentId, slateContent);
            lastSavedContent = currentContent;
          } catch (e) {
            console.error("Failed to save article:", e);
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
          taskType: "article",
          sourceType: "vibe_learning",
          taskPayload: { style: articleStyle },
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
            try {
              const slateContent = importFromMarkdown(content);
              await updateContent(contentId, slateContent);
            } catch (e) {
              console.error("Failed to save final article:", e);
            }
            finishGeneration(noteId);
          },
          onError: e => {
            clearInterval(saveInterval);
            console.error("Generate article error:", e);
            setError(noteId, e.message || "生成文章失败");
          },
          onController: controller => {
            abortControllerRef.current = controller;
          },
        }
      );
    }
  );

  const handleStartGenerate = useMemoizedFn(async () => {
    if (selectedResourceIds.length === 0) {
      toast.error("请选择至少一个资源");
      return;
    }

    if (!providerConfig || !modelConfig) {
      toast.error("请先在设置中配置 AI 模型");
      return;
    }

    setIsCreating(true);

    try {
      const resourceNames = getSelectedResourceNames();
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
        title: "学习文章",
        type: "article",
      });

      startGeneration(note.id);
      onNoteCreated?.(note);
      onClose();

      runBackgroundGeneration(note.id, newContentId, resourceNames, userPrompt, style);
    } catch (e) {
      console.error("Failed to start article generation:", e);
      toast.error((e as Error).message || "生成失败");
      setIsCreating(false);
    }
  });

  const handleClose = useMemoizedFn(() => {
    onClose();
  });

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
        <Sparkles className="h-4 w-4" strokeWidth={1.75} />
        {isCreating ? "创建中..." : "生成文章"}
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
      title="生成学习文章"
      subtitle="选择资源和文章风格，AI 将生成一篇可直接阅读的长文章"
      icon={<FileText className="h-5 w-5 text-[var(--th-text-secondary)]" strokeWidth={1.75} />}
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
          className="space-y-5"
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
            promptPlaceholder="例如：更强调背景动机、实际案例和常见误区..."
            promptTitle="额外要求（可选）"
            resourceTitle="选择资源"
            emptyResourceText="暂无可用资源"
          />

          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
              文章风格
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {STYLE_OPTIONS.map(option => {
                const selected = option.value === style;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStyle(option.value)}
                    className={classNames(
                      "rounded-xl border px-4 py-3 text-left transition-all",
                      selected
                        ? "border-[var(--th-border-focus)] bg-[var(--th-accent-soft)]"
                        : "border-gray-200 bg-white hover:border-[var(--th-border-hover)] dark:border-gray-700 dark:bg-zinc-900/60"
                    )}
                  >
                    <div className="text-sm font-semibold text-gray-800 dark:text-white">
                      {option.label}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-gray-500 dark:text-slate-400">
                      {option.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </CustomModal>
  );
});

ArticleGenerateModal.displayName = "ArticleGenerateModal";

export default ArticleGenerateModal;

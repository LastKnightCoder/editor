import { memo, useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { App } from "antd";
import { ListOrdered, Sparkles } from "lucide-react";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";

import CustomModal from "@/components/CustomModal";
import { chatLLMStream } from "@/hooks/useChatLLM";
import useLLMConfig from "@/hooks/useLLMConfig";
import useVLResourceSelection from "@/hooks/useVLResourceSelection";
import useOutlineGenerationStore from "@/stores/useOutlineGenerationStore";
import { readVLResourceContent, createVLNote } from "@/commands/vibe-learning";
import { createContent, updateContent } from "@/commands";
import { RequestMessage } from "@/types";
import { VLNote } from "@/types/vibe-learning";
import { Role } from "@/constants";
import { importFromMarkdown, getContentLength } from "@/utils";
import { GenerationConfigStep } from "../components";

// 大纲生成的 System Prompt
const OUTLINE_GENERATION_PROMPT = `你是一个学习大纲生成助手。请根据以下学习资料，生成一份结构化的学习大纲。

要求：
1. 大纲应该包含主题、章节和要点
2. 使用清晰的层级结构（一级、二级、三级标题）
3. 每个要点应简洁明了
4. 按照逻辑顺序组织内容
5. 突出重点和核心概念

请以 Markdown 格式输出大纲，使用 #、##、### 表示层级。`;

// 单个资源内容的最大长度（字符）
const MAX_RESOURCE_CONTENT_LENGTH = 10000;
// 总内容的最大长度（字符）
const MAX_TOTAL_CONTENT_LENGTH = 50000;

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
    getSelectedResources,
    reset: resetResources,
  } = useVLResourceSelection(projectId);

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

  // 获取选中资源的内容
  const fetchSelectedResourceContent = useMemoizedFn(async () => {
    const selectedResources = getSelectedResources();
    if (selectedResources.length === 0) {
      throw new Error("请选择至少一个资源");
    }

    const contents: string[] = [];
    let totalLength = 0;

    for (const resource of selectedResources) {
      if (totalLength >= MAX_TOTAL_CONTENT_LENGTH) break;

      try {
        const result = await readVLResourceContent(
          projectId,
          resource.name,
          mainDbName,
        );
        if (result.success && result.content) {
          let content = result.content;
          if (content.length > MAX_RESOURCE_CONTENT_LENGTH) {
            content =
              content.slice(0, MAX_RESOURCE_CONTENT_LENGTH) +
              "\n\n[内容过长，已截断...]";
          }
          contents.push(`【资料: ${resource.name}】\n${content}`);
          totalLength += content.length;
        }
      } catch (e) {
        console.error(`Failed to read resource ${resource.name}:`, e);
      }
    }

    if (contents.length === 0) {
      throw new Error("无法读取资料内容，请检查资料是否已完成处理");
    }

    return contents.join("\n\n---\n\n");
  });

  // 在后台执行流式生成
  const runBackgroundGeneration = useMemoizedFn(
    async (
      noteId: number,
      contentId: number,
      resourceContent: string,
      extraPrompt: string,
    ) => {
      // 构建用户消息，加入额外提示
      let userMessage = `以下是学习资料的内容，请根据这些内容生成学习大纲：\n\n${resourceContent}`;
      if (extraPrompt.trim()) {
        userMessage += `\n\n额外要求：${extraPrompt.trim()}`;
      }

      const messages: RequestMessage[] = [
        {
          role: Role.System,
          content: OUTLINE_GENERATION_PROMPT,
        },
        {
          role: Role.User,
          content: userMessage,
        },
      ];

      let lastSavedContent = "";

      // 定期保存的定时器
      const saveInterval = setInterval(async () => {
        const currentContent = useOutlineGenerationStore
          .getState()
          .getContent(noteId);
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

      chatLLMStream(providerConfig!, modelConfig!, messages, {
        onUpdate: (responseText) => {
          updateGeneratingContent(noteId, responseText);
        },
        onFinish: async (content) => {
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
        onError: (e) => {
          clearInterval(saveInterval);
          console.error("Generate outline error:", e);
          setError(noteId, e.message || "生成大纲失败");
        },
        onController: (controller) => {
          abortControllerRef.current = controller;
        },
      });
    },
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
      // 1. 获取资源内容
      const resourceContent = await fetchSelectedResourceContent();

      // 2. 创建空笔记
      const emptyContent = [
        {
          type: "paragraph",
          disableDrag: false,
          children: [{ type: "formatted", text: "" }],
        },
      ];
      const count = getContentLength(emptyContent);
      const newContentId = await createContent(emptyContent, count);

      if (!newContentId) {
        throw new Error("创建内容失败");
      }

      const note = await createVLNote({
        projectId,
        contentId: newContentId,
        title: "学习大纲",
      });

      // 3. 标记为正在生成
      startGeneration(note.id);

      // 4. 回调通知创建了笔记
      onNoteCreated?.(note);

      // 5. 关闭弹窗
      onClose();

      // 6. 在后台启动流式生成
      runBackgroundGeneration(
        note.id,
        newContentId,
        resourceContent,
        userPrompt,
      );
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
        <Sparkles className="w-4 h-4" />
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
      subtitle="选择资源并生成结构化学习大纲"
      icon={<ListOrdered className="w-5 h-5 text-blue-500" />}
      iconBgColor="bg-blue-50 dark:bg-blue-500/20 border-blue-200 dark:border-blue-500/30"
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

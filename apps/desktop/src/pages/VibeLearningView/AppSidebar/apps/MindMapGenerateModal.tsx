import {
  memo,
  useState,
  useRef,
  useEffect,
  lazy,
  Suspense,
  useMemo,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import { App } from "antd";
import {
  Network,
  Sparkles,
  RefreshCw,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";
import useTheme from "@/hooks/useTheme";

import CustomModal from "@/components/CustomModal";
import { chatLLMStream } from "@/hooks/useChatLLM";
import useLLMConfig from "@/hooks/useLLMConfig";
import useVLResourceSelection from "@/hooks/useVLResourceSelection";
import useVLTools from "@/hooks/useVLTools";
import { createVLNote } from "@/commands/vibe-learning";
import { createContent } from "@/commands";
import { RequestMessage, ToolCallExecutionState } from "@/types";
import { VLNote } from "@/types/vibe-learning";
import { Role } from "@/constants";
import { getContentLength, importFromMarkdown } from "@/utils";
import { parseMindMapList } from "@/layouts/ContentLayout/components/ChatSidebar/MindMapRenderer/parseMindMapList";
import { MindMapNodeData } from "@/components/MindMap/types";
import {
  MINDMAP_GENERATION_WITH_TOOLS_PROMPT,
  MINDMAP_GENERATION_WITH_TOOLS_USER_PROMPT,
} from "@/constants/prompts/mindmap-generation";
import { GenerationConfigStep, GeneratingProgress } from "../components";

const MindMap = lazy(() => import("@/components/MindMap"));

interface MindMapGenerateModalProps {
  open: boolean;
  projectId: number;
  mainDbName: string;
  onClose: () => void;
  onNoteCreated?: (note: VLNote) => void;
}

type Step = "select-resources" | "generating" | "preview";

const MindMapGenerateModal = memo((props: MindMapGenerateModalProps) => {
  const { open, projectId, mainDbName, onClose, onNoteCreated } = props;
  const { message } = App.useApp();

  const { isDark } = useTheme();
  const themeId = useMemo(() => {
    return isDark ? "ocean" : "cherry-blossom";
  }, [isDark]);

  // LLM 配置
  const { providerConfig, modelConfig } = useLLMConfig("chat");

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

  // 注册 VibeLearning 专属工具
  useVLTools({
    projectId,
    mainDbName,
    sourceId: `mindmap-generation-${projectId}`,
    enabled: open,
  });

  // 本地状态
  const [step, setStep] = useState<Step>("select-resources");
  const [userPrompt, setUserPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedMarkdown, setGeneratedMarkdown] = useState("");
  const [mindMapData, setMindMapData] = useState<MindMapNodeData | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [toolExecutions, setToolExecutions] = useState<
    ToolCallExecutionState[]
  >([]);
  const [saving, setSaving] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // 重置状态
  const resetState = useMemoizedFn(() => {
    setStep("select-resources");
    setUserPrompt("");
    setIsGenerating(false);
    setGeneratedMarkdown("");
    setMindMapData(null);
    setParseError(null);
    setToolExecutions([]);
    setSaving(false);
    resetResources();
  });

  // 打开弹窗时加载资源
  useEffect(() => {
    if (open) {
      resetState();
      loadResources();
    }
  }, [open, loadResources, resetState]);

  // 解析生成的 Markdown 为思维导图数据
  const parseMarkdownToMindMap = useMemoizedFn((markdown: string) => {
    if (!markdown.trim()) {
      setMindMapData(null);
      setParseError(null);
      return;
    }

    try {
      const data = parseMindMapList(markdown);
      setMindMapData(data);
      setParseError(null);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "解析失败");
      setMindMapData(null);
    }
  });

  // 开始生成思维导图
  const handleStartGenerate = useMemoizedFn(async () => {
    if (selectedResourceIds.length === 0) {
      message.error("请选择至少一个资源");
      return;
    }

    if (!providerConfig || !modelConfig) {
      message.error("请先在设置中配置 AI 模型");
      return;
    }

    setStep("generating");
    setIsGenerating(true);
    setGeneratedMarkdown("");
    setMindMapData(null);
    setParseError(null);
    setToolExecutions([]);

    const resourceNames = getSelectedResourceNames();

    const messages: RequestMessage[] = [
      {
        role: Role.System,
        content: [{ type: "text", text: MINDMAP_GENERATION_WITH_TOOLS_PROMPT }],
      },
      {
        role: Role.User,
        content: [
          {
            type: "text",
            text: MINDMAP_GENERATION_WITH_TOOLS_USER_PROMPT(
              resourceNames,
              userPrompt || undefined,
            ),
          },
        ],
      },
    ];

    chatLLMStream(providerConfig, modelConfig, messages, {
      enableTools: true,
      onUpdate: (responseText) => {
        setGeneratedMarkdown(responseText);
      },
      onFinish: (content) => {
        setIsGenerating(false);
        setGeneratedMarkdown(content);
        parseMarkdownToMindMap(content);
        setStep("preview");
      },
      onError: (e) => {
        setIsGenerating(false);
        console.error("Generate mindmap error:", e);
        message.error(e.message || "生成思维导图失败");
        if (!generatedMarkdown) {
          setStep("select-resources");
        } else {
          parseMarkdownToMindMap(generatedMarkdown);
          setStep("preview");
        }
      },
      onController: (controller) => {
        abortControllerRef.current = controller;
      },
      onToolCallsUpdate: (executions) => {
        setToolExecutions(executions);
      },
    });
  });

  // 停止生成
  const handleStopGenerate = useMemoizedFn(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsGenerating(false);
    if (generatedMarkdown) {
      parseMarkdownToMindMap(generatedMarkdown);
      setStep("preview");
    } else {
      setStep("select-resources");
    }
  });

  // 重新生成
  const handleRegenerate = useMemoizedFn(() => {
    setStep("select-resources");
    setGeneratedMarkdown("");
    setMindMapData(null);
    setParseError(null);
  });

  // 保存为笔记
  const handleSave = useMemoizedFn(async () => {
    if (!generatedMarkdown.trim()) {
      message.error("没有可保存的内容");
      return;
    }

    setSaving(true);

    try {
      // 直接保存 Markdown 列表内容，通过 type: mindmap 标记笔记类型
      const noteContent = importFromMarkdown(generatedMarkdown.trim());

      const count = getContentLength(noteContent);
      const newContentId = await createContent(noteContent, count);

      if (!newContentId) {
        throw new Error("创建内容失败");
      }

      const note = await createVLNote({
        projectId,
        contentId: newContentId,
        title: "思维导图",
        type: "mindmap",
      });

      message.success("思维导图已保存为笔记");

      // 回调通知创建了笔记
      onNoteCreated?.(note);

      onClose();
    } catch (e) {
      console.error("Failed to save mindmap:", e);
      message.error((e as Error).message || "保存失败");
    } finally {
      setSaving(false);
    }
  });

  // 关闭弹窗
  const handleClose = useMemoizedFn(() => {
    if (isGenerating && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    onClose();
  });

  // 获取当前工具调用状态描述
  const getToolStatusText = useMemoizedFn(() => {
    const activeTools = toolExecutions.filter(
      (t) => t.status === "executing" || t.status === "pending",
    );
    if (activeTools.length === 0) {
      if (generatedMarkdown) {
        return "正在生成思维导图...";
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

  // 渲染资源选择步骤
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
      promptPlaceholder="例如：重点关注核心概念，按主题分类..."
      promptTitle="额外要求（可选）"
      resourceTitle="选择资源"
      emptyResourceText="暂无可用资源"
    />
  );

  // 渲染生成中步骤
  const renderGenerating = () => (
    <GeneratingProgress
      statusText={getToolStatusText()}
      toolExecutions={toolExecutions}
      onStop={handleStopGenerate}
      showStopButton
    />
  );

  // 渲染预览步骤
  const renderPreview = () => (
    <div className="space-y-4">
      {/* 思维导图预览 */}
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 block mb-2">
          思维导图预览
        </label>
        <div
          className={classNames(
            "rounded-xl border overflow-hidden",
            "bg-gray-50 dark:bg-zinc-800/50 border-gray-200 dark:border-gray-700",
          )}
          style={{ height: 400 }}
        >
          {parseError ? (
            <div className="flex flex-col items-center justify-center h-full p-6">
              <div className="text-red-500 dark:text-red-400 text-sm mb-2">
                解析错误
              </div>
              <div className="text-gray-500 dark:text-gray-400 text-xs text-center">
                {parseError}
              </div>
              <div className="mt-4 p-3 rounded-lg bg-gray-100 dark:bg-zinc-700/50 max-h-40 overflow-auto w-full">
                <pre className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                  {generatedMarkdown}
                </pre>
              </div>
            </div>
          ) : mindMapData ? (
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                    加载思维导图组件...
                  </span>
                </div>
              }
            >
              <MindMap
                themeId={themeId}
                data={mindMapData}
                className="w-full h-full"
              />
            </Suspense>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
              暂无数据
            </div>
          )}
        </div>
      </div>

      {/* 原始 Markdown 预览（可折叠） */}
      <details className="group">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-2 select-none">
          查看原始内容
        </summary>
        <div
          className={classNames(
            "p-3 rounded-xl border max-h-40 overflow-auto",
            "bg-gray-50 dark:bg-zinc-800/50 border-gray-200 dark:border-gray-700",
          )}
        >
          <pre className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap font-mono">
            {generatedMarkdown}
          </pre>
        </div>
      </details>
    </div>
  );

  // 按钮样式
  const primaryButtonClass = classNames(
    "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
    "bg-blue-500 text-white",
    "hover:bg-blue-600",
    "disabled:bg-gray-200 dark:disabled:bg-zinc-800 disabled:text-gray-400 disabled:cursor-not-allowed",
  );

  const secondaryButtonClass = classNames(
    "px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
    "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300",
    "hover:bg-gray-200 dark:hover:bg-zinc-700",
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
            onClick={handleClose}
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
            生成思维导图
          </button>
        </div>
      );
    }

    // preview step
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
            onClick={handleClose}
            className={secondaryButtonClass}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!generatedMarkdown.trim() || saving}
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
            保存为笔记
          </button>
        </div>
      </div>
    );
  };

  // 根据步骤获取标题
  const getModalTitle = () => {
    switch (step) {
      case "select-resources":
        return "生成思维导图";
      case "generating":
        return "生成中";
      case "preview":
        return "预览思维导图";
      default:
        return "生成思维导图";
    }
  };

  // 根据步骤获取副标题
  const getModalSubtitle = () => {
    switch (step) {
      case "select-resources":
        return "选择资源，AI 将自动分析并生成思维导图";
      case "generating":
        return "AI 正在根据资料生成思维导图...";
      case "preview":
        return "检查生成的思维导图，可保存为笔记";
      default:
        return "";
    }
  };

  return (
    <CustomModal
      open={open}
      onCancel={handleClose}
      width={700}
      centered
      destroyOnClose
      title={getModalTitle()}
      subtitle={getModalSubtitle()}
      icon={<Network className="w-5 h-5 text-blue-500" />}
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

MindMapGenerateModal.displayName = "MindMapGenerateModal";

export default MindMapGenerateModal;

import { memo, useState, useRef, useEffect, lazy, Suspense, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Network, Sparkles, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";
import useTheme from "@/hooks/useTheme";

import CustomModal from "@/components/CustomModal";
import useLLMConfig from "@/hooks/useLLMConfig";
import useVLResourceSelection from "@/hooks/useVLResourceSelection";
import useVLTools from "@/hooks/useVLTools";
import { createVLNote } from "@/commands/vibe-learning";
import { createContent } from "@/commands";
import { ToolCallExecutionState } from "@/types";
import { VLNote } from "@/types/vibe-learning";
import { getContentLength, importFromMarkdown } from "@/utils";
import { parseMindMapList } from "@/layouts/ContentLayout/components/ChatSidebar/MindMapRenderer/parseMindMapList";
import { MindMapNodeData } from "@/components/MindMap/types";
import { GenerationConfigStep, GeneratingProgress } from "../components";
import { runGenerationTask } from "@/services/generation-orchestrator";
import { toast } from "@tau/ui";

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
  const [toolExecutions, setToolExecutions] = useState<ToolCallExecutionState[]>([]);
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
      toast.error("请选择至少一个资源");
      return;
    }

    if (!providerConfig || !modelConfig) {
      toast.error("请先在设置中配置 AI 模型");
      return;
    }

    setStep("generating");
    setIsGenerating(true);
    setGeneratedMarkdown("");
    setMindMapData(null);
    setParseError(null);
    setToolExecutions([]);

    const resourceNames = getSelectedResourceNames();

    runGenerationTask(
      providerConfig,
      modelConfig,
      {
        taskType: "mindmap",
        sourceType: "vibe_learning",
        taskPayload: {},
        sourcePayload: {
          projectId,
          mainDbName,
          resourceNames,
          userPrompt: userPrompt || undefined,
        },
      },
      {
        onUpdate: responseText => {
          setGeneratedMarkdown(responseText);
        },
        onFinish: content => {
          setIsGenerating(false);
          setGeneratedMarkdown(content);
          parseMarkdownToMindMap(content);
          setStep("preview");
        },
        onError: e => {
          setIsGenerating(false);
          console.error("Generate mindmap error:", e);
          toast.error(e.message || "生成思维导图失败");
          if (!generatedMarkdown) {
            setStep("select-resources");
          } else {
            parseMarkdownToMindMap(generatedMarkdown);
            setStep("preview");
          }
        },
        onController: controller => {
          abortControllerRef.current = controller;
        },
        onToolCallsUpdate: executions => {
          setToolExecutions(executions);
        },
      }
    );
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
      toast.error("没有可保存的内容");
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

      toast.success("思维导图已保存为笔记");

      // 回调通知创建了笔记
      onNoteCreated?.(note);

      onClose();
    } catch (e) {
      console.error("Failed to save mindmap:", e);
      toast.error((e as Error).message || "保存失败");
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
      t => t.status === "executing" || t.status === "pending"
    );
    if (activeTools.length === 0) {
      if (generatedMarkdown) {
        return "正在生成思维导图...";
      }
      return "正在分析资料...";
    }

    const executingTool = activeTools.find(t => t.status === "executing");
    if (executingTool) {
      const toolNameMap: Record<string, string> = {
        vibe_learning_query: "查询项目资料",
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
        <label className="text-ink-2 mb-2 block text-[11px] font-semibold uppercase tracking-wider">
          思维导图预览
        </label>
        <div
          className={classNames("overflow-hidden rounded-xl border", "border-line-1")}
          style={{ height: 400 }}
        >
          {parseError ? (
            <div className="flex h-full flex-col items-center justify-center p-6">
              <div className="text-danger mb-2 text-sm">解析错误</div>
              <div className="text-ink-2 text-center text-xs">{parseError}</div>
              <div className="border-line-1 mt-4 max-h-40 w-full overflow-auto rounded-lg border p-3">
                <pre className="text-ink-2 whitespace-pre-wrap text-xs">{generatedMarkdown}</pre>
              </div>
            </div>
          ) : mindMapData ? (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="text-accent h-6 w-6 animate-spin" strokeWidth={1.75} />
                  <span className="text-ink-2 ml-2 text-sm">加载思维导图组件...</span>
                </div>
              }
            >
              <MindMap themeId={themeId} data={mindMapData} className="h-full w-full" />
            </Suspense>
          ) : (
            <div className="text-ink-3 flex h-full items-center justify-center text-sm">
              暂无数据
            </div>
          )}
        </div>
      </div>

      {/* 原始 Markdown 预览（可折叠） */}
      <details className="group">
        <summary className="text-ink-2 mb-2 cursor-pointer select-none text-[11px] font-semibold uppercase tracking-wider">
          查看原始内容
        </summary>
        <div
          className={classNames("max-h-40 overflow-auto rounded-xl border p-3", "border-line-1")}
        >
          <pre className="text-ink-2 whitespace-pre-wrap font-mono text-xs">
            {generatedMarkdown}
          </pre>
        </div>
      </details>
    </div>
  );

  // 按钮样式
  const primaryButtonClass = classNames(
    "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
    "bg-accent text-white",
    "hover:bg-accent-hover",
    "disabled:bg-sunken disabled:text-ink-3 disabled:cursor-not-allowed"
  );

  const secondaryButtonClass = classNames(
    "px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
    "bg-hover text-ink-2",
    "hover:bg-hover",
    "border border-line-1"
  );

  // 渲染底部按钮
  const renderFooter = () => {
    if (step === "generating") {
      return null;
    }

    if (step === "select-resources") {
      return (
        <div className="flex justify-end gap-3">
          <button type="button" onClick={handleClose} className={secondaryButtonClass}>
            取消
          </button>
          <button
            type="button"
            onClick={handleStartGenerate}
            disabled={selectedResourceIds.length === 0}
            className={classNames(primaryButtonClass, "flex items-center gap-2")}
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.75} />
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
          className={classNames(secondaryButtonClass, "flex items-center gap-2")}
        >
          <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
          重新生成
        </button>
        <div className="flex gap-3">
          <button type="button" onClick={handleClose} className={secondaryButtonClass}>
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!generatedMarkdown.trim() || saving}
            className={classNames(primaryButtonClass, "flex items-center gap-2")}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
            ) : (
              <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />
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
      icon={<Network className="text-ink-2 h-5 w-5" strokeWidth={1.75} />}
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

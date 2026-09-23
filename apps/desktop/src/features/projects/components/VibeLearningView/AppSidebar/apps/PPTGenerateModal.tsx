import { isElectron } from "@/electron";
import { useHtmlPreviewUrl } from "@/utils/html-preview";
import { memo, useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Presentation, Sparkles, RefreshCw, Loader2, CheckCircle2, Code, Eye } from "lucide-react";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";

import CustomModal from "@/components/CustomModal";
import useLLMConfig from "@/hooks/useLLMConfig";
import useVLResourceSelection from "@/hooks/useVLResourceSelection";
import useVLTools from "@/hooks/useVLTools";
import { createVLNote } from "@/commands/vibe-learning";
import { createContent } from "@/commands";
import { ToolCallExecutionState } from "@/types";
import { VLNote } from "@/types/vibe-learning";
import { getContentLength, importFromMarkdown } from "@/utils";
import { cleanPPTHtmlContent } from "@/constants/prompts/ppt-generation";
import { PPT_TEMPLATES, DEFAULT_TEMPLATE_ID, getTemplateById } from "@/constants/ppt-templates";
import { GenerationConfigStep, GeneratingProgress, PPTTemplateSelector } from "../components";
import { runGenerationTask } from "@/services/generation-orchestrator";
import { toast } from "@tau/ui";

interface PPTGenerateModalProps {
  open: boolean;
  projectId: number;
  mainDbName: string;
  onClose: () => void;
  onNoteCreated?: (note: VLNote) => void;
}

type Step = "select-resources" | "generating" | "preview";

const PPTGenerateModal = memo((props: PPTGenerateModalProps) => {
  const { open, projectId, mainDbName, onClose, onNoteCreated } = props;

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
    sourceId: `ppt-generation-${projectId}`,
    enabled: open,
  });

  // 本地状态
  const [step, setStep] = useState<Step>("select-resources");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(DEFAULT_TEMPLATE_ID);
  const [userPrompt, setUserPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedHtml, setGeneratedHtml] = useState("");
  const [cleanedHtml, setCleanedHtml] = useState("");
  const [toolExecutions, setToolExecutions] = useState<ToolCallExecutionState[]>([]);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"preview" | "source">("preview");

  // 获取当前选中的模板
  const selectedTemplate = useMemo(
    () => getTemplateById(selectedTemplateId) || PPT_TEMPLATES[0],
    [selectedTemplateId]
  );

  const abortControllerRef = useRef<AbortController | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // 检查是否是 Electron 环境

  // 重置状态
  const resetState = useMemoizedFn(() => {
    setStep("select-resources");
    setSelectedTemplateId(DEFAULT_TEMPLATE_ID);
    setUserPrompt("");
    setIsGenerating(false);
    setGeneratedHtml("");
    setCleanedHtml("");
    setToolExecutions([]);
    setSaving(false);
    setViewMode("preview");
    resetResources();
  });

  // 打开弹窗时加载资源
  useEffect(() => {
    if (open) {
      resetState();
      loadResources();
    }
  }, [open, loadResources, resetState]);

  // 清理并处理生成的 HTML
  const processGeneratedHtml = useMemoizedFn((rawHtml: string) => {
    const cleaned = cleanPPTHtmlContent(rawHtml);
    setCleanedHtml(cleaned);
  });

  // 生成 HTML 预览 URL
  const htmlPreviewUrl = useHtmlPreviewUrl(cleanedHtml);

  // 开始生成 PPT
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
    setGeneratedHtml("");
    setCleanedHtml("");
    setToolExecutions([]);

    const resourceNames = getSelectedResourceNames();

    runGenerationTask(
      providerConfig,
      modelConfig,
      {
        taskType: "ppt",
        sourceType: "vibe_learning",
        taskPayload: {
          template: selectedTemplate,
        },
        sourcePayload: {
          projectId,
          mainDbName,
          resourceNames,
          userPrompt: userPrompt || undefined,
        },
      },
      {
        onUpdate: responseText => {
          setGeneratedHtml(responseText);
        },
        onFinish: content => {
          setIsGenerating(false);
          setGeneratedHtml(content);
          processGeneratedHtml(content);
          setStep("preview");
        },
        onError: e => {
          setIsGenerating(false);
          console.error("Generate PPT error:", e);
          toast.error(e.message || "生成 PPT 失败");
          if (!generatedHtml) {
            setStep("select-resources");
          } else {
            processGeneratedHtml(generatedHtml);
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
    if (generatedHtml) {
      processGeneratedHtml(generatedHtml);
      setStep("preview");
    } else {
      setStep("select-resources");
    }
  });

  // 重新生成
  const handleRegenerate = useMemoizedFn(() => {
    setStep("select-resources");
    setGeneratedHtml("");
    setCleanedHtml("");
  });

  // 保存为笔记
  const handleSave = useMemoizedFn(async () => {
    if (!cleanedHtml.trim()) {
      toast.error("没有可保存的内容");
      return;
    }

    setSaving(true);

    try {
      // 将 HTML 内容保存为 Markdown 格式（实际存储原始 HTML）
      // 使用代码块包装，便于后续识别和渲染
      const markdownContent = `\`\`\`html\n${cleanedHtml}\n\`\`\``;
      const noteContent = importFromMarkdown(markdownContent);

      const count = getContentLength(noteContent);
      const newContentId = await createContent(noteContent, count);

      if (!newContentId) {
        throw new Error("创建内容失败");
      }

      // 尝试从 HTML 中提取标题
      const titleMatch = cleanedHtml.match(/<title>(.*?)<\/title>/i);
      const pptTitle = titleMatch ? titleMatch[1] : "演示文稿";

      const note = await createVLNote({
        projectId,
        contentId: newContentId,
        title: pptTitle,
        type: "ppt",
      });

      toast.success("PPT 已保存为笔记");

      // 回调通知创建了笔记
      onNoteCreated?.(note);

      onClose();
    } catch (e) {
      console.error("Failed to save PPT:", e);
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
      if (generatedHtml) {
        return "正在生成 PPT...";
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

  // 渲染资源选择步骤
  const renderResourceSelect = () => (
    <div className="space-y-5">
      {/* 资源选择和额外要求 */}
      <GenerationConfigStep
        resources={resources}
        selectedResourceIds={selectedResourceIds}
        loading={loadingResources}
        isAllSelected={isAllSelected}
        onToggleResource={toggleResource}
        onToggleAll={toggleAll}
        userPrompt={userPrompt}
        onUserPromptChange={setUserPrompt}
        promptPlaceholder="例如：重点突出核心概念，使用更多数据可视化..."
        promptTitle="额外要求（可选）"
        resourceTitle="选择资源"
        emptyResourceText="暂无可用资源"
      />

      {/* 模板选择器 */}
      <PPTTemplateSelector
        selectedTemplateId={selectedTemplateId}
        onSelectTemplate={setSelectedTemplateId}
        title="选择风格"
      />
    </div>
  );

  // 渲染生成中步骤
  const renderGenerating = () => (
    <GeneratingProgress
      statusText={getToolStatusText()}
      outputText={generatedHtml}
      outputLabel="PPT"
      toolExecutions={toolExecutions}
      onStop={handleStopGenerate}
      showStopButton
    />
  );

  // 渲染预览步骤
  const renderPreview = () => (
    <div className="space-y-4">
      {/* 预览/源码切换 */}
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
          PPT 预览
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode("preview")}
            className={classNames(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              viewMode === "preview"
                ? "bg-[var(--th-btn-bg)] text-[var(--th-btn-text)]"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700"
            )}
          >
            <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
            预览
          </button>
          <button
            type="button"
            onClick={() => setViewMode("source")}
            className={classNames(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              viewMode === "source"
                ? "bg-[var(--th-btn-bg)] text-[var(--th-btn-text)]"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700"
            )}
          >
            <Code className="h-3.5 w-3.5" strokeWidth={1.75} />
            源码
          </button>
        </div>
      </div>

      {/* 预览区域 */}
      <div
        className={classNames(
          "overflow-hidden rounded-xl border",
          "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-zinc-800/50"
        )}
        style={{ height: 400 }}
      >
        {viewMode === "preview" ? (
          cleanedHtml ? (
            isElectron ? (
              <webview
                src={htmlPreviewUrl}
                partition="persist:ppt-preview"
                webpreferences="sandbox=true,contextIsolation=true,nodeIntegration=false"
                allowpopups={false}
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                }}
              />
            ) : (
              <iframe
                ref={iframeRef}
                src={htmlPreviewUrl}
                className="h-full w-full border-0"
                sandbox="allow-scripts allow-same-origin"
                title="PPT Preview"
              />
            )
          ) : (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-6 animate-spin" strokeWidth={1.75} />
            </div>
          )
        ) : (
          <div className="h-full overflow-auto p-4">
            <pre className="whitespace-pre-wrap font-mono text-xs text-gray-600 dark:text-gray-300">
              {cleanedHtml || generatedHtml}
            </pre>
          </div>
        )}
      </div>
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
            生成 PPT
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
            disabled={!cleanedHtml.trim() || saving}
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
        return "生成 PPT";
      case "generating":
        return "生成中";
      case "preview":
        return "预览 PPT";
      default:
        return "生成 PPT";
    }
  };

  // 根据步骤获取副标题
  const getModalSubtitle = () => {
    switch (step) {
      case "select-resources":
        return "选择风格和资源，AI 将自动分析并生成精美的演示文稿";
      case "generating":
        return `正在生成「${selectedTemplate.name}」风格的 PPT...`;
      case "preview":
        return "检查生成的 PPT，可保存为笔记";
      default:
        return "";
    }
  };

  return (
    <CustomModal
      open={open}
      onCancel={handleClose}
      width={800}
      centered
      destroyOnClose
      title={getModalTitle()}
      subtitle={getModalSubtitle()}
      icon={<Presentation className="h-5 w-5 text-orange-500" strokeWidth={1.75} />}
      iconBgColor="bg-orange-50 dark:bg-orange-500/20 border-orange-200 dark:border-orange-500/30"
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

PPTGenerateModal.displayName = "PPTGenerateModal";

export default PPTGenerateModal;

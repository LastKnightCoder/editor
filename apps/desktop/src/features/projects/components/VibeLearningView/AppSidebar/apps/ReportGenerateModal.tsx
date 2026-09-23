import { isElectron } from "@/electron";
import { useHtmlPreviewUrl } from "@/utils/html-preview";
import { memo, useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Spin } from "antd";
import { FileBarChart, Sparkles, RefreshCw, Loader2, CheckCircle2, Code, Eye } from "lucide-react";
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
import { cleanReportHtmlContent } from "@/constants/prompts/report-generation";
import {
  REPORT_TEMPLATES,
  DEFAULT_REPORT_TEMPLATE_ID,
  getReportTemplateById,
} from "@/constants/report-templates";
import { GenerationConfigStep, GeneratingProgress } from "../components";
import ReportTemplateSelector from "../components/ReportTemplateSelector";
import { runGenerationTask } from "@/services/generation-orchestrator";
import { toast } from "@tau/ui";

interface ReportGenerateModalProps {
  open: boolean;
  projectId: number;
  mainDbName: string;
  onClose: () => void;
  onNoteCreated?: (note: VLNote) => void;
}

type Step = "select-resources" | "generating" | "preview";

const ReportGenerateModal = memo((props: ReportGenerateModalProps) => {
  const { open, projectId, mainDbName, onClose, onNoteCreated } = props;

  const { providerConfig, modelConfig } = useLLMConfig("chat");

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
    sourceId: `report-generation-${projectId}`,
    enabled: open,
  });

  const [step, setStep] = useState<Step>("select-resources");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(DEFAULT_REPORT_TEMPLATE_ID);
  const [userPrompt, setUserPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedHtml, setGeneratedHtml] = useState("");
  const [cleanedHtml, setCleanedHtml] = useState("");
  const [toolExecutions, setToolExecutions] = useState<ToolCallExecutionState[]>([]);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"preview" | "source">("preview");

  const selectedTemplate = useMemo(
    () => getReportTemplateById(selectedTemplateId) || REPORT_TEMPLATES[0],
    [selectedTemplateId]
  );

  const abortControllerRef = useRef<AbortController | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const resetState = useMemoizedFn(() => {
    setStep("select-resources");
    setSelectedTemplateId(DEFAULT_REPORT_TEMPLATE_ID);
    setUserPrompt("");
    setIsGenerating(false);
    setGeneratedHtml("");
    setCleanedHtml("");
    setToolExecutions([]);
    setSaving(false);
    setViewMode("preview");
    resetResources();
  });

  useEffect(() => {
    if (open) {
      resetState();
      loadResources();
    }
  }, [open, loadResources, resetState]);

  const processGeneratedHtml = useMemoizedFn((rawHtml: string) => {
    const cleaned = cleanReportHtmlContent(rawHtml);
    setCleanedHtml(cleaned);
  });

  const htmlPreviewUrl = useHtmlPreviewUrl(cleanedHtml);

  useEffect(() => {
    return () => {
      if (!isElectron && htmlPreviewUrl && htmlPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(htmlPreviewUrl);
      }
    };
  }, [htmlPreviewUrl, isElectron]);

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
        taskType: "report",
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
          console.error("Generate Report error:", e);
          toast.error(e.message || "生成报告失败");
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

  const handleRegenerate = useMemoizedFn(() => {
    setStep("select-resources");
    setGeneratedHtml("");
    setCleanedHtml("");
  });

  const handleSave = useMemoizedFn(async () => {
    if (!cleanedHtml.trim()) {
      toast.error("没有可保存的内容");
      return;
    }

    setSaving(true);

    try {
      const markdownContent = `\`\`\`html\n${cleanedHtml}\n\`\`\``;
      const noteContent = importFromMarkdown(markdownContent);

      const count = getContentLength(noteContent);
      const newContentId = await createContent(noteContent, count);

      if (!newContentId) {
        throw new Error("创建内容失败");
      }

      const titleMatch = cleanedHtml.match(/<title>(.*?)<\/title>/i);
      const reportTitle = titleMatch ? titleMatch[1] : "报告";

      const note = await createVLNote({
        projectId,
        contentId: newContentId,
        title: reportTitle,
        type: "report",
      });

      toast.success("报告已保存为笔记");
      onNoteCreated?.(note);
      onClose();
    } catch (e) {
      console.error("Failed to save Report:", e);
      toast.error((e as Error).message || "保存失败");
    } finally {
      setSaving(false);
    }
  });

  const handleClose = useMemoizedFn(() => {
    if (isGenerating && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    onClose();
  });

  const getToolStatusText = useMemoizedFn(() => {
    const activeTools = toolExecutions.filter(
      t => t.status === "executing" || t.status === "pending"
    );
    if (activeTools.length === 0) {
      if (generatedHtml) {
        return "正在生成报告...";
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

  const renderResourceSelect = () => (
    <div className="space-y-5">
      <GenerationConfigStep
        resources={resources}
        selectedResourceIds={selectedResourceIds}
        loading={loadingResources}
        isAllSelected={isAllSelected}
        onToggleResource={toggleResource}
        onToggleAll={toggleAll}
        userPrompt={userPrompt}
        onUserPromptChange={setUserPrompt}
        promptPlaceholder="例如：重点分析营收数据，使用更多图表展示趋势..."
        promptTitle="额外要求（可选）"
        resourceTitle="选择资源"
        emptyResourceText="暂无可用资源"
      />

      <ReportTemplateSelector
        selectedTemplateId={selectedTemplateId}
        onSelectTemplate={setSelectedTemplateId}
        title="选择报告风格"
      />
    </div>
  );

  const renderGenerating = () => (
    <GeneratingProgress
      statusText={getToolStatusText()}
      outputText={generatedHtml}
      outputLabel="报告"
      toolExecutions={toolExecutions}
      onStop={handleStopGenerate}
      showStopButton
    />
  );

  const renderPreview = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
          报告预览
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
            <Eye className="h-3.5 w-3.5" />
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
            <Code className="h-3.5 w-3.5" />
            源码
          </button>
        </div>
      </div>

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
                partition="persist:report-preview"
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
                title="Report Preview"
              />
            )
          ) : (
            <div className="flex h-full items-center justify-center">
              <Spin size="large" />
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
            <Sparkles className="h-4 w-4" />
            生成报告
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
          <RefreshCw className="h-4 w-4" />
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
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            保存为笔记
          </button>
        </div>
      </div>
    );
  };

  const getModalTitle = () => {
    switch (step) {
      case "select-resources":
        return "生成报告";
      case "generating":
        return "生成中";
      case "preview":
        return "预览报告";
      default:
        return "生成报告";
    }
  };

  const getModalSubtitle = () => {
    switch (step) {
      case "select-resources":
        return "选择风格和资源，AI 将自动分析并生成精美的数据报告";
      case "generating":
        return `正在生成「${selectedTemplate.name}」风格的报告...`;
      case "preview":
        return "检查生成的报告，可保存为笔记";
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
      icon={<FileBarChart className="h-5 w-5 text-[var(--th-text-secondary)]" />}
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

ReportGenerateModal.displayName = "ReportGenerateModal";

export default ReportGenerateModal;

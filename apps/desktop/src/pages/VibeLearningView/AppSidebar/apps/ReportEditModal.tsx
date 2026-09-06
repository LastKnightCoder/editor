import { memo, useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { App } from "antd";
import { FileBarChart, Sparkles, RefreshCw, Loader2, CheckCircle2, Code, Eye } from "lucide-react";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";

import CustomModal from "@/components/CustomModal";
import useLLMConfig from "@/hooks/useLLMConfig";
import useVLResourceSelection from "@/hooks/useVLResourceSelection";
import useVLTools from "@/hooks/useVLTools";
import { updateVLNote } from "@/commands/vibe-learning";
import { getContentById, updateContent } from "@/commands/content";
import { ToolCallExecutionState } from "@/types";
import { VLNote } from "@/types/vibe-learning";
import { importFromMarkdown, getMarkdown } from "@/utils";
import { cleanReportHtmlContent } from "@/constants/prompts/report-generation";
import { GenerationConfigStep, GeneratingProgress } from "../components";
import { runGenerationTask } from "@/services/generation-orchestrator";

interface ReportEditModalProps {
  open: boolean;
  note: VLNote | null;
  projectId: number;
  mainDbName: string;
  onClose: () => void;
  onNoteUpdated?: (note: VLNote) => void;
}

type Step = "config" | "generating" | "preview";

const ReportEditModal = memo((props: ReportEditModalProps) => {
  const { open, note, projectId, mainDbName, onClose, onNoteUpdated } = props;
  const { message } = App.useApp();

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
  } = useVLResourceSelection(projectId, {
    onlyReady: true,
    defaultSelectAll: false,
  });

  useVLTools({
    projectId,
    mainDbName,
    sourceId: `report-edit-${note?.id || 0}`,
    enabled: open,
  });

  const [step, setStep] = useState<Step>("config");
  const [currentHtml, setCurrentHtml] = useState<string>("");
  const [userPrompt, setUserPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedHtml, setGeneratedHtml] = useState("");
  const [cleanedHtml, setCleanedHtml] = useState("");
  const [toolExecutions, setToolExecutions] = useState<ToolCallExecutionState[]>([]);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"preview" | "source">("preview");
  const [showPreview, setShowPreview] = useState(true);

  const abortControllerRef = useRef<AbortController | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const isElectron = typeof window !== "undefined" && !!window.electron;

  const loadReportContent = useMemoizedFn(async (noteToLoad: VLNote) => {
    try {
      const content = await getContentById(noteToLoad.contentId);
      if (!content) {
        message.error("无法加载报告内容");
        return;
      }

      const markdown = getMarkdown(content.content);
      const htmlContent = cleanReportHtmlContent(markdown);

      if (htmlContent && htmlContent.trim()) {
        setCurrentHtml(htmlContent);
      } else {
        message.error("无法解析报告内容");
      }
    } catch (e) {
      console.error("Failed to load report content:", e);
      message.error("加载报告失败");
    }
  });

  const resetState = useMemoizedFn(() => {
    setStep("config");
    setUserPrompt("");
    setIsGenerating(false);
    setGeneratedHtml("");
    setCleanedHtml("");
    setToolExecutions([]);
    setSaving(false);
    setViewMode("preview");
    setShowPreview(true);
    resetResources();
  });

  useEffect(() => {
    if (open && note) {
      resetState();
      loadResources();
      loadReportContent(note);
    }
  }, [open, note, loadResources, resetState, loadReportContent]);

  const processGeneratedHtml = useMemoizedFn((rawHtml: string) => {
    const cleaned = cleanReportHtmlContent(rawHtml);
    setCleanedHtml(cleaned);
  });

  const htmlPreviewUrl = useMemo(() => {
    const htmlToPreview = cleanedHtml || currentHtml;
    if (!htmlToPreview) return "";

    if (isElectron) {
      return `data:text/html;charset=utf-8,${encodeURIComponent(htmlToPreview)}`;
    } else {
      const blob = new Blob([htmlToPreview], { type: "text/html" });
      return URL.createObjectURL(blob);
    }
  }, [cleanedHtml, currentHtml, isElectron]);

  useEffect(() => {
    return () => {
      if (!isElectron && htmlPreviewUrl && htmlPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(htmlPreviewUrl);
      }
    };
  }, [htmlPreviewUrl, isElectron]);

  const handleStartEdit = useMemoizedFn(async () => {
    if (!userPrompt.trim()) {
      message.error("请输入编辑指令");
      return;
    }

    if (!providerConfig || !modelConfig) {
      message.error("请先在设置中配置 AI 模型");
      return;
    }

    if (!currentHtml) {
      message.error("无法获取当前报告内容");
      return;
    }

    setStep("generating");
    setIsGenerating(true);
    setGeneratedHtml("");
    setCleanedHtml("");
    setToolExecutions([]);

    const selectedResourceNames = getSelectedResourceNames();
    runGenerationTask(
      providerConfig,
      modelConfig,
      {
        taskType: "report_edit",
        sourceType: "vibe_learning",
        taskPayload: {
          currentHtml,
        },
        sourcePayload: {
          projectId,
          mainDbName,
          resourceNames: selectedResourceNames,
          userPrompt,
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
          console.error("Edit Report error:", e);
          message.error(e.message || "编辑报告失败");
          if (!generatedHtml) {
            setStep("config");
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
      setStep("config");
    }
  });

  const handleReEdit = useMemoizedFn(() => {
    setStep("config");
    setGeneratedHtml("");
    setCleanedHtml("");
  });

  const handleDiscard = useMemoizedFn(() => {
    setCleanedHtml("");
    setGeneratedHtml("");
    setStep("config");
  });

  const handleSave = useMemoizedFn(async () => {
    if (!note) {
      message.error("笔记信息丢失");
      return;
    }

    const htmlToSave = cleanedHtml || currentHtml;
    if (!htmlToSave.trim()) {
      message.error("没有可保存的内容");
      return;
    }

    setSaving(true);

    try {
      const markdownContent = `\`\`\`html\n${htmlToSave}\n\`\`\``;
      const noteContent = importFromMarkdown(markdownContent);

      await updateContent(note.contentId, noteContent);

      const titleMatch = htmlToSave.match(/<title>(.*?)<\/title>/i);
      const newTitle = titleMatch ? titleMatch[1] : note.title;

      const updatedNote = await updateVLNote({
        id: note.id,
        title: newTitle,
      });

      message.success("保存成功");

      if (updatedNote) {
        onNoteUpdated?.(updatedNote);
      }

      onClose();
    } catch (e) {
      console.error("Failed to save Report:", e);
      message.error((e as Error).message || "保存失败");
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

  const renderConfigStep = () => (
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
        promptPlaceholder="例如：添加一个关于市场分析的章节，更新图表数据..."
        promptTitle="编辑指令"
        resourceTitle="选择参考资源（可选）"
        emptyResourceText="暂无可用资源"
      />

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          onClick={handleClose}
          className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-zinc-800"
        >
          取消
        </button>
        <button
          onClick={handleStartEdit}
          disabled={!userPrompt.trim()}
          className={classNames(
            "rounded-lg px-4 py-2 text-sm font-medium transition-all",
            "flex items-center gap-2",
            userPrompt.trim()
              ? "bg-[var(--th-btn-bg)] text-[var(--th-btn-text)] hover:bg-[var(--th-btn-hover)]"
              : "cursor-not-allowed bg-gray-300 text-gray-500 dark:bg-zinc-700 dark:text-gray-400"
          )}
        >
          <Sparkles className="h-4 w-4" />
          开始编辑
        </button>
      </div>
    </div>
  );

  const renderGeneratingStep = () => (
    <div className="space-y-5">
      <GeneratingProgress
        statusText={getToolStatusText()}
        outputText={generatedHtml}
        outputLabel="报告"
        toolExecutions={toolExecutions}
        onStop={handleStopGenerate}
        showStopButton
      />
    </div>
  );

  const renderPreviewStep = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("preview")}
            className={classNames(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              viewMode === "preview"
                ? "bg-[var(--th-btn-bg)] text-[var(--th-btn-text)]"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800"
            )}
          >
            <Eye className="h-4 w-4" />
            预览
          </button>
          <button
            onClick={() => setViewMode("source")}
            className={classNames(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              viewMode === "source"
                ? "bg-[var(--th-btn-bg)] text-[var(--th-btn-text)]"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800"
            )}
          >
            <Code className="h-4 w-4" />
            源码
          </button>
        </div>

        <button
          onClick={() => setShowPreview(!showPreview)}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800"
        >
          {showPreview ? "隐藏预览" : "显示预览"}
        </button>
      </div>

      {showPreview && (
        <div className="relative w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-zinc-900">
          <div style={{ height: 400 }} className="w-full">
            {viewMode === "preview" ? (
              htmlPreviewUrl ? (
                isElectron ? (
                  <webview
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ref={iframeRef as any}
                    src={htmlPreviewUrl}
                    className="h-full w-full"
                    partition="persist:report-preview"
                    webpreferences="sandbox=true,contextIsolation=true,nodeIntegration=false"
                    allowpopups={false}
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
                <div className="flex h-full w-full items-center justify-center text-gray-500">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              )
            ) : (
              <div className="h-full w-full overflow-auto p-4">
                <pre className="whitespace-pre-wrap break-words text-xs text-gray-800 dark:text-gray-200">
                  {cleanedHtml || currentHtml}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={handleReEdit}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-zinc-800"
        >
          <RefreshCw className="h-4 w-4" />
          重新编辑
        </button>

        <div className="flex items-center gap-3">
          {cleanedHtml && (
            <button
              onClick={handleDiscard}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-zinc-800"
            >
              放弃修改
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className={classNames(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
              saving
                ? "cursor-not-allowed bg-gray-300 text-gray-500 dark:bg-zinc-700"
                : "bg-[var(--th-btn-bg)] text-[var(--th-btn-text)] hover:bg-[var(--th-btn-hover)]"
            )}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                保存
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  const getStepTitle = () => {
    switch (step) {
      case "config":
        return "编辑报告";
      case "generating":
        return "正在编辑...";
      case "preview":
        return "预览修改";
      default:
        return "编辑报告";
    }
  };

  return (
    <CustomModal
      open={open}
      onCancel={handleClose}
      width={step === "preview" ? 1000 : 800}
      centered
      footer={null}
      title={
        <div className="flex items-center gap-2">
          <FileBarChart className="h-5 w-5 text-[var(--th-accent)]" />
          <span>{getStepTitle()}</span>
          {note && <span className="text-sm text-gray-500 dark:text-gray-400">- {note.title}</span>}
        </div>
      }
    >
      <div className="p-6">
        <AnimatePresence mode="wait">
          {step === "config" && (
            <motion.div
              key="config"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderConfigStep()}
            </motion.div>
          )}

          {step === "generating" && (
            <motion.div
              key="generating"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderGeneratingStep()}
            </motion.div>
          )}

          {step === "preview" && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderPreviewStep()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </CustomModal>
  );
});

ReportEditModal.displayName = "ReportEditModal";

export default ReportEditModal;

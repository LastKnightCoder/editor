import { memo, useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { App } from "antd";
import {
  Presentation,
  Sparkles,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Code,
  Eye,
} from "lucide-react";
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
import { cleanPPTHtmlContent } from "@/constants/prompts/ppt-generation";
import { GenerationConfigStep, GeneratingProgress } from "../components";
import { runGenerationTask } from "@/services/generation-orchestrator";

interface PPTEditModalProps {
  open: boolean;
  note: VLNote | null;
  projectId: number;
  mainDbName: string;
  onClose: () => void;
  onNoteUpdated?: (note: VLNote) => void;
}

type Step = "config" | "generating" | "preview";

const PPTEditModal = memo((props: PPTEditModalProps) => {
  const { open, note, projectId, mainDbName, onClose, onNoteUpdated } = props;
  const { message } = App.useApp();

  // LLM 配置
  const { providerConfig, modelConfig } = useLLMConfig("chat");

  // 资源选择（默认不选中任何资源）
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

  // 注册 VibeLearning 专属工具
  useVLTools({
    projectId,
    mainDbName,
    sourceId: `ppt-edit-${note?.id || 0}`,
    enabled: open,
  });

  // 本地状态
  const [step, setStep] = useState<Step>("config");
  const [currentHtml, setCurrentHtml] = useState<string>("");
  const [userPrompt, setUserPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedHtml, setGeneratedHtml] = useState("");
  const [cleanedHtml, setCleanedHtml] = useState("");
  const [toolExecutions, setToolExecutions] = useState<
    ToolCallExecutionState[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"preview" | "source">("preview");
  const [showPreview, setShowPreview] = useState(true);

  const abortControllerRef = useRef<AbortController | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // 检查是否是 Electron 环境
  const isElectron = typeof window !== "undefined" && !!window.electron;

  // 加载现有 PPT 内容
  const loadPPTContent = useMemoizedFn(async (noteToLoad: VLNote) => {
    try {
      // 获取 Content
      const content = await getContentById(noteToLoad.contentId);
      if (!content) {
        message.error("无法加载 PPT 内容");
        return;
      }

      // 使用与 NoteEditorView 相同的宽松解析方式
      // 1. 将 Slate 内容转换为 Markdown
      const markdown = getMarkdown(content.content);

      // 2. 使用 cleanPPTHtmlContent 提取 HTML（支持多种格式）
      const htmlContent = cleanPPTHtmlContent(markdown);

      if (htmlContent && htmlContent.trim()) {
        setCurrentHtml(htmlContent);
      } else {
        message.error("无法解析 PPT 内容");
      }
    } catch (e) {
      console.error("Failed to load PPT content:", e);
      message.error("加载 PPT 失败");
    }
  });

  // 重置状态
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

  // 打开弹窗时加载资源和 PPT 内容
  useEffect(() => {
    if (open && note) {
      resetState();
      loadResources();
      loadPPTContent(note);
    }
  }, [open, note, loadResources, resetState, loadPPTContent]);

  // 清理并处理生成的 HTML
  const processGeneratedHtml = useMemoizedFn((rawHtml: string) => {
    const cleaned = cleanPPTHtmlContent(rawHtml);
    setCleanedHtml(cleaned);
  });

  // 生成 HTML 预览 URL
  const htmlPreviewUrl = useMemo(() => {
    const htmlToPreview = cleanedHtml || currentHtml;
    if (!htmlToPreview) return "";

    if (isElectron) {
      // Electron webview 支持 data URL
      return `data:text/html;charset=utf-8,${encodeURIComponent(htmlToPreview)}`;
    } else {
      // 浏览器使用 Blob URL
      const blob = new Blob([htmlToPreview], { type: "text/html" });
      return URL.createObjectURL(blob);
    }
  }, [cleanedHtml, currentHtml, isElectron]);

  // 清理 Blob URL
  useEffect(() => {
    return () => {
      if (!isElectron && htmlPreviewUrl && htmlPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(htmlPreviewUrl);
      }
    };
  }, [htmlPreviewUrl, isElectron]);

  // 开始 AI 编辑
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
      message.error("无法获取当前 PPT 内容");
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
        taskType: "ppt_edit",
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
        onUpdate: (responseText) => {
          setGeneratedHtml(responseText);
        },
        onFinish: (content) => {
          setIsGenerating(false);
          setGeneratedHtml(content);
          processGeneratedHtml(content);
          setStep("preview");
        },
        onError: (e) => {
          setIsGenerating(false);
          console.error("Edit PPT error:", e);
          message.error(e.message || "编辑 PPT 失败");
          if (!generatedHtml) {
            setStep("config");
          } else {
            processGeneratedHtml(generatedHtml);
            setStep("preview");
          }
        },
        onController: (controller) => {
          abortControllerRef.current = controller;
        },
        onToolCallsUpdate: (executions) => {
          setToolExecutions(executions);
        },
      },
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
      setStep("config");
    }
  });

  // 重新编辑
  const handleReEdit = useMemoizedFn(() => {
    setStep("config");
    setGeneratedHtml("");
    setCleanedHtml("");
  });

  // 放弃修改
  const handleDiscard = useMemoizedFn(() => {
    setCleanedHtml("");
    setGeneratedHtml("");
    setStep("config");
  });

  // 保存修改
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
      // 将 HTML 内容保存为 Markdown 格式
      const markdownContent = `\`\`\`html\n${htmlToSave}\n\`\`\``;
      const noteContent = importFromMarkdown(markdownContent);

      // 更新 Content
      await updateContent(note.contentId, noteContent);

      // 提取新标题（如果有变化）
      const titleMatch = htmlToSave.match(/<title>(.*?)<\/title>/i);
      const newTitle = titleMatch ? titleMatch[1] : note.title;

      // 更新 VLNote（只更新标题，updateTime 由后端自动更新）
      const updatedNote = await updateVLNote({
        id: note.id,
        title: newTitle,
      });

      message.success("保存成功");

      // 回调通知更新了笔记
      if (updatedNote) {
        onNoteUpdated?.(updatedNote);
      }

      onClose();
    } catch (e) {
      console.error("Failed to save PPT:", e);
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
      if (generatedHtml) {
        return "正在生成 PPT...";
      }
      return "正在分析资料...";
    }

    const executingTool = activeTools.find((t) => t.status === "executing");
    if (executingTool) {
      const toolNameMap: Record<string, string> = {
        list_project_resources: "获取资源列表",
        read_resource_content: "读取资源内容",
        read_resource_range: "分段读取内容",
        list_resource_chapters: "查看章节结构",
        read_resource_chapter: "读取章节正文",
        read_resource_chapter_range: "分段读取章节",
        read_search_hit_context: "补读命中上下文",
        search_project_knowledge: "搜索知识库",
      };
      return toolNameMap[executingTool.toolName] || "执行工具调用";
    }

    return "准备获取资料...";
  });

  // 渲染配置步骤
  const renderConfigStep = () => (
    <div className="space-y-5">
      {/* 资源选择和编辑指令 */}
      <GenerationConfigStep
        resources={resources}
        selectedResourceIds={selectedResourceIds}
        loading={loadingResources}
        isAllSelected={isAllSelected}
        onToggleResource={toggleResource}
        onToggleAll={toggleAll}
        userPrompt={userPrompt}
        onUserPromptChange={setUserPrompt}
        promptPlaceholder="例如：添加一页关于实战案例的内容，补充更多数据可视化..."
        promptTitle="编辑指令"
        resourceTitle="选择参考资源（可选）"
        emptyResourceText="暂无可用资源"
      />

      {/* 操作按钮 */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          onClick={handleClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
        >
          取消
        </button>
        <button
          onClick={handleStartEdit}
          disabled={!userPrompt.trim()}
          className={classNames(
            "px-4 py-2 text-sm font-medium rounded-lg transition-all",
            "flex items-center gap-2",
            userPrompt.trim()
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-gray-300 dark:bg-zinc-700 text-gray-500 dark:text-gray-400 cursor-not-allowed",
          )}
        >
          <Sparkles className="w-4 h-4" />
          开始编辑
        </button>
      </div>
    </div>
  );

  // 渲染生成中步骤
  const renderGeneratingStep = () => (
    <div className="space-y-5">
      <GeneratingProgress
        statusText={getToolStatusText()}
        toolExecutions={toolExecutions}
        onStop={handleStopGenerate}
        showStopButton
      />
    </div>
  );

  // 渲染预览步骤
  const renderPreviewStep = () => (
    <div className="space-y-4">
      {/* 视图切换 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("preview")}
            className={classNames(
              "px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2",
              viewMode === "preview"
                ? "bg-blue-600 text-white"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800",
            )}
          >
            <Eye className="w-4 h-4" />
            预览
          </button>
          <button
            onClick={() => setViewMode("source")}
            className={classNames(
              "px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2",
              viewMode === "source"
                ? "bg-blue-600 text-white"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800",
            )}
          >
            <Code className="w-4 h-4" />
            源码
          </button>
        </div>

        <button
          onClick={() => setShowPreview(!showPreview)}
          className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
        >
          {showPreview ? "隐藏预览" : "显示预览"}
        </button>
      </div>

      {/* 预览区域 */}
      {showPreview && (
        <div className="relative w-full bg-gray-100 dark:bg-zinc-900 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          <div className="aspect-video w-full">
            {viewMode === "preview" ? (
              htmlPreviewUrl ? (
                isElectron ? (
                  <webview
                    ref={iframeRef as any}
                    src={htmlPreviewUrl}
                    className="w-full h-full"
                    partition="persist:ppt-preview"
                    webpreferences="sandbox=true,contextIsolation=true,nodeIntegration=false"
                    allowpopups={false}
                  />
                ) : (
                  <iframe
                    ref={iframeRef}
                    src={htmlPreviewUrl}
                    className="w-full h-full border-0"
                    sandbox="allow-scripts allow-same-origin"
                    title="PPT Preview"
                  />
                )
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </div>
              )
            ) : (
              <div className="w-full h-full overflow-auto p-4">
                <pre className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                  {cleanedHtml || currentHtml}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={handleReEdit}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          重新编辑
        </button>

        <div className="flex items-center gap-3">
          {cleanedHtml && (
            <button
              onClick={handleDiscard}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              放弃修改
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className={classNames(
              "px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2",
              saving
                ? "bg-gray-300 dark:bg-zinc-700 text-gray-500 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white",
            )}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                保存
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  // 获取步骤标题
  const getStepTitle = () => {
    switch (step) {
      case "config":
        return "编辑 PPT";
      case "generating":
        return "正在编辑...";
      case "preview":
        return "预览修改";
      default:
        return "编辑 PPT";
    }
  };

  return (
    <CustomModal
      open={open}
      onCancel={handleClose}
      width={step === "preview" ? 1400 : 800}
      centered
      footer={null}
      title={
        <div className="flex items-center gap-2">
          <Presentation className="w-5 h-5 text-blue-600" />
          <span>{getStepTitle()}</span>
          {note && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              - {note.title}
            </span>
          )}
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

PPTEditModal.displayName = "PPTEditModal";

export default PPTEditModal;

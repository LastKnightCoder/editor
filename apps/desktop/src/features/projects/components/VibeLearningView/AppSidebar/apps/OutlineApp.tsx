import { memo, useState, useRef, useEffect } from "react";
import { Descendant } from "slate";
import { ArrowLeft, RotateCw, Copy } from "lucide-react";
import { useMemoizedFn } from "ahooks";
import { LoadingSpinner, EmptyState, SimpleButton } from "../components";

import { EditorRef } from "@tau/editor/src";
import Editor from "@/components/ContentEditor";
import ErrorBoundary from "@/components/ErrorBoundary";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import useLLMConfig from "@/hooks/useLLMConfig";
import useVLTools from "@/hooks/useVLTools";
import { getVLResourcesByProjectId, createVLNote } from "@/commands/vibe-learning";
import { createContent, updateContent, getContentById } from "@/commands";
import { VLNote, VLResource } from "@/types/vibe-learning";
import { importFromMarkdown, getContentLength, getMarkdown } from "@/utils";
import { runGenerationTask } from "@/services/generation-orchestrator";
import { toast } from "@tau/ui";

// 默认空内容
const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    disableDrag: false,
    children: [{ type: "formatted", text: "" }],
  },
];

interface OutlineAppProps {
  projectId: number;
  mainDbName: string;
  onBack: () => void;
  onNoteCreated?: (note: VLNote) => void;
  /** 选中的资源列表（可选，如果提供则只使用这些资源） */
  selectedResources?: VLResource[];
  /** 用户额外提示（可选） */
  userPrompt?: string;
  /** @deprecated 使用 OutlineGenerateModal 代替 autoStart 模式 */
  autoStart?: boolean;
}

const OutlineApp = memo((props: OutlineAppProps) => {
  const dynamicExtensions = useDynamicExtensionsStore(state => state.extensions);
  const {
    projectId,
    mainDbName,
    onBack,
    onNoteCreated,
    selectedResources,
    userPrompt: propUserPrompt,
    autoStart,
  } = props;

  const { providerConfig, modelConfig } = useLLMConfig("chat");

  useVLTools({
    projectId,
    mainDbName,
    sourceId: `outline-app-${projectId}`,
    enabled: true,
  });

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [slateContent, setSlateContent] = useState<Descendant[]>(DEFAULT_CONTENT);
  const [markdownContent, setMarkdownContent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [hasContent, setHasContent] = useState(false);

  // 笔记相关状态
  const [outlineNote, setOutlineNote] = useState<VLNote | null>(null);
  const [contentId, setContentId] = useState<number | null>(null);

  const editorRef = useRef<EditorRef>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastSavedMarkdownRef = useRef<string>("");

  // 获取要使用的资源名称
  const getResourceNames = useMemoizedFn(async () => {
    // 如果提供了 selectedResources，使用它们；否则获取所有资源
    let resourcesToUse: VLResource[];

    if (selectedResources && selectedResources.length > 0) {
      resourcesToUse = selectedResources;
    } else {
      // 获取所有资源
      const resources = await getVLResourcesByProjectId(projectId);
      if (resources.length === 0) {
        throw new Error("项目中暂无资料，请先添加学习资料");
      }

      // 过滤出已有 markdown 的资源（已完成转换的）
      resourcesToUse = resources.filter(r => r.markdownPath);
      if (resourcesToUse.length === 0) {
        throw new Error("资料正在处理中，请稍后再试");
      }
    }

    const resourceNames = resourcesToUse.map(resource => resource.name).filter(Boolean);

    if (resourceNames.length === 0) {
      throw new Error("无法读取资料内容，请检查资料是否已完成处理");
    }

    return resourceNames;
  });

  // 保存大纲为笔记
  const saveOutlineAsNote = useMemoizedFn(async (markdown: string) => {
    if (!markdown || markdown === lastSavedMarkdownRef.current) {
      return;
    }

    try {
      // 将 Markdown 转换为 Slate 格式
      const content = importFromMarkdown(markdown);
      const count = getContentLength(content);

      if (contentId && outlineNote) {
        // 更新现有内容
        const previous = await getContentById(contentId);
        if (
          previous?.revision &&
          getMarkdown(previous.content) !==
            getMarkdown(importFromMarkdown(lastSavedMarkdownRef.current))
        )
          throw new Error("大纲已被其他视图修改，请保留当前生成结果后重试");
        await updateContent(contentId, content, previous?.revision);
        lastSavedMarkdownRef.current = markdown;
      } else {
        // 创建新内容和笔记
        const newContentId = await createContent(content, count);
        if (newContentId) {
          setContentId(newContentId);
          const note = await createVLNote({
            projectId,
            contentId: newContentId,
            title: "学习大纲",
          });
          setOutlineNote(note);
          lastSavedMarkdownRef.current = markdown;
          // 通知父组件笔记已创建
          onNoteCreated?.(note);
        }
      }
    } catch (e) {
      console.error("Failed to save outline as note:", e);
      setError(e instanceof Error ? e.message : "保存大纲失败");
    }
  });

  // 实时更新编辑器内容
  const updateEditorContent = useMemoizedFn((markdown: string) => {
    try {
      const content = importFromMarkdown(markdown);
      setSlateContent(content);
      setMarkdownContent(markdown);
      setHasContent(true);
      // 使用 setEditorValue 实时更新编辑器
      if (editorRef.current) {
        editorRef.current.setEditorValue(content);
      }
    } catch (e) {
      console.error("Failed to parse markdown:", e);
    }
  });

  // 生成大纲
  const generateOutline = useMemoizedFn(async () => {
    if (!providerConfig || !modelConfig) {
      toast.error("请先在设置中配置 AI 模型");
      return;
    }

    setLoading(true);
    setGenerating(true);
    setError(null);
    setSlateContent(DEFAULT_CONTENT);
    setMarkdownContent("");
    setHasContent(false);
    // 重置笔记状态以创建新笔记
    setOutlineNote(null);
    setContentId(null);
    lastSavedMarkdownRef.current = "";

    try {
      const resourceNames = await getResourceNames();

      // 调用 AI 生成
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
            userPrompt: propUserPrompt?.trim() || undefined,
          },
        },
        {
          onUpdate: responseText => {
            // 实时更新编辑器内容
            updateEditorContent(responseText);
          },
          onFinish: async content => {
            updateEditorContent(content);
            setGenerating(false);
            setLoading(false);
            // 最终保存
            await saveOutlineAsNote(content);
          },
          onError: e => {
            console.error("Generate outline error:", e);
            setError(e.message || "生成大纲失败");
            setGenerating(false);
            setLoading(false);
          },
          onController: controller => {
            abortControllerRef.current = controller;
          },
        }
      );
    } catch (e) {
      console.error("Generate outline error:", e);
      setError((e as Error).message || "生成大纲失败");
      setGenerating(false);
      setLoading(false);
    }
  });

  // 定期保存生成中的大纲
  useEffect(() => {
    if (!generating || !markdownContent) return;

    const timer = setInterval(() => {
      if (markdownContent && markdownContent !== lastSavedMarkdownRef.current) {
        saveOutlineAsNote(markdownContent);
      }
    }, 3000); // 每 3 秒保存一次

    return () => clearInterval(timer);
  }, [generating, markdownContent, saveOutlineAsNote]);

  // 停止生成
  const stopGeneration = useMemoizedFn(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setGenerating(false);
    setLoading(false);
    // 保存当前已生成的内容
    if (markdownContent) {
      await saveOutlineAsNote(markdownContent);
    }
  });

  // 复制大纲
  const copyOutline = useMemoizedFn(async () => {
    if (!markdownContent) return;
    try {
      await navigator.clipboard.writeText(markdownContent);
      toast.success("大纲已复制到剪贴板");
    } catch (e) {
      toast.error("复制失败");
    }
  });

  // 组件卸载时停止生成
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // autoStart 模式：组件挂载后自动开始生成
  useEffect(() => {
    if (autoStart && providerConfig && modelConfig && !loading && !generating) {
      generateOutline();
    }
    // 仅在组件挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, providerConfig, modelConfig]);

  // 处理编辑器内容变化（用户手动编辑时）
  const handleContentChange = useMemoizedFn((content: Descendant[]) => {
    if (!generating) {
      setSlateContent(content);
      // 同步更新 markdown 内容
      const markdown = getMarkdown(content);
      setMarkdownContent(markdown);
      if (contentId) lastSavedMarkdownRef.current = markdown;
    }
  });

  return (
    <div className="flex h-full flex-col">
      {/* 顶部栏 */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[#e8e8e8] px-4 py-3 dark:border-[#2a2a2a]">
        <button
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border-none bg-transparent transition-colors hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a]"
          onClick={onBack}
        >
          <ArrowLeft className="size-4 text-[#666] dark:text-[#999]" strokeWidth={1.75} />
        </button>

        <h3 className="m-0 flex-1 text-base font-medium text-[#333] dark:text-[#e0e0e0]">
          学习大纲
          {generating && (
            <span className="ml-2 inline-flex items-center text-sm font-normal text-[#999]">
              <LoadingSpinner size="small" className="mr-1" />
              生成中...
            </span>
          )}
        </h3>

        {hasContent && !generating && (
          <button
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border-none bg-transparent transition-colors hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a]"
            onClick={copyOutline}
            title="复制大纲"
          >
            <Copy className="size-4 text-[#666] dark:text-[#999]" strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto">
        {/* 未开始生成 */}
        {!hasContent && !loading && !error && (
          <div className="flex h-full flex-col items-center justify-center p-4">
            <EmptyState description="点击下方按钮生成学习大纲">
              <SimpleButton
                variant="primary"
                icon={<RotateCw strokeWidth={1.75} />}
                onClick={generateOutline}
                className="mt-4"
              >
                生成大纲
              </SimpleButton>
            </EmptyState>
          </div>
        )}

        {/* 加载中（获取资料阶段） */}
        {loading && !hasContent && (
          <div className="flex h-full flex-col items-center justify-center p-4">
            <LoadingSpinner size="large" />
            <p className="mt-4 text-sm text-[#999]">正在探索资料并生成大纲...</p>
          </div>
        )}

        {/* 错误状态 */}
        {error && !generating && (
          <div className="flex h-full flex-col items-center justify-center p-4">
            <EmptyState description={error}>
              <SimpleButton
                variant="primary"
                icon={<RotateCw strokeWidth={1.75} />}
                onClick={generateOutline}
                className="mt-4"
              >
                重新生成
              </SimpleButton>
            </EmptyState>
          </div>
        )}

        {/* 编辑器渲染大纲内容 */}
        {hasContent && (
          <div className="p-4">
            <ErrorBoundary>
              <Editor
                contentId={generating ? undefined : (contentId ?? undefined)}
                key="outline-editor"
                ref={editorRef}
                initValue={slateContent}
                onChange={handleContentChange}
                extensions={dynamicExtensions}
                readonly={generating}
              />
            </ErrorBoundary>
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      {hasContent && !generating && (
        <div className="shrink-0 border-t border-[#e8e8e8] p-4 dark:border-[#2a2a2a]">
          <SimpleButton block icon={<RotateCw strokeWidth={1.75} />} onClick={generateOutline}>
            重新生成
          </SimpleButton>
        </div>
      )}

      {/* 生成中的停止按钮 */}
      {generating && (
        <div className="shrink-0 border-t border-[#e8e8e8] p-4 dark:border-[#2a2a2a]">
          <SimpleButton block variant="danger" onClick={stopGeneration}>
            停止生成
          </SimpleButton>
        </div>
      )}
    </div>
  );
});

OutlineApp.displayName = "OutlineApp";

export default OutlineApp;

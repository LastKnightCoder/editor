import { memo, useState, useRef, useEffect } from "react";
import { Descendant } from "slate";
import { App } from "antd";
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  CopyOutlined,
} from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import { LoadingSpinner, EmptyState, SimpleButton } from "../components";

import { Editor, EditorRef } from "@tau/editor/src";
import ErrorBoundary from "@/components/ErrorBoundary";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import { chatLLMStream } from "@/hooks/useChatLLM";
import useLLMConfig from "@/hooks/useLLMConfig";
import {
  getVLResourcesByProjectId,
  readVLResourceContent,
  createVLNote,
} from "@/commands/vibe-learning";
import { createContent, updateContent } from "@/commands";
import { RequestMessage } from "@/types";
import { VLNote, VLResource } from "@/types/vibe-learning";
import { Role } from "@/constants";
import { importFromMarkdown, getContentLength, getMarkdown } from "@/utils";

// 大纲生成的 Prompt
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
  const dynamicExtensions = useDynamicExtensionsStore(
    (state) => state.extensions,
  );
  const {
    projectId,
    mainDbName,
    onBack,
    onNoteCreated,
    selectedResources,
    userPrompt: propUserPrompt,
    autoStart,
  } = props;
  const { message } = App.useApp();

  const { providerConfig, modelConfig } = useLLMConfig("chat");

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [slateContent, setSlateContent] =
    useState<Descendant[]>(DEFAULT_CONTENT);
  const [markdownContent, setMarkdownContent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [hasContent, setHasContent] = useState(false);

  // 笔记相关状态
  const [outlineNote, setOutlineNote] = useState<VLNote | null>(null);
  const [contentId, setContentId] = useState<number | null>(null);

  const editorRef = useRef<EditorRef>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastSavedMarkdownRef = useRef<string>("");

  // 获取资料内容用于生成大纲
  const fetchResourceContent = useMemoizedFn(async () => {
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
      resourcesToUse = resources.filter((r) => r.markdownPath);
      if (resourcesToUse.length === 0) {
        throw new Error("资料正在处理中，请稍后再试");
      }
    }

    // 读取每个资源的内容
    const contents: string[] = [];
    let totalLength = 0;

    for (const resource of resourcesToUse) {
      if (totalLength >= MAX_TOTAL_CONTENT_LENGTH) break;

      try {
        const result = await readVLResourceContent(
          projectId,
          resource.name,
          mainDbName,
        );
        if (result.success && result.content) {
          // 截取内容
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
        await updateContent(contentId, content);
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
      message.error("请先在设置中配置 AI 模型");
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
      // 获取资料内容
      const resourceContent = await fetchResourceContent();

      // 构建用户消息，加入额外提示
      let userMessage = `以下是学习资料的内容，请根据这些内容生成学习大纲：\n\n${resourceContent}`;
      if (propUserPrompt?.trim()) {
        userMessage += `\n\n额外要求：${propUserPrompt.trim()}`;
      }

      // 构建消息
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

      // 调用 AI 生成
      chatLLMStream(providerConfig, modelConfig, messages, {
        onUpdate: (responseText) => {
          // 实时更新编辑器内容
          updateEditorContent(responseText);
        },
        onFinish: async (content) => {
          updateEditorContent(content);
          setGenerating(false);
          setLoading(false);
          // 最终保存
          await saveOutlineAsNote(content);
        },
        onError: (e) => {
          console.error("Generate outline error:", e);
          setError(e.message || "生成大纲失败");
          setGenerating(false);
          setLoading(false);
        },
        onController: (controller) => {
          abortControllerRef.current = controller;
        },
      });
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
      message.success("大纲已复制到剪贴板");
    } catch (e) {
      message.error("复制失败");
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
    }
  });

  return (
    <div className="flex flex-col h-full">
      {/* 顶部栏 */}
      <div className="px-4 py-3 border-b border-[#e8e8e8] dark:border-[#2a2a2a] shrink-0 flex items-center gap-3">
        <button
          className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] transition-colors cursor-pointer border-none bg-transparent"
          onClick={onBack}
        >
          <ArrowLeftOutlined className="text-[#666] dark:text-[#999]" />
        </button>

        <h3 className="flex-1 text-base font-medium text-[#333] dark:text-[#e0e0e0] m-0">
          学习大纲
          {generating && (
            <span className="ml-2 text-sm font-normal text-[#999] inline-flex items-center">
              <LoadingSpinner size="small" className="mr-1" />
              生成中...
            </span>
          )}
        </h3>

        {hasContent && !generating && (
          <button
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] transition-colors cursor-pointer border-none bg-transparent"
            onClick={copyOutline}
            title="复制大纲"
          >
            <CopyOutlined className="text-[#666] dark:text-[#999]" />
          </button>
        )}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto">
        {/* 未开始生成 */}
        {!hasContent && !loading && !error && (
          <div className="flex flex-col items-center justify-center h-full p-4">
            <EmptyState description="点击下方按钮生成学习大纲">
              <SimpleButton
                variant="primary"
                icon={<ReloadOutlined />}
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
          <div className="flex flex-col items-center justify-center h-full p-4">
            <LoadingSpinner size="large" />
            <p className="text-sm text-[#999] mt-4">正在分析资料...</p>
          </div>
        )}

        {/* 错误状态 */}
        {error && !generating && (
          <div className="flex flex-col items-center justify-center h-full p-4">
            <EmptyState description={error}>
              <SimpleButton
                variant="primary"
                icon={<ReloadOutlined />}
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
        <div className="p-4 border-t border-[#e8e8e8] dark:border-[#2a2a2a] shrink-0">
          <SimpleButton
            block
            icon={<ReloadOutlined />}
            onClick={generateOutline}
          >
            重新生成
          </SimpleButton>
        </div>
      )}

      {/* 生成中的停止按钮 */}
      {generating && (
        <div className="p-4 border-t border-[#e8e8e8] dark:border-[#2a2a2a] shrink-0">
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

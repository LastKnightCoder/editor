import { memo, useEffect, useRef, useState, useMemo } from "react";
import { Descendant } from "slate";
import { App } from "antd";
import {
  ArrowLeftOutlined,
  MoreOutlined,
  CreditCardOutlined,
  DeleteOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  DownloadOutlined,
  PictureOutlined,
} from "@ant-design/icons";
import { useMemoizedFn, useUnmount, useRafInterval } from "ahooks";
import { LoadingSpinner } from "./components";
import { SelectDropDown } from "@tau/shared";
import { snapdom } from "@zumer/snapdom";

import { Editor, EditorRef } from "@tau/editor/src";
import ErrorBoundary from "@/components/ErrorBoundary";
import MindMapRenderer from "@/layouts/ContentLayout/components/ChatSidebar/MindMapRenderer";
import PodcastPlayer from "@/components/PodcastPlayer";
import { VLNote } from "@/types/vibe-learning";
import type { IPodcast } from "@/types/podcast";
import { getPodcastById } from "@/commands/podcast";
import {
  createVLNote,
  updateVLNote,
  deleteVLNote,
} from "@/commands/vibe-learning";
import { createContent, updateContent, getContentById } from "@/commands";
import { buildCardFromContent } from "@/commands/card";
import {
  getContentLength,
  getEditorText,
  importFromMarkdown,
  getMarkdown,
} from "@/utils";
import { cleanPPTHtmlContent } from "@/constants/prompts/ppt-generation";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
  chatReferenceExtension,
} from "@/editor-extensions";
import useTabStore from "@/stores/useTabStore";
import useOutlineGenerationStore from "@/stores/useOutlineGenerationStore";
import { TabType } from "@/types/tab";

const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
  chatReferenceExtension,
];

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    disableDrag: false,
    children: [{ type: "formatted", text: "" }],
  },
];

const removeControlChars = (input: string) =>
  Array.from(input)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return !(code < 32 || code === 127);
    })
    .join("");

const sanitizeFilename = (rawName: string, fallback: string) => {
  const name = (rawName || "").trim();
  const safe = (name || fallback)
    // 替换常见非法文件名字符（Windows/macOS/Linux）
    .replace(/[\\/:*?"<>|]/g, "_")
    // 去掉控制字符（避免 eslint no-control-regex）
    .trim();

  const withoutControls = removeControlChars(safe)
    // 规避结尾的点和空格（Windows）
    .replace(/[. ]+$/g, "")
    .trim();

  return withoutControls || fallback;
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const downloadTextFile = (
  content: string,
  filename: string,
  mimeType: string,
) => downloadBlob(new Blob([content], { type: mimeType }), filename);

interface NoteEditorViewProps {
  projectId: number;
  note: VLNote | null;
  onBack: () => void;
  onNoteSaved: (note: VLNote) => void;
}

const NoteEditorView = memo((props: NoteEditorViewProps) => {
  const { projectId, note, onBack, onNoteSaved } = props;
  const { message, modal } = App.useApp();
  const openInNewTab = useTabStore((state) => state.openInNewTab);

  // 大纲生成状态
  const isGenerating = useOutlineGenerationStore((state) =>
    note ? state.generatingNoteIds.has(note.id) : false,
  );
  const streamingContent = useOutlineGenerationStore((state) =>
    note ? state.generatingContent[note.id] : undefined,
  );
  const generationError = useOutlineGenerationStore((state) =>
    note ? state.generationErrors[note.id] : undefined,
  );

  const editorRef = useRef<EditorRef>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(note?.title || "");
  const [content, setContent] = useState<Descendant[]>(DEFAULT_CONTENT);
  const [currentNote, setCurrentNote] = useState<VLNote | null>(note);
  const [contentId, setContentId] = useState<number | null>(
    note?.contentId || null,
  );
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exportingMindMapImage, setExportingMindMapImage] = useState(false);

  // 内容是否有变化
  const contentChangedRef = useRef(false);

  // 是否是思维导图类型笔记
  const isMindMap = currentNote?.type === "mindmap";

  // 是否是 PPT 类型笔记
  const isPPT = currentNote?.type === "ppt";

  // 是否是播客类型笔记
  const isPodcast = currentNote?.type === "podcast";

  // 播客数据
  const [podcast, setPodcast] = useState<IPodcast | null>(null);

  // 检查是否是 Electron 环境
  const isElectron = typeof window !== "undefined" && !!window.electron;

  // 思维导图的 Markdown 内容
  const mindMapMarkdown = useMemo(() => {
    if (!isMindMap) return "";
    return getMarkdown(content);
  }, [isMindMap, content]);

  // PPT 的 HTML 内容（从代码块中提取并清理）
  const pptHtmlContent = useMemo(() => {
    if (!isPPT) return "";
    const markdown = getMarkdown(content);
    // 使用清理函数处理各种格式问题
    return cleanPPTHtmlContent(markdown);
  }, [isPPT, content]);

  // PPT 预览 URL
  const pptPreviewUrl = useMemo(() => {
    if (!pptHtmlContent) return "";
    if (isElectron) {
      return `data:text/html;charset=utf-8,${encodeURIComponent(pptHtmlContent)}`;
    } else {
      const blob = new Blob([pptHtmlContent], { type: "text/html" });
      return URL.createObjectURL(blob);
    }
  }, [pptHtmlContent, isElectron]);

  const mindMapExportRef = useRef<HTMLDivElement>(null);
  const mindMapFullscreenExportRef = useRef<HTMLDivElement>(null);

  // 监听流式内容变化，更新编辑器
  useEffect(() => {
    if (streamingContent && editorRef.current) {
      try {
        const slateContent = importFromMarkdown(streamingContent);
        setContent(slateContent);
        editorRef.current.setEditorValue(slateContent);
      } catch (e) {
        console.error("Failed to parse streaming content:", e);
      }
    }
  }, [streamingContent]);

  // 加载笔记内容
  useEffect(() => {
    const loadContent = async () => {
      setLoading(true);
      try {
        if (note) {
          // 编辑现有笔记
          setTitle(note.title);
          setCurrentNote(note);
          setContentId(note.contentId);
          const contentData = await getContentById(note.contentId);
          if (contentData) {
            setContent(contentData.content);
          }

          // 如果是播客类型，加载播客数据
          if (note.type === "podcast" && note.podcastId) {
            const podcastData = await getPodcastById(note.podcastId);
            setPodcast(podcastData);
          } else {
            setPodcast(null);
          }
        } else {
          // 新建笔记
          setTitle("");
          setCurrentNote(null);
          setContentId(null);
          setContent(DEFAULT_CONTENT);
          setPodcast(null);
        }
      } catch (error) {
        console.error("Failed to load note content:", error);
        message.error("加载笔记失败");
      } finally {
        setLoading(false);
      }
    };
    loadContent();
  }, [note, message]);

  // 保存笔记
  const saveNote = useMemoizedFn(async () => {
    if (!contentChangedRef.current && currentNote) return currentNote;

    setSaving(true);
    try {
      const count = getContentLength(content);
      const autoTitle = title || getEditorText(content, 20) || "无标题笔记";

      if (currentNote && contentId) {
        // 更新现有笔记
        await updateContent(contentId, content);
        if (title !== currentNote.title) {
          const updated = await updateVLNote({
            id: currentNote.id,
            title: autoTitle,
          });
          if (updated) {
            setCurrentNote(updated);
          }
        }
        contentChangedRef.current = false;
        return currentNote;
      } else {
        // 创建新笔记
        const newContentId = await createContent(content, count);
        if (!newContentId) {
          throw new Error("Failed to create content");
        }
        setContentId(newContentId);

        const newNote = await createVLNote({
          projectId,
          contentId: newContentId,
          title: autoTitle,
        });
        setCurrentNote(newNote);
        setTitle(newNote.title);
        onNoteSaved(newNote);
        contentChangedRef.current = false;
        return newNote;
      }
    } catch (error) {
      console.error("Failed to save note:", error);
      message.error("保存笔记失败");
      return null;
    } finally {
      setSaving(false);
    }
  });

  // 自动保存（生成中不自动保存，由生成逻辑负责保存）
  useRafInterval(() => {
    if (contentChangedRef.current && !isGenerating) {
      saveNote();
    }
  }, 2000);

  // 组件卸载时保存
  useUnmount(() => {
    if (contentChangedRef.current) {
      saveNote();
    }
  });

  // 处理内容变化（生成中不处理，避免冲突）
  const handleContentChange = useMemoizedFn((newContent: Descendant[]) => {
    if (isGenerating) return;
    setContent(newContent);
    contentChangedRef.current = true;
  });

  // 处理标题变化
  const handleTitleChange = useMemoizedFn(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTitle(e.target.value);
      contentChangedRef.current = true;
    },
  );

  // 完成标题编辑
  const handleTitleBlur = useMemoizedFn(() => {
    setIsEditingTitle(false);
    if (contentChangedRef.current) {
      saveNote();
    }
  });

  // 转为卡片
  const handleConvertToCard = useMemoizedFn(async () => {
    // 先保存笔记
    const savedNote = await saveNote();
    if (!savedNote || !savedNote.contentId) {
      message.error("请先保存笔记");
      return;
    }

    try {
      const card = await buildCardFromContent(savedNote.contentId);
      message.success("已创建卡片");
      // 打开卡片详情
      openInNewTab(
        TabType.CardDetail,
        { id: card.id },
        undefined,
        getEditorText(card.content, 10),
      );
    } catch (error) {
      console.error("Failed to create card:", error);
      message.error("创建卡片失败");
    }
  });

  // 删除笔记
  const handleDelete = useMemoizedFn(() => {
    if (!currentNote) {
      onBack();
      return;
    }

    modal.confirm({
      title: "删除笔记",
      content: "确定要删除该笔记吗？",
      okText: "确定",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteVLNote(currentNote.id);
          message.success("笔记已删除");
          onBack();
        } catch (error) {
          console.error("Failed to delete note:", error);
          message.error("删除笔记失败");
        }
      },
    });
  });

  // 切换全屏显示
  const handleToggleFullscreen = useMemoizedFn(() => {
    setIsFullscreen((prev) => !prev);
  });

  // 下载 PPT 为 HTML
  const handleDownloadPPT = useMemoizedFn(() => {
    if (!pptHtmlContent.trim()) {
      message.error("没有可下载的 PPT 内容");
      return;
    }
    const filename = `${sanitizeFilename(title, "演示文稿")}.html`;
    downloadTextFile(pptHtmlContent, filename, "text/html;charset=utf-8");
    message.success("PPT 已下载");
  });

  // 下载当前笔记为 Markdown（思维导图/大纲/重点提炼/普通笔记/播客等）
  const handleDownloadMarkdown = useMemoizedFn(() => {
    const markdown = getMarkdown(content);
    if (!markdown.trim()) {
      message.error("没有可下载的内容");
      return;
    }
    const filename = `${sanitizeFilename(title, "笔记")}.md`;
    downloadTextFile(markdown, filename, "text/markdown;charset=utf-8");
    message.success("笔记已下载");
  });

  // 思维导图导出为图片（PNG）
  const handleExportMindMapImage = useMemoizedFn(async () => {
    if (exportingMindMapImage) return;
    const exportElement = isFullscreen
      ? mindMapFullscreenExportRef.current
      : mindMapExportRef.current;
    if (!exportElement) {
      message.error("未找到可导出的思维导图区域");
      return;
    }

    // 优先导出「思维导图真实画布层」（包含 svg 连线 + 节点的那层）
    // 该层通常有显式 width/height（bounds），且 transform 仅用于 pan/zoom
    const mindMapSvg = exportElement.querySelector(
      "svg.pointer-events-none",
    ) as SVGSVGElement | null;
    const canvasElement = (mindMapSvg?.parentElement ||
      null) as HTMLElement | null;
    const captureTarget = canvasElement || exportElement;

    const rect = captureTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      message.error("思维导图尚未渲染完成，请稍后重试");
      return;
    }

    setExportingMindMapImage(true);
    try {
      // snapdom 在克隆 DOM 时可能丢失百分比高度约束，导致导出为空白
      // 这里临时把目标节点设为显式像素宽高 + 放开 overflow，确保能正确布局并被捕获
      // 同时针对画布层去掉 transform，避免 pan/zoom 把内容移出画布导致截图为空
      const originalStyle = {
        width: captureTarget.style.width,
        height: captureTarget.style.height,
        maxHeight: captureTarget.style.maxHeight,
        overflow: captureTarget.style.overflow,
        transform: captureTarget.style.transform,
        transformOrigin: captureTarget.style.transformOrigin,
        background: captureTarget.style.background,
      };

      // 尽量使用原本的 bounds 尺寸（若存在），否则回退到当前可见 rect
      const computed = window.getComputedStyle(captureTarget);
      const computedWidth = parseFloat(computed.width) || rect.width;
      const computedHeight = parseFloat(computed.height) || rect.height;

      captureTarget.style.width = `${Math.ceil(computedWidth)}px`;
      captureTarget.style.height = `${Math.ceil(computedHeight)}px`;
      captureTarget.style.maxHeight = "none";
      captureTarget.style.overflow = "visible";
      captureTarget.style.transformOrigin = "top left";
      captureTarget.style.transform = "none";
      // 兜底背景，避免导出透明/纯白难以分辨（主题背景通常在更外层）
      if (!captureTarget.style.background) {
        captureTarget.style.background = computed.backgroundColor || "#ffffff";
      }

      // 等待遮罩层/布局更新，避免截图内容不完整
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      const blob = await snapdom.toBlob(captureTarget, {
        dpr: window.devicePixelRatio || 2,
        type: "png",
        quality: 0.95,
        filter: (element) => {
          const el = element as HTMLElement | null;
          return !el?.hasAttribute?.("data-export-mask");
        },
        filterMode: "hide",
      });

      captureTarget.style.width = originalStyle.width;
      captureTarget.style.height = originalStyle.height;
      captureTarget.style.maxHeight = originalStyle.maxHeight;
      captureTarget.style.overflow = originalStyle.overflow;
      captureTarget.style.transform = originalStyle.transform;
      captureTarget.style.transformOrigin = originalStyle.transformOrigin;
      captureTarget.style.background = originalStyle.background;

      const filename = `${sanitizeFilename(title, "思维导图")}.png`;
      downloadBlob(blob, filename);
      message.success("图片导出成功");
    } catch (e) {
      console.error("Export mindmap image failed:", e);
      message.error("导出失败，请重试");
    } finally {
      setExportingMindMapImage(false);
    }
  });

  // 更多菜单项
  interface MenuItem {
    key: string;
    icon: React.ReactNode;
    label: string;
    danger?: boolean;
    onClick: () => void;
  }

  const moreMenuItems: MenuItem[] =
    isMindMap || isPPT
      ? [
          ...(isPPT
            ? [
                {
                  key: "download-html",
                  icon: <DownloadOutlined />,
                  label: "下载 HTML",
                  onClick: handleDownloadPPT,
                },
              ]
            : []),
          ...(isMindMap
            ? [
                {
                  key: "download-md",
                  icon: <DownloadOutlined />,
                  label: "下载 Markdown",
                  onClick: handleDownloadMarkdown,
                },
                {
                  key: "export-image",
                  icon: <PictureOutlined />,
                  label: exportingMindMapImage ? "导出中..." : "导出为图片",
                  onClick: handleExportMindMapImage,
                },
              ]
            : []),
          {
            key: "fullscreen",
            icon: isFullscreen ? (
              <FullscreenExitOutlined />
            ) : (
              <FullscreenOutlined />
            ),
            label: isFullscreen ? "退出全屏" : "全屏显示",
            onClick: handleToggleFullscreen,
          },
          {
            key: "delete",
            icon: <DeleteOutlined />,
            label: "删除笔记",
            danger: true,
            onClick: handleDelete,
          },
        ]
      : isPodcast
        ? [
            {
              key: "download-md",
              icon: <DownloadOutlined />,
              label: "下载 Markdown",
              onClick: handleDownloadMarkdown,
            },
            {
              key: "delete",
              icon: <DeleteOutlined />,
              label: "删除笔记",
              danger: true,
              onClick: handleDelete,
            },
          ]
        : [
            {
              key: "download-md",
              icon: <DownloadOutlined />,
              label: "下载 Markdown",
              onClick: handleDownloadMarkdown,
            },
            {
              key: "convert-to-card",
              icon: <CreditCardOutlined />,
              label: "转为卡片",
              onClick: handleConvertToCard,
            },
            {
              key: "delete",
              icon: <DeleteOutlined />,
              label: "删除笔记",
              danger: true,
              onClick: handleDelete,
            },
          ];

  // 处理菜单项选择
  const handleMenuSelect = useMemoizedFn((item: MenuItem) => {
    item.onClick();
  });

  // 返回并保存
  const handleBack = useMemoizedFn(async () => {
    if (contentChangedRef.current) {
      await saveNote();
    }
    onBack();
  });

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部栏 */}
      <div className="px-4 py-3 border-b border-[#e8e8e8] dark:border-[#2a2a2a] shrink-0 flex items-center gap-3">
        <button
          className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] transition-colors cursor-pointer border-none bg-transparent"
          onClick={handleBack}
        >
          <ArrowLeftOutlined className="text-[#666] dark:text-[#999]" />
        </button>

        <div className="flex-1 min-w-0">
          {isEditingTitle && !isGenerating ? (
            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => e.key === "Enter" && handleTitleBlur()}
              placeholder="请输入标题"
              autoFocus
              className="w-full border-none bg-transparent p-0 text-base font-medium text-[#333] dark:text-[#e0e0e0] outline-none placeholder:text-[#999]"
            />
          ) : (
            <h3
              className="text-base font-medium text-[#333] dark:text-[#e0e0e0] m-0 cursor-pointer truncate"
              onClick={() => !isGenerating && setIsEditingTitle(true)}
            >
              {title || "无标题笔记"}
            </h3>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isGenerating && (
            <span className="text-xs text-blue-500 flex items-center">
              <LoadingSpinner size="small" className="mr-1" />
              生成中
            </span>
          )}
          {!isGenerating && saving && (
            <span className="text-xs text-[#999] flex items-center">
              <LoadingSpinner size="small" className="mr-1" />
              保存中
            </span>
          )}
          {!isGenerating && (
            <button
              ref={moreButtonRef}
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] transition-colors cursor-pointer border-none bg-transparent"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
            >
              <MoreOutlined className="text-[#666] dark:text-[#999]" />
            </button>
          )}
          <SelectDropDown
            items={moreMenuItems}
            selectedKey=""
            show={showMoreMenu}
            onClose={() => setShowMoreMenu(false)}
            onSelect={handleMenuSelect}
            triggerElement={moreButtonRef.current}
            getKey={(item) => item.key}
            width={160}
            renderItem={(item) => (
              <div
                className={`flex items-center gap-2 ${item.danger ? "text-red-500" : ""}`}
              >
                {item.icon}
                <span>{item.label}</span>
              </div>
            )}
          />
        </div>
      </div>

      {/* 编辑器区域 */}
      <div
        className={`flex-1 overflow-auto ${isMindMap || isPPT ? "" : "p-4"}`}
      >
        {/* 生成错误提示 */}
        {generationError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
            <p className="text-sm text-red-600 dark:text-red-400">
              生成失败: {generationError}
            </p>
          </div>
        )}

        <ErrorBoundary>
          {isMindMap ? (
            <div ref={mindMapExportRef} className="h-full relative">
              {exportingMindMapImage && !isFullscreen && (
                <div
                  data-export-mask
                  className="absolute inset-0 z-10 flex items-center justify-center bg-black/35 backdrop-blur-[1px]"
                >
                  <div className="flex items-center gap-2 text-sm text-white">
                    <LoadingSpinner size="small" />
                    正在导出图片...
                  </div>
                </div>
              )}
              <MindMapRenderer code={mindMapMarkdown} fillContainer />
            </div>
          ) : isPPT ? (
            <div className="h-full bg-black">
              {isElectron ? (
                <webview
                  src={pptPreviewUrl}
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
                  src={pptPreviewUrl}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin"
                  title="PPT Preview"
                />
              )}
            </div>
          ) : isPodcast ? (
            <div className="space-y-4">
              {/* 播客播放器 */}
              {podcast && (
                <PodcastPlayer
                  defaultPodcast={podcast}
                  onDelete={async () => {
                    // 播客类型笔记不允许单独删除播客，需要删除整个笔记
                    message.info("请通过删除笔记来删除播客");
                  }}
                />
              )}
              {!podcast && currentNote?.podcastId && (
                <div className="p-4 rounded-xl bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20">
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    播客数据加载失败，请刷新页面重试
                  </p>
                </div>
              )}
              {/* 脚本内容（只读） */}
              <Editor
                key={currentNote?.id || "new"}
                ref={editorRef}
                initValue={content}
                onChange={handleContentChange}
                extensions={customExtensions}
                readonly={true}
              />
            </div>
          ) : (
            <Editor
              key={currentNote?.id || "new"}
              ref={editorRef}
              initValue={content}
              onChange={handleContentChange}
              extensions={customExtensions}
              readonly={isGenerating}
            />
          )}
        </ErrorBoundary>
      </div>

      {/* 全屏显示思维导图 */}
      {isMindMap && isFullscreen && (
        <div className="fixed top-12 left-0 right-0 bottom-0 z-50 bg-white dark:bg-[#1a1a1a] flex flex-col">
          {/* 全屏顶部栏 */}
          <div className="px-4 py-3 border-b border-[#e8e8e8] dark:border-[#2a2a2a] shrink-0 flex items-center justify-between">
            <h3 className="text-base font-medium text-[#333] dark:text-[#e0e0e0] m-0">
              {title || "无标题笔记"}
            </h3>
            <button
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] transition-colors cursor-pointer border-none bg-transparent"
              onClick={handleToggleFullscreen}
            >
              <FullscreenExitOutlined className="text-[#666] dark:text-[#999]" />
            </button>
          </div>
          {/* 全屏思维导图区域 */}
          <div
            ref={mindMapFullscreenExportRef}
            className="flex-1 overflow-hidden relative"
          >
            {exportingMindMapImage && (
              <div
                data-export-mask
                className="absolute inset-0 z-10 flex items-center justify-center bg-black/35 backdrop-blur-[1px]"
              >
                <div className="flex items-center gap-2 text-sm text-white">
                  <LoadingSpinner size="small" />
                  正在导出图片...
                </div>
              </div>
            )}
            <MindMapRenderer code={mindMapMarkdown} fillContainer />
          </div>
        </div>
      )}

      {/* 全屏显示 PPT */}
      {isPPT && isFullscreen && (
        <div className="fixed top-12 left-0 right-0 bottom-0 z-50 bg-black flex flex-col">
          {/* 全屏顶部栏 */}
          <div className="px-4 py-3 border-b border-[#2a2a2a] shrink-0 flex items-center justify-between bg-[#1a1a1a]">
            <h3 className="text-base font-medium text-[#e0e0e0] m-0">
              {title || "无标题 PPT"}
            </h3>
            <button
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-[#2a2a2a] text-[#e0e0e0] transition-colors cursor-pointer border-none bg-transparent"
              onClick={handleToggleFullscreen}
            >
              <FullscreenExitOutlined />
            </button>
          </div>
          {/* 全屏 PPT 区域 */}
          <div className="flex-1 overflow-hidden">
            {isElectron ? (
              <webview
                src={pptPreviewUrl}
                partition="persist:ppt-preview-fullscreen"
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
                src={pptPreviewUrl}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin"
                title="PPT Fullscreen"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
});

NoteEditorView.displayName = "NoteEditorView";

export default NoteEditorView;

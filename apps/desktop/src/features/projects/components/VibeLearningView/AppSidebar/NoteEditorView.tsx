import { isElectron } from "@/electron";
import { useHtmlPreviewUrl } from "@/utils/html-preview";
import { memo, useEffect, useRef, useState, useMemo } from "react";
import { Descendant } from "slate";
import {
  ArrowLeft,
  MoreHorizontal,
  CreditCard,
  Trash2,
  Maximize,
  Minimize,
  Download,
  Image,
  FileText,
  Import,
} from "lucide-react";
import { useMemoizedFn, useUnmount } from "ahooks";
import { LoadingSpinner } from "./components";
import InsertNoteToTreeModal from "@/components/InsertNoteToTreeModal";
import { SelectDropDown } from "@tau/shared";
import { captureBlobWithSnapdom } from "@/utils/snapdom-export";

import { EditorRef } from "@tau/editor/src";
import Editor from "@/components/ContentEditor";
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
  ensureVLNoteResource,
} from "@/commands/vibe-learning";
import { createContent, getContentById } from "@/commands";
import { buildCardFromContent, isContentIsCard } from "@/commands/card";
import { buildArticleFromContent, isContentIsArticle } from "@/commands/article";
import { getContentLength, getEditorText, importFromMarkdown, getMarkdown } from "@/utils";
import { cleanPPTHtmlContent } from "@/constants/prompts/ppt-generation";
import { cleanReportHtmlContent } from "@/constants/prompts/report-generation";
import { buildDefaultEpubMetadata, exportSlateToEpubWithDialog } from "@/utils/epub-export";
import { exportSlateToPdfWithDialog } from "@/utils/pdf-export";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import { usePage } from "@/page/PageProvider";
import useEditContent from "@/hooks/useEditContent";
import useOutlineGenerationStore from "@/stores/useOutlineGenerationStore";
import { toast, ConfirmDialog } from "@tau/ui";

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    disableDrag: false,
    children: [{ type: "formatted", text: "" }],
  },
];

const removeControlChars = (input: string) =>
  Array.from(input)
    .filter(ch => {
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

const downloadTextFile = (content: string, filename: string, mimeType: string) =>
  downloadBlob(new Blob([content], { type: mimeType }), filename);

interface NoteEditorViewProps {
  projectId: number;
  mainDbName: string;
  note: VLNote | null;
  onBack: () => void;
  onNoteSaved: (note: VLNote) => void;
  onResourcesChange: () => void;
}

const NoteEditorView = memo((props: NoteEditorViewProps) => {
  const { projectId, mainDbName, note, onBack, onNoteSaved, onResourcesChange } = props;
  const dynamicExtensions = useDynamicExtensionsStore(state => state.extensions);
  const { navigator } = usePage();

  // 大纲生成状态
  const isGenerating = useOutlineGenerationStore(state =>
    note ? state.generatingNoteIds.has(note.id) : false
  );
  const streamingContent = useOutlineGenerationStore(state =>
    note ? state.generatingContent[note.id] : undefined
  );
  const generationError = useOutlineGenerationStore(state =>
    note ? state.generationErrors[note.id] : undefined
  );

  const editorRef = useRef<EditorRef>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(note?.title || "");
  const [content, setContent] = useState<Descendant[]>(DEFAULT_CONTENT);
  const [currentNote, setCurrentNote] = useState<VLNote | null>(note);
  const [contentId, setContentId] = useState<number | null>(note?.contentId || null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exportingMindMapImage, setExportingMindMapImage] = useState(false);
  const [exportingDocumentFormat, setExportingDocumentFormat] = useState<"pdf" | "epub" | null>(
    null
  );
  const [isCard, setIsCard] = useState(false);
  const [isArticle, setIsArticle] = useState(false);
  const [insertProjectModalOpen, setInsertProjectModalOpen] = useState(false);
  const [insertDocumentModalOpen, setInsertDocumentModalOpen] = useState(false);

  // 标题是否有变化
  const titleChangedRef = useRef(false);

  // useEditContent 管理内容保存和同步
  const handleExternalContentChange = useMemoizedFn((newContent: Descendant[]) => {
    setContent(newContent);
    editorRef.current?.setEditorValue(newContent);
  });
  const { throttleHandleEditorContentChange } = useEditContent(
    contentId || undefined,
    handleExternalContentChange
  );

  // 是否是思维导图类型笔记
  const isMindMap = currentNote?.type === "mindmap";

  // 是否是 PPT 类型笔记
  const isPPT = currentNote?.type === "ppt";

  // 是否是报告类型笔记
  const isReport = currentNote?.type === "report";

  // 是否是播客类型笔记
  const isPodcast = currentNote?.type === "podcast";

  // 播客数据
  const [podcast, setPodcast] = useState<IPodcast | null>(null);

  // 检查是否是 Electron 环境

  // 检查笔记是否已是卡片
  useEffect(() => {
    if (currentNote?.contentId) {
      isContentIsCard(currentNote.contentId).then(setIsCard);
      isContentIsArticle(currentNote.contentId).then(setIsArticle);
    } else {
      setIsCard(false);
      setIsArticle(false);
    }
  }, [currentNote?.contentId]);

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
  const pptPreviewUrl = useHtmlPreviewUrl(pptHtmlContent);

  // 报告的 HTML 内容（从代码块中提取并清理）
  const reportHtmlContent = useMemo(() => {
    if (!isReport) return "";
    const markdown = getMarkdown(content);
    return cleanReportHtmlContent(markdown);
  }, [isReport, content]);

  // 报告预览 URL
  const reportPreviewUrl = useHtmlPreviewUrl(reportHtmlContent);

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
        toast.error("加载笔记失败");
      } finally {
        setLoading(false);
      }
    };
    loadContent();
  }, [note]);

  // 保存笔记（仅处理 VLNote 的 title 更新和新建笔记）
  const saveNote = useMemoizedFn(async () => {
    if (!titleChangedRef.current && currentNote) return currentNote;

    setSaving(true);
    try {
      const count = getContentLength(content);
      const autoTitle = title || getEditorText(content, 20) || "无标题笔记";

      if (currentNote && contentId) {
        // 更新现有笔记标题
        let latestNote = currentNote;
        if (title !== currentNote.title) {
          const updated = await updateVLNote({
            id: currentNote.id,
            title: autoTitle,
          });
          if (updated) {
            setCurrentNote(updated);
            latestNote = updated;
          }
        }
        titleChangedRef.current = false;
        return latestNote;
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
        titleChangedRef.current = false;
        return newNote;
      }
    } catch (error) {
      console.error("Failed to save note:", error);
      toast.error("保存笔记失败");
      return null;
    } finally {
      setSaving(false);
    }
  });

  // 组件卸载时保存标题
  useUnmount(() => {
    if (titleChangedRef.current) {
      saveNote();
    }
  });

  // 处理内容变化（生成中不处理，避免冲突）
  const handleContentChange = useMemoizedFn((newContent: Descendant[]) => {
    if (isGenerating) return;
    setContent(newContent);
    throttleHandleEditorContentChange(newContent);
  });

  // 处理标题变化
  const handleTitleChange = useMemoizedFn((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    titleChangedRef.current = true;
  });

  // 完成标题编辑
  const handleTitleBlur = useMemoizedFn(() => {
    setIsEditingTitle(false);
    if (titleChangedRef.current) {
      saveNote();
    }
  });

  // 转为卡片
  const handleConvertToCard = useMemoizedFn(async () => {
    // 先保存笔记
    const savedNote = await saveNote();
    if (!savedNote || !savedNote.contentId) {
      toast.error("请先保存笔记");
      return;
    }

    try {
      const card = await buildCardFromContent(savedNote.contentId);
      setIsCard(true);
      toast.success("已创建卡片");
      // 打开卡片详情
      navigator.push("card-detail", { id: card.id });
    } catch (error) {
      console.error("Failed to create card:", error);
      toast.error("创建卡片失败");
    }
  });

  // 转为文章
  const handleConvertToArticle = useMemoizedFn(async () => {
    const savedNote = await saveNote();
    if (!savedNote || !savedNote.contentId) {
      toast.error("请先保存笔记");
      return;
    }

    try {
      const article = await buildArticleFromContent(savedNote.contentId);
      setIsArticle(true);
      toast.success("已创建文章");
      navigator.push("article-detail", { id: article.id });
    } catch (error) {
      console.error("Failed to create article:", error);
      toast.error("创建文章失败");
    }
  });

  // 插入到项目
  const handleInsertToProject = useMemoizedFn(async () => {
    const savedNote = await saveNote();
    if (!savedNote || !savedNote.contentId) {
      toast.error("请先保存笔记");
      return;
    }
    setInsertProjectModalOpen(true);
  });

  // 插入到知识库
  const handleInsertToDocument = useMemoizedFn(async () => {
    const savedNote = await saveNote();
    if (!savedNote || !savedNote.contentId) {
      toast.error("请先保存笔记");
      return;
    }
    setInsertDocumentModalOpen(true);
  });

  const handleAddToResourceList = useMemoizedFn(async () => {
    const savedNote = await saveNote();
    if (!savedNote || !savedNote.contentId) {
      toast.error("请先保存笔记");
      return;
    }

    try {
      const result = await ensureVLNoteResource({
        projectId,
        mainDbName,
        contentId: savedNote.contentId,
        title: savedNote.title,
        noteType: savedNote.type,
        originalId: savedNote.id,
      });
      if (result.created) {
        onResourcesChange();
        toast.success("已添加到资源列表");
        return;
      }
      toast.info("该内容已在资源列表中");
    } catch (resourceError) {
      console.error("Failed to ensure note resource:", resourceError);
      toast.warning("添加到资源列表失败");
    }
  });

  // 删除笔记
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const handleDelete = useMemoizedFn(() => {
    if (!currentNote) {
      onBack();
      return;
    }
    setDeleteConfirmOpen(true);
  });

  // 切换全屏显示
  const handleToggleFullscreen = useMemoizedFn(() => {
    setIsFullscreen(prev => !prev);
  });

  // 下载 PPT 为 HTML
  const handleDownloadPPT = useMemoizedFn(() => {
    if (!pptHtmlContent.trim()) {
      toast.error("没有可下载的 PPT 内容");
      return;
    }
    const filename = `${sanitizeFilename(title, "演示文稿")}.html`;
    downloadTextFile(pptHtmlContent, filename, "text/html;charset=utf-8");
    toast.success("PPT 已下载");
  });

  const handleDownloadReport = useMemoizedFn(() => {
    if (!reportHtmlContent.trim()) {
      toast.error("没有可下载的报告内容");
      return;
    }
    const filename = `${sanitizeFilename(title, "报告")}.html`;
    downloadTextFile(reportHtmlContent, filename, "text/html;charset=utf-8");
    toast.success("报告已下载");
  });

  // 下载当前笔记为 Markdown（思维导图/大纲/重点提炼/普通笔记/播客等）
  const handleDownloadMarkdown = useMemoizedFn(() => {
    const markdown = getMarkdown(content);
    if (!markdown.trim()) {
      toast.error("没有可下载的内容");
      return;
    }
    const filename = `${sanitizeFilename(title, "笔记")}.md`;
    downloadTextFile(markdown, filename, "text/markdown;charset=utf-8");
    toast.success("笔记已下载");
  });

  const handleExportEpub = useMemoizedFn(async () => {
    if (exportingDocumentFormat) return;

    setExportingDocumentFormat("epub");
    try {
      const metadata = buildDefaultEpubMetadata({
        content,
        title,
      });
      const result = await exportSlateToEpubWithDialog({
        content,
        metadata,
        defaultFileName: sanitizeFilename(title, "笔记"),
      });

      if (result.canceled) {
        return;
      }

      if (result.filePath) {
        if (result.warnings.length > 0) {
          toast.warning(`EPUB 已导出，但有 ${result.warnings.length} 条提示`);
        } else {
          toast.success("EPUB 已导出");
        }
        return;
      }

      toast.error(result.warnings[0] || "EPUB 导出失败");
    } catch (error) {
      console.error("Export EPUB failed:", error);
      toast.error("EPUB 导出失败");
    } finally {
      setExportingDocumentFormat(null);
    }
  });

  const handleExportPdf = useMemoizedFn(async () => {
    if (exportingDocumentFormat) return;

    setExportingDocumentFormat("pdf");
    try {
      const metadata = buildDefaultEpubMetadata({
        content,
        title,
      });
      const result = await exportSlateToPdfWithDialog({
        content,
        metadata,
        defaultFileName: sanitizeFilename(title, "笔记"),
      });

      if (result.canceled) {
        return;
      }

      if (result.filePath) {
        if (result.warnings.length > 0) {
          toast.warning(`PDF 已导出，但有 ${result.warnings.length} 条提示`);
        } else {
          toast.success("PDF 已导出");
        }
        return;
      }

      toast.error(result.warnings[0] || "PDF 导出失败");
    } catch (error) {
      console.error("Export PDF failed:", error);
      toast.error("PDF 导出失败");
    } finally {
      setExportingDocumentFormat(null);
    }
  });

  // 思维导图导出为图片（PNG）
  const handleExportMindMapImage = useMemoizedFn(async () => {
    if (exportingMindMapImage) return;
    const exportElement = isFullscreen
      ? mindMapFullscreenExportRef.current
      : mindMapExportRef.current;
    if (!exportElement) {
      toast.error("未找到可导出的思维导图区域");
      return;
    }

    // 优先导出「思维导图真实画布层」（包含 svg 连线 + 节点的那层）
    // 该层通常有显式 width/height（bounds），且 transform 仅用于 pan/zoom
    const mindMapSvg = exportElement.querySelector(
      "svg.pointer-events-none"
    ) as SVGSVGElement | null;
    const canvasElement = (mindMapSvg?.parentElement || null) as HTMLElement | null;
    const captureTarget = canvasElement || exportElement;

    const rect = captureTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      toast.error("思维导图尚未渲染完成，请稍后重试");
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
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      const blob = await captureBlobWithSnapdom(captureTarget, {
        dpr: window.devicePixelRatio || 2,
        type: "png",
        quality: 0.95,
        filter: element => {
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
      toast.success("图片导出成功");
    } catch (e) {
      console.error("Export mindmap image failed:", e);
      toast.error("导出失败，请重试");
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
    isMindMap || isPPT || isReport
      ? [
          {
            key: "fullscreen",
            icon: isFullscreen ? (
              <Minimize className="size-4" strokeWidth={1.75} />
            ) : (
              <Maximize className="size-4" strokeWidth={1.75} />
            ),
            label: isFullscreen ? "退出全屏" : "全屏显示",
            onClick: handleToggleFullscreen,
          },
          ...(isPPT
            ? [
                {
                  key: "add-to-resources",
                  icon: <Import className="size-4" strokeWidth={1.75} />,
                  label: "添加到资源列表",
                  onClick: handleAddToResourceList,
                },
                {
                  key: "download-html",
                  icon: <Download className="size-4" strokeWidth={1.75} />,
                  label: "下载 HTML",
                  onClick: handleDownloadPPT,
                },
              ]
            : []),
          ...(isReport
            ? [
                {
                  key: "add-to-resources",
                  icon: <Import className="size-4" strokeWidth={1.75} />,
                  label: "添加到资源列表",
                  onClick: handleAddToResourceList,
                },
                {
                  key: "download-html",
                  icon: <Download className="size-4" strokeWidth={1.75} />,
                  label: "下载 HTML",
                  onClick: handleDownloadReport,
                },
              ]
            : []),
          ...(isMindMap
            ? [
                {
                  key: "add-to-resources",
                  icon: <Import className="size-4" strokeWidth={1.75} />,
                  label: "添加到资源列表",
                  onClick: handleAddToResourceList,
                },
                {
                  key: "download-md",
                  icon: <Download className="size-4" strokeWidth={1.75} />,
                  label: "下载 Markdown",
                  onClick: handleDownloadMarkdown,
                },
                {
                  key: "export-pdf",
                  icon: <FileText className="size-4" strokeWidth={1.75} />,
                  label: exportingDocumentFormat === "pdf" ? "导出 PDF 中..." : "导出 PDF",
                  onClick: handleExportPdf,
                },
                {
                  key: "export-epub",
                  icon: <FileText className="size-4" strokeWidth={1.75} />,
                  label: exportingDocumentFormat === "epub" ? "导出 EPUB 中..." : "导出 EPUB",
                  onClick: handleExportEpub,
                },
                {
                  key: "export-image",
                  icon: <Image className="size-4" strokeWidth={1.75} />,
                  label: exportingMindMapImage ? "导出中..." : "导出为图片",
                  onClick: handleExportMindMapImage,
                },
              ]
            : []),
          {
            key: "delete",
            icon: <Trash2 className="size-4" strokeWidth={1.75} />,
            label: "删除笔记",
            danger: true,
            onClick: handleDelete,
          },
        ]
      : isPodcast
        ? [
            {
              key: "add-to-resources",
              icon: <Import className="size-4" strokeWidth={1.75} />,
              label: "添加到资源列表",
              onClick: handleAddToResourceList,
            },
            {
              key: "insert-to-project",
              icon: <Import className="size-4" strokeWidth={1.75} />,
              label: "插入到项目",
              onClick: handleInsertToProject,
            },
            {
              key: "insert-to-document",
              icon: <Import className="size-4" strokeWidth={1.75} />,
              label: "插入到知识库",
              onClick: handleInsertToDocument,
            },
            {
              key: "download-md",
              icon: <Download className="size-4" strokeWidth={1.75} />,
              label: "下载 Markdown",
              onClick: handleDownloadMarkdown,
            },
            {
              key: "export-pdf",
              icon: <FileText className="size-4" strokeWidth={1.75} />,
              label: exportingDocumentFormat === "pdf" ? "导出 PDF 中..." : "导出 PDF",
              onClick: handleExportPdf,
            },
            {
              key: "export-epub",
              icon: <FileText className="size-4" strokeWidth={1.75} />,
              label: exportingDocumentFormat === "epub" ? "导出 EPUB 中..." : "导出 EPUB",
              onClick: handleExportEpub,
            },
            {
              key: "delete",
              icon: <Trash2 className="size-4" strokeWidth={1.75} />,
              label: "删除笔记",
              danger: true,
              onClick: handleDelete,
            },
          ]
        : [
            ...(!isCard
              ? [
                  {
                    key: "convert-to-card",
                    icon: <CreditCard className="size-4" strokeWidth={1.75} />,
                    label: "转为卡片",
                    onClick: handleConvertToCard,
                  },
                ]
              : []),
            ...(!isArticle
              ? [
                  {
                    key: "convert-to-article",
                    icon: <FileText className="size-4" strokeWidth={1.75} />,
                    label: "转为文章",
                    onClick: handleConvertToArticle,
                  },
                ]
              : []),
            {
              key: "add-to-resources",
              icon: <Import className="size-4" strokeWidth={1.75} />,
              label: "添加到资源列表",
              onClick: handleAddToResourceList,
            },
            {
              key: "insert-to-project",
              icon: <Import className="size-4" strokeWidth={1.75} />,
              label: "插入到项目",
              onClick: handleInsertToProject,
            },
            {
              key: "insert-to-document",
              icon: <Import className="size-4" strokeWidth={1.75} />,
              label: "插入到知识库",
              onClick: handleInsertToDocument,
            },
            {
              key: "download-md",
              icon: <Download className="size-4" strokeWidth={1.75} />,
              label: "下载 Markdown",
              onClick: handleDownloadMarkdown,
            },
            {
              key: "export-pdf",
              icon: <FileText className="size-4" strokeWidth={1.75} />,
              label: exportingDocumentFormat === "pdf" ? "导出 PDF 中..." : "导出 PDF",
              onClick: handleExportPdf,
            },
            {
              key: "export-epub",
              icon: <FileText className="size-4" strokeWidth={1.75} />,
              label: exportingDocumentFormat === "epub" ? "导出 EPUB 中..." : "导出 EPUB",
              onClick: handleExportEpub,
            },
            {
              key: "delete",
              icon: <Trash2 className="size-4" strokeWidth={1.75} />,
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
    if (titleChangedRef.current) {
      await saveNote();
    }
    onBack();
  });

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* 顶部栏 */}
      <div className="border-line-1 flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <button
          className="hover:bg-hover flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border-none bg-transparent transition-colors"
          onClick={handleBack}
        >
          <ArrowLeft className="text-ink-2 size-4" strokeWidth={1.75} />
        </button>

        <div className="min-w-0 flex-1">
          {isEditingTitle && !isGenerating ? (
            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              onBlur={handleTitleBlur}
              onKeyDown={e => e.key === "Enter" && handleTitleBlur()}
              placeholder="请输入标题"
              autoFocus
              className="text-ink-1 placeholder:text-ink-3 w-full border-none bg-transparent p-0 text-base font-medium outline-none"
            />
          ) : (
            <h3
              className="text-ink-1 m-0 cursor-pointer truncate text-base font-medium"
              onClick={() => !isGenerating && setIsEditingTitle(true)}
            >
              {title || "无标题笔记"}
            </h3>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isGenerating && (
            <span className="text-accent flex items-center text-xs">
              <LoadingSpinner size="small" className="mr-1" />
              生成中
            </span>
          )}
          {!isGenerating && saving && (
            <span className="text-ink-3 flex items-center text-xs">
              <LoadingSpinner size="small" className="mr-1" />
              保存中
            </span>
          )}
          {!isGenerating && (
            <button
              ref={moreButtonRef}
              className="hover:bg-hover flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border-none bg-transparent transition-colors"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
            >
              <MoreHorizontal className="text-ink-2 size-4" strokeWidth={1.75} />
            </button>
          )}
          <SelectDropDown
            items={moreMenuItems}
            selectedKey=""
            show={showMoreMenu}
            onClose={() => setShowMoreMenu(false)}
            onSelect={handleMenuSelect}
            triggerElement={moreButtonRef.current}
            getKey={item => item.key}
            width={160}
            renderItem={item => (
              <div className={`flex items-center gap-2 ${item.danger ? "text-red-500" : ""}`}>
                {item.icon}
                <span>{item.label}</span>
              </div>
            )}
          />
        </div>
      </div>

      {/* 编辑器区域 */}
      <div className={`flex-1 overflow-auto ${isMindMap || isPPT ? "" : "p-4"}`}>
        {/* 生成错误提示 */}
        {generationError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-danger text-sm">生成失败: {generationError}</p>
          </div>
        )}

        <ErrorBoundary>
          {isMindMap ? (
            <div ref={mindMapExportRef} className="relative h-full">
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
                  className="h-full w-full border-0"
                  sandbox="allow-scripts allow-same-origin"
                  title="PPT Preview"
                />
              )}
            </div>
          ) : isReport ? (
            <div className="bg-surface h-full">
              {isElectron ? (
                <webview
                  src={reportPreviewUrl}
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
                  src={reportPreviewUrl}
                  className="h-full w-full border-0"
                  sandbox="allow-scripts allow-same-origin"
                  title="Report Preview"
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
                    toast.info("请通过删除笔记来删除播客");
                  }}
                />
              )}
              {!podcast && currentNote?.podcastId && (
                <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                  <p className="text-warn text-sm">播客数据加载失败，请刷新页面重试</p>
                </div>
              )}
              {/* 脚本内容（只读） */}
              <Editor
                contentId={contentId || undefined}
                key={currentNote?.id || "new"}
                ref={editorRef}
                initValue={content}
                onChange={handleContentChange}
                extensions={dynamicExtensions}
                readonly={true}
              />
            </div>
          ) : (
            <Editor
              contentId={contentId || undefined}
              key={currentNote?.id || "new"}
              ref={editorRef}
              initValue={content}
              onChange={handleContentChange}
              extensions={dynamicExtensions}
              readonly={isGenerating}
            />
          )}
        </ErrorBoundary>
      </div>

      {/* 全屏显示思维导图 */}
      {isMindMap && isFullscreen && (
        <div className="bg-surface fixed bottom-0 left-0 right-0 top-12 z-50 flex flex-col">
          {/* 全屏顶部栏 */}
          <div className="border-line-1 flex shrink-0 items-center justify-between border-b px-4 py-3">
            <h3 className="text-ink-1 m-0 text-base font-medium">{title || "无标题笔记"}</h3>
            <button
              className="hover:bg-hover flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border-none bg-transparent transition-colors"
              onClick={handleToggleFullscreen}
            >
              <Minimize className="text-ink-2 size-4" strokeWidth={1.75} />
            </button>
          </div>
          {/* 全屏思维导图区域 */}
          <div ref={mindMapFullscreenExportRef} className="relative flex-1 overflow-hidden">
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
        <div className="fixed bottom-0 left-0 right-0 top-12 z-50 flex flex-col bg-black">
          {/* 全屏顶部栏 */}
          <div className="border-ink-1/30 bg-ink-1 flex shrink-0 items-center justify-between border-b px-4 py-3">
            <h3 className="text-ink-inverse m-0 text-base font-medium">{title || "无标题 PPT"}</h3>
            <button
              className="text-ink-inverse flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border-none bg-transparent transition-colors hover:bg-white/10"
              onClick={handleToggleFullscreen}
            >
              <Minimize className="size-4" strokeWidth={1.75} />
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
                className="h-full w-full border-0"
                sandbox="allow-scripts allow-same-origin"
                title="PPT Fullscreen"
              />
            )}
          </div>
        </div>
      )}

      {isReport && isFullscreen && (
        <div className="bg-surface fixed bottom-0 left-0 right-0 top-12 z-50 flex flex-col">
          <div className="border-line-1 bg-surface flex shrink-0 items-center justify-between border-b px-4 py-3">
            <h3 className="text-ink-1 m-0 text-base font-medium">{title || "无标题报告"}</h3>
            <button
              className="text-ink-2 hover:bg-hover flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border-none bg-transparent transition-colors"
              onClick={handleToggleFullscreen}
            >
              <Minimize className="size-4" strokeWidth={1.75} />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            {isElectron ? (
              <webview
                src={reportPreviewUrl}
                partition="persist:report-preview-fullscreen"
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
                src={reportPreviewUrl}
                className="h-full w-full border-0"
                sandbox="allow-scripts allow-same-origin"
                title="Report Fullscreen"
              />
            )}
          </div>
        </div>
      )}

      {/* 插入到项目弹窗 */}
      <InsertNoteToTreeModal
        mode="project"
        open={insertProjectModalOpen}
        noteTitle={title}
        noteContent={content}
        sourceContentId={contentId}
        onCancel={() => setInsertProjectModalOpen(false)}
        onSuccess={() => setInsertProjectModalOpen(false)}
      />

      {/* 插入到知识库弹窗 */}
      <InsertNoteToTreeModal
        mode="document"
        open={insertDocumentModalOpen}
        noteTitle={title}
        noteContent={content}
        sourceContentId={contentId}
        onCancel={() => setInsertDocumentModalOpen(false)}
        onSuccess={() => setInsertDocumentModalOpen(false)}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="删除笔记"
        description="确定要删除该笔记吗？删除后无法恢复。"
        danger
        confirmText="删除"
        onConfirm={async () => {
          if (!currentNote) return;
          setDeleteConfirmOpen(false);
          try {
            await deleteVLNote(currentNote.id);
            toast.success("笔记已删除");
            onBack();
          } catch (error) {
            console.error("Failed to delete note:", error);
            toast.error("删除笔记失败");
          }
        }}
      />
    </div>
  );
});

NoteEditorView.displayName = "NoteEditorView";

export default NoteEditorView;

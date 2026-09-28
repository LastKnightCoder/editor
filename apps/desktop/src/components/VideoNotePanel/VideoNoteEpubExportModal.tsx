/**
 * 视频笔记 · AI 导出电子书：两步工作台型弹窗。
 * ① 选写作风格 → AI 基于转录流式改写成草稿（可直接编辑）；② 书籍元数据、封面与格式 → 导出。
 * 两步正文都接 FadeScroll；导出进行中 / 流式生成中封锁关闭路径。
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createDesktopKit } from "@/services/editorKit";
import type { EditorKit } from "@tau/editor/src";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Download,
  FileText,
  ImagePlus,
  Loader2,
  Sparkles,
  Square,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Descendant } from "slate";
import { Editor, EditorRef, HeaderExtension } from "@tau/editor/src";
import { Button, ConfirmDialog, Dialog, Input, Textarea, cn, toast } from "@tau/ui";
import { FadeScroll } from "@/components/FadeScroll";
import { readBinaryFile, selectFile, showInFolder } from "@/commands";
import type { EpubMetadataInput } from "@/types";
import type { ProviderConfig, ModelConfig } from "@/types/llm";
import { importFromMarkdown, getMarkdown } from "@/utils/markdown";
import { resolveLocalMediaPath } from "@/utils/localMediaPath";
import { remoteResourceToLocal } from "@/utils/resouce";
import {
  EpubRememberedMetadata,
  buildDefaultEpubMetadata,
  extractImageSources,
  exportSlateToEpubWithDialog,
} from "@/utils/epub-export";
import { exportVideoNoteToPdfWithDialog } from "@/utils/pdf-export";
import useVideoEbookRewrite from "@/hooks/useVideoEbookRewrite";
import type { VideoEbookRewriteStyle } from "@/constants/prompts/video-ebook-rewrite";
import { summarizeExportResults, type ExportFormatResult } from "./export-result-summary";

// 草稿按电子书目录编排，标题不折叠
/** EPUB 导出草稿场景（ER-016）：标题不可折叠，其余按底座 */
let draftKit: EditorKit | null = null;
const getEpubDraftKit = () =>
  (draftKit ??= createDesktopKit([new HeaderExtension({ disableCollapse: true })]));

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

const STORAGE_KEY = "video-note-epub-export-metadata-remembered";
const IMAGE_EXTENSION_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  avif: "image/avif",
};

type Step = "rewrite" | "export-settings";
type ExportFormat = "pdf" | "epub";

interface CoverCandidate {
  id: string;
  source: string;
  dataUri: string;
  label: string;
}

interface VideoNoteEpubExportModalProps {
  open: boolean;
  onClose: () => void;
  videoNoteId: number;
  transcript: string;
  videoTitle?: string;
  videoDescription?: string;
  providerConfig: ProviderConfig | null;
  modelConfig: ModelConfig | null;
  onOpenLLMSettings: () => void;
}

const STYLE_OPTIONS: Array<{
  label: string;
  value: VideoEbookRewriteStyle;
  description: string;
}> = [
  { label: "杂志长文", value: "magazine", description: "叙事流畅，兼顾信息密度" },
  { label: "学术总结", value: "academic", description: "结构严谨，论证与结论清晰" },
  { label: "轻松博客", value: "casual", description: "语气亲切，段落短而轻快" },
  { label: "技术文档", value: "technical", description: "术语统一，步骤便于检索" },
];

const FORMAT_OPTIONS: Array<{
  value: ExportFormat;
  label: string;
  icon: LucideIcon;
  description: string;
}> = [
  { value: "epub", label: "EPUB", icon: BookOpen, description: "电子书格式，带封面与章节导航" },
  { value: "pdf", label: "PDF", icon: FileText, description: "适合打印与阅读，自适应分页" },
];

const STEPS: Array<{ key: Step; label: string; subtitle: string }> = [
  {
    key: "rewrite",
    label: "生成草稿",
    subtitle: "选择写作风格，AI 把转录改写成可编辑的电子书草稿",
  },
  { key: "export-settings", label: "导出设置", subtitle: "填写书籍信息、挑选封面，选择导出格式" },
];

const normalizeText = (value?: string) => (value || "").trim();
const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const getFileNameFromPath = (value: string) => {
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "cover";
};

const getMimeTypeFromPath = (value: string) => {
  const clean = value.split("?")[0].split("#")[0];
  const dotIndex = clean.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === clean.length - 1) {
    return "image/png";
  }
  const ext = clean.slice(dotIndex + 1).toLowerCase();
  return IMAGE_EXTENSION_TO_MIME[ext] || "image/png";
};

const uint8ArrayToBase64 = (bytes: Uint8Array) => {
  const globalBuffer = (globalThis as unknown as { Buffer?: typeof Buffer }).Buffer;
  if (globalBuffer) {
    return globalBuffer.from(bytes).toString("base64");
  }

  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const sourceToDataUri = async (source: string) => {
  const normalizedSource = normalizeText(source);
  if (!normalizedSource) {
    throw new Error("图片地址为空");
  }

  if (normalizedSource.startsWith("data:image/")) {
    return normalizedSource;
  }

  if (normalizedSource.startsWith("data:")) {
    throw new Error("仅支持 image/* 的 data URI");
  }

  const resolvedSource = await resolveLocalMediaPath(normalizedSource);
  let resourcePath = normalizeText(resolvedSource || normalizedSource);
  if (isHttpUrl(resourcePath)) {
    resourcePath = await remoteResourceToLocal(resourcePath);
  }

  if (resourcePath.startsWith("ltoh:///")) {
    resourcePath = decodeURIComponent(resourcePath.slice("ltoh:///".length));
  }

  const bytes = await readBinaryFile(resourcePath);
  const mimeType = getMimeTypeFromPath(normalizedSource || resourcePath);
  return `data:${mimeType};base64,${uint8ArrayToBase64(bytes)}`;
};

const createEmptyContent = (): Descendant[] =>
  JSON.parse(JSON.stringify(DEFAULT_CONTENT)) as Descendant[];

/** 字段：12px 淡墨标签 + 可选提示 / 右侧动作，内容在下 */
function Field({
  label,
  required,
  hint,
  action,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-h-[20px] items-center gap-2">
        <span className="text-ink-2 text-[12px]">
          {label}
          {required && <span className="text-danger ml-0.5">*</span>}
        </span>
        {hint && <span className="text-ink-3 text-[11.5px]">{hint}</span>}
        <span className="flex-1" />
        {action}
      </div>
      {children}
    </div>
  );
}

/** 应答区左侧的步骤进度：当前步 accent 圆点，已完成打勾 */
function StepIndicator({ current }: { current: Step }) {
  const currentIndex = STEPS.findIndex(s => s.key === current);
  return (
    <ol className="m-0 mr-auto flex list-none items-center gap-2 p-0">
      {STEPS.map((s, index) => {
        const active = index === currentIndex;
        const done = index < currentIndex;
        return (
          <li key={s.key} className="flex items-center gap-2">
            {index > 0 && (
              <span className={cn("h-px w-5", done || active ? "bg-accent" : "bg-line-1")} />
            )}
            <span
              className={cn(
                "flex items-center gap-1.5 text-[12px]",
                active ? "text-ink-1 font-medium" : "text-ink-3"
              )}
            >
              <span
                className={cn(
                  "grid size-[18px] place-items-center rounded-full text-[10.5px] font-semibold",
                  active
                    ? "bg-accent text-ink-inverse"
                    : done
                      ? "bg-accent-soft text-accent-text"
                      : "bg-sunken text-ink-3"
                )}
              >
                {done ? <Check className="size-[11px]" strokeWidth={2.5} /> : index + 1}
              </span>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const VideoNoteEpubExportModal = (props: VideoNoteEpubExportModalProps) => {
  const {
    open,
    onClose,
    videoNoteId,
    transcript,
    videoTitle,
    videoDescription,
    providerConfig,
    modelConfig,
    onOpenLLMSettings,
  } = props;
  const editorRef = useRef<EditorRef>(null);
  const [step, setStep] = useState<Step>("rewrite");
  const [editorSessionId, setEditorSessionId] = useState(0);
  const [selectedStyle, setSelectedStyle] = useState<VideoEbookRewriteStyle>("magazine");
  const [selectedFormats, setSelectedFormats] = useState<Set<ExportFormat>>(new Set(["epub"]));
  const [draftContent, setDraftContent] = useState<Descendant[]>(DEFAULT_CONTENT);
  const [hasDraft, setHasDraft] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<{ formats: string; details: string } | null>(null);
  const [coverCandidates, setCoverCandidates] = useState<CoverCandidate[]>([]);
  const [loadingCoverCandidates, setLoadingCoverCandidates] = useState(false);
  const [metadata, setMetadata] = useState<EpubMetadataInput>({
    title: "",
    author: "",
    language: "zh-CN",
    description: "",
  });
  const [remembered, setRemembered] = useLocalStorageState<EpubRememberedMetadata | undefined>(
    STORAGE_KEY,
    {
      defaultValue: undefined,
    }
  );
  const [llmMissingOpen, setLlmMissingOpen] = useState(false);
  // 多格式导出中途取消某一格式时，问是否继续下一个；resolver 只兑现一次（确认后 ConfirmDialog 还会走关闭回调）
  const [continuePrompt, setContinuePrompt] = useState<{ canceled: string; next: string } | null>(
    null
  );
  const continueResolverRef = useRef<((value: boolean) => void) | null>(null);

  const {
    isRewriting,
    isPending,
    error: rewriteError,
    ebookContent,
    finalMarkdown,
    startRewrite,
    stopRewrite,
    reset: resetRewriteState,
  } = useVideoEbookRewrite(providerConfig, modelConfig);

  const loadCoverCandidates = useMemoizedFn(
    async (contentForCover: Descendant[], defaultMetadata: EpubMetadataInput) => {
      setCoverCandidates([]);
      setLoadingCoverCandidates(true);

      const rawSources = [
        normalizeText(defaultMetadata.coverImageSrc),
        ...extractImageSources(contentForCover, 12),
      ].filter(Boolean) as string[];
      const uniqueSources = Array.from(new Set(rawSources));
      const nextCandidates: CoverCandidate[] = [];

      for (let index = 0; index < uniqueSources.length; index += 1) {
        const source = uniqueSources[index];
        try {
          const dataUri = await sourceToDataUri(source);
          nextCandidates.push({
            id: `candidate-${index + 1}`,
            source,
            dataUri,
            label: `正文图片 ${index + 1}`,
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.warn(`封面候选图解析失败: ${source}`, msg);
        }
      }

      setCoverCandidates(nextCandidates);
      setLoadingCoverCandidates(false);
      setMetadata(prev => {
        const currentCover = normalizeText(prev.coverImageSrc);
        const matchedCandidate = nextCandidates.find(
          candidate => candidate.dataUri === currentCover || candidate.source === currentCover
        );
        if (matchedCandidate) {
          return {
            ...prev,
            coverImageSrc: matchedCandidate.dataUri,
          };
        }
        if (!currentCover && nextCandidates.length > 0) {
          return {
            ...prev,
            coverImageSrc: nextCandidates[0].dataUri,
          };
        }
        return prev;
      });
    }
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    resetRewriteState();
    setStep("rewrite");
    const emptyContent = createEmptyContent();
    setHasDraft(false);
    setDraftContent(emptyContent);
    setEditorSessionId(prev => prev + 1);
    setSelectedFormats(new Set(["epub"]));
    setExportError(null);
    const defaultMetadata = buildDefaultEpubMetadata({
      content: emptyContent,
      title: videoTitle || "视频电子书",
      remembered,
    });
    setMetadata(defaultMetadata);
  }, [open, videoTitle, remembered, resetRewriteState]);

  useEffect(() => {
    if (!open || !isRewriting || !ebookContent) {
      return;
    }
    setHasDraft(true);
    setDraftContent(ebookContent);
    editorRef.current?.setEditorValue(ebookContent);
  }, [open, isRewriting, ebookContent]);

  useEffect(() => {
    if (!open || !finalMarkdown) {
      return;
    }
    try {
      const parsed = importFromMarkdown(finalMarkdown);
      setHasDraft(Boolean(normalizeText(finalMarkdown)));
      setDraftContent(parsed);
      editorRef.current?.setEditorValue(parsed);
    } catch (error) {
      console.error("最终草稿解析失败:", error);
    }
  }, [open, finalMarkdown]);

  useEffect(() => {
    if (!open || !rewriteError) {
      return;
    }
    toast.error(rewriteError.message || "电子书草稿生成失败");
  }, [open, rewriteError]);

  const onFieldChange = useMemoizedFn((field: keyof EpubMetadataInput, value: string) => {
    setMetadata(prev => ({
      ...prev,
      [field]: value,
    }));
  });

  const handleSelectCoverCandidate = useMemoizedFn((candidate: CoverCandidate) => {
    setMetadata(prev => ({
      ...prev,
      coverImageSrc: candidate.dataUri,
    }));
  });

  const handleChooseCoverFromFile = useMemoizedFn(async () => {
    const selected = await selectFile({
      properties: ["openFile"],
      filters: [
        {
          name: "图片",
          extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "avif"],
        },
      ],
    });
    if (!selected || selected.length === 0) {
      return;
    }

    const filePath = selected[0];
    try {
      const bytes = await readBinaryFile(filePath);
      const dataUri = `data:${getMimeTypeFromPath(filePath)};base64,${uint8ArrayToBase64(bytes)}`;
      const newCandidate: CoverCandidate = {
        id: `upload-${Date.now()}`,
        source: filePath,
        dataUri,
        label: `本地文件：${getFileNameFromPath(filePath)}`,
      };

      setCoverCandidates(prev => {
        const deduped = prev.filter(candidate => candidate.dataUri !== newCandidate.dataUri);
        return [newCandidate, ...deduped];
      });

      setMetadata(prev => ({
        ...prev,
        coverImageSrc: dataUri,
      }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`读取封面图失败：${msg}`);
    }
  });

  const handleClearCover = useMemoizedFn(() => {
    setMetadata(prev => ({
      ...prev,
      coverImageSrc: undefined,
    }));
  });

  const selectedCoverPreview = useMemo(() => {
    const coverValue = normalizeText(metadata.coverImageSrc);
    if (!coverValue) {
      return "";
    }
    if (coverValue.startsWith("data:image/")) {
      return coverValue;
    }
    const matched = coverCandidates.find(
      candidate => candidate.source === coverValue || candidate.dataUri === coverValue
    );
    return matched?.dataUri || "";
  }, [metadata.coverImageSrc, coverCandidates]);

  const exportButtonText = useMemo(() => {
    const formats = FORMAT_OPTIONS.filter(o => selectedFormats.has(o.value));
    if (formats.length === 0) return "选择导出格式";
    if (formats.length === 1) return `导出 ${formats[0].label}`;
    return "导出 EPUB 和 PDF";
  }, [selectedFormats]);

  const toggleFormat = useMemoizedFn((format: ExportFormat) => {
    setSelectedFormats(prev => {
      const next = new Set(prev);
      if (next.has(format)) next.delete(format);
      else next.add(format);
      return next;
    });
  });

  const handleStartRewrite = useMemoizedFn(() => {
    if (!normalizeText(transcript)) {
      toast.warning("缺少转录文稿，请先完成转录");
      return;
    }
    if (!providerConfig || !modelConfig) {
      setLlmMissingOpen(true);
      return;
    }

    startRewrite({
      transcript,
      videoTitle,
      videoDescription,
      style: selectedStyle,
    });
  });

  const handleEditorChange = useMemoizedFn((content: Descendant[]) => {
    setDraftContent(content);
    if (isRewriting) {
      return;
    }
    const markdown = getMarkdown(content);
    setHasDraft(Boolean(normalizeText(markdown)));
  });

  const handleGoToExportSettings = useMemoizedFn(() => {
    const defaultMetadata = buildDefaultEpubMetadata({
      content: draftContent,
      title: videoTitle || "视频电子书",
      remembered,
    });
    setMetadata(prev => ({
      ...defaultMetadata,
      title: prev.title || defaultMetadata.title,
      author: prev.author || defaultMetadata.author,
      language: prev.language || defaultMetadata.language,
      description: prev.description || defaultMetadata.description,
    }));

    loadCoverCandidates(draftContent, metadata).catch(error => {
      console.error("加载封面候选图失败:", error);
      setLoadingCoverCandidates(false);
    });

    setExportError(null);
    setStep("export-settings");
  });

  const handleBackToRewrite = useMemoizedFn(() => {
    setStep("rewrite");
  });

  const revealExportInFolder = useMemoizedFn(async (filePath: string) => {
    try {
      await showInFolder(filePath);
    } catch (error) {
      console.warn("打开导出目录失败:", error);
    }
  });

  const askContinueExport = (canceled: string, next: string) =>
    new Promise<boolean>(resolve => {
      continueResolverRef.current = resolve;
      setContinuePrompt({ canceled, next });
    });

  const settleContinuePrompt = (value: boolean) => {
    continueResolverRef.current?.(value);
    continueResolverRef.current = null;
    setContinuePrompt(null);
  };

  const handleConfirmExport = useMemoizedFn(async () => {
    const markdown = normalizeText(getMarkdown(draftContent));
    if (!markdown) {
      toast.error("请先生成或编辑电子书草稿");
      return;
    }

    // 验证至少选择一种格式
    if (selectedFormats.size === 0) {
      toast.error("请至少选择一种导出格式");
      return;
    }

    const normalizedMetadata: EpubMetadataInput = {
      title: normalizeText(metadata.title),
      author: normalizeText(metadata.author),
      language: normalizeText(metadata.language) || "zh-CN",
      description: normalizeText(metadata.description),
      coverImageSrc: normalizeText(metadata.coverImageSrc) || undefined,
    };

    if (!normalizedMetadata.title) {
      toast.error("书名不能为空");
      return;
    }
    if (!normalizedMetadata.author) {
      toast.error("作者不能为空");
      return;
    }

    setExporting(true);
    setExportError(null);
    const formatsToExport = FORMAT_OPTIONS.map(o => o.value).filter(f => selectedFormats.has(f));
    const results: ExportFormatResult[] = [];

    try {
      for (let i = 0; i < formatsToExport.length; i++) {
        const format = formatsToExport[i];
        const label = format.toUpperCase();
        const isLastFormat = i === formatsToExport.length - 1;
        const exportOptions = {
          content: draftContent,
          metadata: normalizedMetadata,
          defaultFileName: normalizedMetadata.title,
        };
        const result =
          format === "pdf"
            ? await exportVideoNoteToPdfWithDialog(exportOptions)
            : await exportSlateToEpubWithDialog(exportOptions);

        if (result.canceled) {
          results.push({ format: label, success: false, canceled: true });
          if (!isLastFormat) {
            const shouldContinue = await askContinueExport(
              label,
              formatsToExport[i + 1].toUpperCase()
            );
            if (!shouldContinue) {
              toast.info("已取消导出");
              return;
            }
          }
        } else if (!result.filePath) {
          // 未取消但没有文件路径 = 失败
          results.push({
            format: label,
            success: false,
            warnings: result.warnings || [`${label} 导出失败`],
          });
        } else {
          results.push({
            format: label,
            success: true,
            filePath: result.filePath,
            warnings: result.warnings,
          });
        }
      }

      const { successResults, failedResults, canceledResults, status } =
        summarizeExportResults(results);
      const failedFormats = failedResults.map(r => r.format).join("、");
      const failedDetails = failedResults.flatMap(r => r.warnings || []).join("\n");

      if (status === "all-failed") {
        // 全部失败：弹窗不关，失败原因贴在表单顶部
        setExportError({ formats: failedFormats, details: failedDetails });
        return;
      }
      if (status === "all-canceled") {
        toast.info("已取消导出");
        return;
      }
      if (status !== "all-success" && status !== "partial-success") {
        toast.info("未完成任何导出");
        return;
      }

      const successFormats = successResults.map(r => r.format).join("、");
      if (status === "all-success") {
        toast.success(`已导出 ${successFormats}`);
      } else {
        const canceledFormats = canceledResults.map(r => r.format).join("、");
        const parts = [`已导出 ${successFormats}`];
        if (failedFormats) parts.push(`${failedFormats} 导出失败`);
        if (canceledFormats) parts.push(`已取消 ${canceledFormats}`);
        if (failedDetails) console.warn("电子书部分格式导出失败:", failedDetails);
        toast.warning(parts.join("，"));
      }

      if (successResults[0]?.filePath) {
        await revealExportInFolder(successResults[0].filePath);
      }

      setRemembered({
        author: normalizedMetadata.author,
        language: normalizedMetadata.language,
      });

      onClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`导出失败：${msg}`);
      // 异常时不关闭弹窗
    } finally {
      setExporting(false);
    }
  });

  const handleClose = useMemoizedFn(() => {
    if (isRewriting) {
      stopRewrite();
    }
    resetRewriteState();
    onClose();
  });

  const statusText = isRewriting
    ? isPending
      ? "等待模型响应…"
      : "正在生成草稿…"
    : hasDraft
      ? "草稿已就绪，可直接修改"
      : "选好风格后生成草稿，也可以直接在这里写";

  const renderRewriteStep = () => (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 pb-5 pt-4">
      <Field label="写作风格">
        <div role="radiogroup" aria-label="写作风格" className="grid grid-cols-4 gap-2">
          {STYLE_OPTIONS.map(option => {
            const active = option.value === selectedStyle;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={isRewriting}
                onClick={() => setSelectedStyle(option.value)}
                className={cn(
                  "ease-tau-out rounded-[10px] border px-3 py-2 text-left outline-none transition-[background,border-color] duration-150 focus-visible:shadow-[var(--tau-focus-ring)]",
                  "disabled:cursor-default disabled:opacity-55",
                  active ? "border-accent bg-accent-soft" : "border-line-1 enabled:hover:bg-hover"
                )}
              >
                <span
                  className={cn(
                    "block text-[13px] font-semibold",
                    active ? "text-accent-text" : "text-ink-1"
                  )}
                >
                  {option.label}
                </span>
                <span className="text-ink-3 mt-0.5 block text-[11.5px] leading-[1.5]">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </Field>

      <div className="border-line-1 rounded-tau-md flex min-h-0 flex-1 flex-col overflow-hidden border">
        <div className="border-line-2 flex h-10 shrink-0 items-center gap-2 border-b pl-3.5 pr-1.5">
          {isRewriting ? (
            <Loader2 className="text-accent size-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <span
              className={cn("size-[6px] rounded-full", hasDraft ? "bg-ok" : "bg-line-1")}
              aria-hidden
            />
          )}
          <span className="text-tau-meta text-ink-3 min-w-0 flex-1 truncate">{statusText}</span>
          {isRewriting ? (
            <Button variant="ghost" size="sm" icon={Square} onClick={stopRewrite}>
              停止生成
            </Button>
          ) : (
            <Button variant="soft" size="sm" icon={Sparkles} onClick={handleStartRewrite}>
              {hasDraft ? "重新生成" : "生成草稿"}
            </Button>
          )}
        </div>
        <FadeScroll className="min-h-0 flex-1">
          <div className="pb-8 pl-8 pr-[26px] pt-5 [&_[data-slate-editor]]:outline-none">
            <Editor
              kit={getEpubDraftKit()}
              ref={editorRef}
              key={`video-note-ebook-${videoNoteId}-${editorSessionId}`}
              initValue={draftContent}
              onChange={handleEditorChange}
              readonly={isRewriting}
              placeHolder="草稿会在这里逐步出现"
            />
          </div>
        </FadeScroll>
      </div>
    </div>
  );

  const renderCoverColumn = () => (
    <div className="flex min-w-0 flex-col gap-3">
      <Field
        label="封面"
        hint="可选"
        action={
          selectedCoverPreview && (
            <button
              type="button"
              onClick={handleClearCover}
              className="text-ink-3 hover:text-ink-1 inline-flex items-center gap-0.5 text-[12px]"
            >
              <X className="size-3" strokeWidth={2} />
              清除
            </button>
          )
        }
      >
        <button
          type="button"
          onClick={handleChooseCoverFromFile}
          aria-label="选择本地图片作为封面"
          className={cn(
            "rounded-tau-md group relative aspect-[3/4] w-full overflow-hidden border outline-none focus-visible:shadow-[var(--tau-focus-ring)]",
            selectedCoverPreview
              ? "border-line-1 bg-sunken"
              : "border-line-1 bg-hover hover:border-ink-3 border-dashed"
          )}
        >
          {selectedCoverPreview ? (
            <>
              <img
                src={selectedCoverPreview}
                alt="封面预览"
                className="h-full w-full object-cover"
              />
              <span className="bg-overlay text-ink-inverse absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 py-1.5 text-[11.5px] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                <ImagePlus className="size-3.5" strokeWidth={1.75} />
                更换
              </span>
            </>
          ) : (
            <span className="text-ink-3 flex h-full flex-col items-center justify-center gap-1.5 px-4 text-center">
              <ImagePlus className="size-5" strokeWidth={1.5} />
              <span className="text-ink-2 text-[12px]">选择本地图片</span>
              <span className="text-[11px] leading-[1.5]">不选则使用默认封面</span>
            </span>
          )}
        </button>
      </Field>

      {loadingCoverCandidates ? (
        <div className="text-ink-3 flex items-center gap-1.5 text-[11.5px]">
          <Loader2 className="size-3 animate-spin" strokeWidth={2} />
          正在提取草稿中的图片…
        </div>
      ) : coverCandidates.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-ink-3 text-[11.5px]">草稿中的图片</span>
          <div role="radiogroup" aria-label="草稿中的图片" className="grid grid-cols-4 gap-1.5">
            {coverCandidates.map(candidate => {
              const active = metadata.coverImageSrc === candidate.dataUri;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={candidate.label}
                  onClick={() => handleSelectCoverCandidate(candidate)}
                  className={cn(
                    "ease-tau-out aspect-square overflow-hidden rounded-[7px] border outline-none transition-[border-color,box-shadow] duration-150 focus-visible:shadow-[var(--tau-focus-ring)]",
                    active
                      ? "border-accent shadow-[0_0_0_1px_var(--tau-accent)]"
                      : "border-line-1 hover:border-ink-3/60"
                  )}
                >
                  <img
                    src={candidate.dataUri}
                    alt={candidate.label}
                    className="h-full w-full object-cover"
                  />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );

  const renderExportSettingsStep = () => (
    <FadeScroll className="min-h-0 flex-1">
      <div className="grid grid-cols-[196px_minmax(0,1fr)] gap-7 pb-5 pl-6 pr-[18px] pt-4">
        {renderCoverColumn()}

        <div className="flex min-w-0 flex-col gap-4">
          {exportError && (
            <div className="bg-danger-soft text-danger rounded-[10px] px-3 py-2.5 text-[12px] leading-[1.6]">
              <div className="font-medium">{exportError.formats} 导出失败</div>
              {exportError.details && (
                <div className="mt-0.5 whitespace-pre-wrap opacity-80">{exportError.details}</div>
              )}
            </div>
          )}

          <Field label="书名" required>
            <Input
              value={metadata.title}
              placeholder="这本书叫什么"
              onChange={event => onFieldChange("title", event.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="作者" required>
              <Input
                value={metadata.author}
                placeholder="署名"
                onChange={event => onFieldChange("author", event.target.value)}
              />
            </Field>
            <Field label="语言" hint="如 zh-CN / en">
              <Input
                value={metadata.language}
                placeholder="zh-CN"
                onChange={event => onFieldChange("language", event.target.value)}
              />
            </Field>
          </div>

          <Field label="简介" hint="可选">
            <Textarea
              value={metadata.description}
              rows={3}
              placeholder="一两句话介绍这本书"
              onChange={event => onFieldChange("description", event.target.value)}
            />
          </Field>

          <Field label="导出格式" hint="可多选">
            <div className="grid grid-cols-2 gap-2">
              {FORMAT_OPTIONS.map(option => {
                const active = selectedFormats.has(option.value);
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="checkbox"
                    aria-checked={active}
                    onClick={() => toggleFormat(option.value)}
                    className={cn(
                      "ease-tau-out flex items-start gap-2.5 rounded-[10px] border px-3 py-2.5 text-left outline-none transition-[background,border-color] duration-150 focus-visible:shadow-[var(--tau-focus-ring)]",
                      active ? "border-accent bg-accent-soft" : "border-line-1 hover:bg-hover"
                    )}
                  >
                    <Icon
                      className={cn(
                        "mt-px size-4 shrink-0",
                        active ? "text-accent-text" : "text-ink-3"
                      )}
                      strokeWidth={1.75}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-[13px] font-semibold",
                          active ? "text-accent-text" : "text-ink-1"
                        )}
                      >
                        {option.label}
                      </span>
                      <span className="text-ink-3 mt-0.5 block text-[11.5px] leading-[1.5]">
                        {option.description}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "mt-px grid size-4 shrink-0 place-items-center rounded-[5px] border",
                        active ? "border-accent bg-accent text-ink-inverse" : "border-line-1"
                      )}
                    >
                      {active && <Check className="size-3" strokeWidth={2.5} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      </div>
    </FadeScroll>
  );

  const currentStep = STEPS.find(s => s.key === step) ?? STEPS[0];

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={next => !next && handleClose()}
        title="AI 导出电子书"
        icon={<BookOpen strokeWidth={1.75} />}
        subtitle={currentStep.subtitle}
        context={videoTitle || undefined}
        width={880}
        height={760}
        locked={isRewriting || exporting}
        footer={
          step === "rewrite" ? (
            <>
              <StepIndicator current={step} />
              <Button variant="secondary" size="sm" onClick={handleClose}>
                取消
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!hasDraft || isRewriting}
                onClick={handleGoToExportSettings}
              >
                下一步
                <ArrowRight size={15} strokeWidth={1.75} className="-mr-0.5 shrink-0" />
              </Button>
            </>
          ) : (
            <>
              <StepIndicator current={step} />
              <Button
                variant="secondary"
                size="sm"
                icon={ArrowLeft}
                disabled={exporting}
                onClick={handleBackToRewrite}
              >
                上一步
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={Download}
                loading={exporting}
                loadingText="导出中…"
                disabled={selectedFormats.size === 0}
                onClick={handleConfirmExport}
              >
                {exportButtonText}
              </Button>
            </>
          )
        }
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {step === "rewrite" ? renderRewriteStep() : renderExportSettingsStep()}
          </motion.div>
        </AnimatePresence>
      </Dialog>

      <ConfirmDialog
        open={llmMissingOpen}
        onOpenChange={setLlmMissingOpen}
        title="未配置重写模型"
        description="请先在设置中为「视频电子书重写」配置 LLM 模型。"
        confirmText="打开设置"
        onConfirm={onOpenLLMSettings}
      />

      <ConfirmDialog
        open={continuePrompt !== null}
        onOpenChange={next => !next && settleContinuePrompt(false)}
        title="继续导出？"
        description={
          continuePrompt
            ? `已跳过 ${continuePrompt.canceled}，是否继续导出 ${continuePrompt.next}？`
            : undefined
        }
        confirmText="继续导出"
        onConfirm={() => settleContinuePrompt(true)}
      />
    </>
  );
};

export default VideoNoteEpubExportModal;

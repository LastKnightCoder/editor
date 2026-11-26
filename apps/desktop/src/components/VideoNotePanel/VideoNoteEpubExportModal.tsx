import { ebookTranslator, useEbookI18n } from "./i18n-ebook";
import { desktopI18n } from "@/app/i18n/runtime";
/**
 * 视频笔记 · AI 导出电子书：两步工作台型弹窗。
 * ① 选写作风格 → AI 基于转录流式改写成草稿（可直接编辑）；② 书籍元数据、封面与格式 → 导出。
 * 两步正文都接 FadeScroll；导出进行中 / 流式生成中封锁关闭路径。
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createDesktopKit } from "@/services/editorKit";
import type { EditorKit } from "@tau/editor";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Download,
  FileText,
  FileType,
  ImagePlus,
  Loader2,
  Sparkles,
  Square,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Descendant } from "slate";
import { Editor } from "@tau/editor";
import { useLocalEditorDocument } from "@/hooks/useLocalEditorDocument";
import { createHeaderExtension } from "@tau/editor/extensions/header";
import { Button, ConfirmDialog, Dialog, Input, Textarea, cn, toast } from "@tau/ui";
import { FadeScroll } from "@tau/ui";
import { readBinaryFile, selectFile, showInFolder } from "@/commands";
import type { EpubMetadataInput } from "@/types";
import type { LLMProviderSetting, LLMModelSetting, PiThinkingLevel } from "@/types/pi-llm";
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
import { saveContentAsWord } from "@/services/content-transfer";
import useVideoEbookRewrite from "@/hooks/useVideoEbookRewrite";
import type { VideoEbookRewriteStyle } from "@/constants/prompts/video-ebook-rewrite";
import { summarizeExportResults, type ExportFormatResult } from "./export-result-summary";

// 草稿按电子书目录编排，标题不折叠
/** EPUB 导出草稿场景（ER-016）：标题不可折叠，其余按底座 */
let draftKit: EditorKit | null = null;
const getEpubDraftKit = () =>
  (draftKit ??= createDesktopKit([createHeaderExtension({ disableCollapse: true })]));

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
type ExportFormat = "pdf" | "epub" | "docx";

interface CoverCandidate {
  id: string;
  source: string;
  dataUri: string;
  origin: { kind: "content"; index: number } | { kind: "file"; name: string };
}

interface VideoNoteEpubExportModalProps {
  open: boolean;
  onClose: () => void;
  videoNoteId: number;
  transcript: string;
  videoTitle?: string;
  videoDescription?: string;
  provider: LLMProviderSetting | null;
  model: LLMModelSetting | null;
  thinkingLevel?: PiThinkingLevel;
  onOpenLLMSettings: () => void;
}

const STYLE_OPTIONS: Array<{ value: VideoEbookRewriteStyle }> = [
  { value: "magazine" },
  { value: "academic" },
  { value: "casual" },
  { value: "technical" },
];

const FORMAT_OPTIONS: Array<{
  value: ExportFormat;
  label: string;
  icon: LucideIcon;
}> = [
  { value: "epub", label: "EPUB", icon: BookOpen },
  { value: "pdf", label: "PDF", icon: FileText },
  { value: "docx", label: "Word", icon: FileType },
];

const formatLabel = (format: ExportFormat) =>
  FORMAT_OPTIONS.find(option => option.value === format)?.label ?? format;

const STEPS: Array<{ key: Step }> = [{ key: "rewrite" }, { key: "export-settings" }];
type ExportFailureDetail = { kind: "raw"; text: string } | { kind: "format"; format: string };
const formatNames = (names: readonly string[]) =>
  new Intl.ListFormat(desktopI18n.getSnapshot()).format(names);

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
    throw new Error(ebookTranslator.t("cover.emptyAddress"));
  }

  if (normalizedSource.startsWith("data:image/")) {
    return normalizedSource;
  }

  if (normalizedSource.startsWith("data:")) {
    throw new Error(ebookTranslator.t("cover.invalidData"));
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
  const { t, locale } = useEbookI18n();
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
                {done ? (
                  <Check className="size-[11px]" strokeWidth={2.5} />
                ) : (
                  (index + 1).toLocaleString(locale)
                )}
              </span>
              {t(`step.${s.key}.label`)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const VideoNoteEpubExportModal = (props: VideoNoteEpubExportModalProps) => {
  const { t, locale } = useEbookI18n();
  const {
    open,
    onClose,
    videoNoteId,
    transcript,
    videoTitle,
    videoDescription,
    provider,
    model,
    thinkingLevel: ebookThinkingLevel,
    onOpenLLMSettings,
  } = props;
  const [step, setStep] = useState<Step>("rewrite");
  const [editorSessionId, setEditorSessionId] = useState(0);
  const [selectedStyle, setSelectedStyle] = useState<VideoEbookRewriteStyle>("magazine");
  const [selectedFormats, setSelectedFormats] = useState<Set<ExportFormat>>(new Set(["epub"]));
  const [draftContent, setDraftContent] = useState<Descendant[]>(DEFAULT_CONTENT);
  const [hasDraft, setHasDraft] = useState(false);
  const draftDocument = useLocalEditorDocument(
    `video:${videoNoteId}:${editorSessionId}`,
    content => {
      setDraftContent(content);
      setHasDraft(Boolean(normalizeText(getMarkdown(content))));
    }
  );
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<{
    formats: string[];
    details: ExportFailureDetail[];
  } | null>(null);
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
  const [continuePrompt, setContinuePrompt] = useState<{
    canceled: ExportFormat;
    next: ExportFormat;
  } | null>(null);
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
  } = useVideoEbookRewrite(provider, model, ebookThinkingLevel);

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
            origin: { kind: "content", index: index + 1 },
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
    if (!open || !ebookContent) {
      return;
    }
    setHasDraft(true);
    setDraftContent(ebookContent);
    draftDocument.updateContent(ebookContent, "external");
  }, [open, ebookContent, draftDocument]);

  useEffect(() => {
    if (!open || !finalMarkdown) {
      return;
    }
    try {
      const parsed = importFromMarkdown(finalMarkdown);
      setHasDraft(Boolean(normalizeText(finalMarkdown)));
      setDraftContent(parsed);
      draftDocument.updateContent(parsed, "external");
    } catch (error) {
      console.error("最终草稿解析失败:", error);
    }
  }, [open, finalMarkdown, draftDocument]);

  useEffect(() => {
    if (!open || !rewriteError) {
      return;
    }
    toast.error(rewriteError.message || ebookTranslator.t("rewrite.failed"));
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
          name: t("cover.fileFilter"),
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
        origin: { kind: "file", name: getFileNameFromPath(filePath) },
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
      toast.error(t("cover.readFailed", { error: msg }));
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
    const formats = FORMAT_OPTIONS.filter(option => selectedFormats.has(option.value));
    return formats.length === 0
      ? t("export.chooseFormat")
      : t("export.action", { formats: formatNames(formats.map(option => option.label)) });
  }, [selectedFormats, t]);

  const coverLabel = (candidate: CoverCandidate) =>
    candidate.origin.kind === "content"
      ? t("cover.body", { index: candidate.origin.index.toLocaleString(locale) })
      : t("cover.file", { name: candidate.origin.name });

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
      toast.warning(t("rewrite.missingTranscript"));
      return;
    }
    if (!provider || !model) {
      setLlmMissingOpen(true);
      return;
    }

    setEditorSessionId(previous => previous + 1);
    setDraftContent(createEmptyContent());
    setHasDraft(false);
    startRewrite({
      transcript,
      videoTitle,
      videoDescription,
      style: selectedStyle,
    });
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

  const askContinueExport = (canceled: ExportFormat, next: ExportFormat) =>
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
      toast.error(t("export.emptyDraft"));
      return;
    }

    if (selectedFormats.size === 0) {
      toast.error(t("export.missingFormat"));
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
      toast.error(t("export.missingTitle"));
      return;
    }
    if (!normalizedMetadata.author) {
      toast.error(t("export.missingAuthor"));
      return;
    }

    setExporting(true);
    setExportError(null);
    const formatsToExport = FORMAT_OPTIONS.map(o => o.value).filter(f => selectedFormats.has(f));
    const results: ExportFormatResult[] = [];

    try {
      for (let i = 0; i < formatsToExport.length; i++) {
        const format = formatsToExport[i];
        const label = formatLabel(format);
        const isLastFormat = i === formatsToExport.length - 1;
        const exportOptions = {
          content: draftContent,
          metadata: normalizedMetadata,
          defaultFileName: normalizedMetadata.title,
        };
        const result =
          format === "pdf"
            ? await exportVideoNoteToPdfWithDialog(exportOptions)
            : format === "docx"
              ? await saveContentAsWord({ title: normalizedMetadata.title, content: draftContent })
              : await exportSlateToEpubWithDialog(exportOptions);

        if (result.canceled) {
          results.push({ format: label, success: false, canceled: true });
          if (!isLastFormat) {
            const shouldContinue = await askContinueExport(format, formatsToExport[i + 1]);
            if (!shouldContinue) {
              toast.info(t("export.canceled"));
              return;
            }
          }
        } else if (!result.filePath) {
          // 未取消但没有文件路径 = 失败
          results.push({
            format: label,
            success: false,
            warnings: result.warnings,
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
      const failedFormats = failedResults.map(r => r.format);
      const failedDetails = failedResults.flatMap<ExportFailureDetail>(result =>
        result.warnings
          ? result.warnings.map(text => ({ kind: "raw", text }))
          : [{ kind: "format", format: result.format }]
      );

      if (status === "all-failed") {
        // 全部失败：弹窗不关，失败原因贴在表单顶部
        setExportError({ formats: failedFormats, details: failedDetails });
        return;
      }
      if (status === "all-canceled") {
        toast.info(t("export.canceled"));
        return;
      }
      if (status !== "all-success" && status !== "partial-success") {
        toast.info(t("export.none"));
        return;
      }

      const successFormats = successResults.map(result => result.format);
      if (status === "all-success") {
        toast.success(t("export.success", { formats: formatNames(successFormats) }));
      } else {
        const canceledFormats = canceledResults.map(result => result.format);
        const key =
          failedFormats.length && canceledFormats.length
            ? "export.partialBoth"
            : failedFormats.length
              ? "export.partialFailed"
              : "export.partialCanceled";
        if (failedDetails.length) console.warn("电子书部分格式导出失败:", failedDetails);
        toast.warning(
          t(key, {
            success: formatNames(successFormats),
            failed: formatNames(failedFormats),
            canceled: formatNames(canceledFormats),
          })
        );
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
      toast.error(t("export.failed", { error: msg }));
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
    ? t(isPending ? "status.pending" : "status.generating")
    : t(hasDraft ? "status.ready" : "status.empty");

  const renderRewriteStep = () => (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 pt-4 pb-5">
      <Field label={t("field.style")}>
        <div role="radiogroup" aria-label={t("field.style")} className="grid grid-cols-4 gap-2">
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
                  {t(`style.${option.value}.label`)}
                </span>
                <span className="text-ink-3 mt-0.5 block text-[11.5px] leading-[1.5]">
                  {t(`style.${option.value}.description`)}
                </span>
              </button>
            );
          })}
        </div>
      </Field>

      <div className="border-line-1 rounded-tau-md flex min-h-0 flex-1 flex-col overflow-hidden border">
        <div className="border-line-2 flex h-10 shrink-0 items-center gap-2 border-b pr-1.5 pl-3.5">
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
              {t("action.stop")}
            </Button>
          ) : (
            <Button variant="soft" size="sm" icon={Sparkles} onClick={handleStartRewrite}>
              {t(hasDraft ? "action.regenerate" : "action.generate")}
            </Button>
          )}
        </div>
        <FadeScroll className="min-h-0 flex-1">
          <div className="pt-5 pr-[26px] pb-8 pl-8 [&_[data-slate-editor]]:outline-none">
            <Editor
              kit={getEpubDraftKit()}
              key={`video-note-ebook-${videoNoteId}-${editorSessionId}`}
              document={draftDocument.document}
              readonly={isRewriting}
              placeHolder={t("draft.placeholder")}
            />
          </div>
        </FadeScroll>
      </div>
    </div>
  );

  const renderCoverColumn = () => (
    <div className="flex min-w-0 flex-col gap-3">
      <Field
        label={t("field.cover")}
        hint={t("field.optional")}
        action={
          selectedCoverPreview && (
            <button
              type="button"
              onClick={handleClearCover}
              className="text-ink-3 hover:text-ink-1 inline-flex items-center gap-0.5 text-[12px]"
            >
              <X className="size-3" strokeWidth={2} />
              {t("action.clear")}
            </button>
          )
        }
      >
        <button
          type="button"
          onClick={handleChooseCoverFromFile}
          aria-label={t("cover.choose")}
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
                alt={t("cover.preview")}
                className="h-full w-full object-cover"
              />
              <span className="bg-overlay text-ink-inverse absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 py-1.5 text-[11.5px] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                <ImagePlus className="size-3.5" strokeWidth={1.75} />
                {t("action.replace")}
              </span>
            </>
          ) : (
            <span className="text-ink-3 flex h-full flex-col items-center justify-center gap-1.5 px-4 text-center">
              <ImagePlus className="size-5" strokeWidth={1.5} />
              <span className="text-ink-2 text-[12px]">{t("cover.local")}</span>
              <span className="text-[11px] leading-[1.5]">{t("cover.defaultHint")}</span>
            </span>
          )}
        </button>
      </Field>

      {loadingCoverCandidates ? (
        <div className="text-ink-3 flex items-center gap-1.5 text-[11.5px]">
          <Loader2 className="size-3 animate-spin" strokeWidth={2} />
          {t("cover.extracting")}
        </div>
      ) : coverCandidates.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-ink-3 text-[11.5px]">{t("cover.fromDraft")}</span>
          <div
            role="radiogroup"
            aria-label={t("cover.fromDraft")}
            className="grid grid-cols-4 gap-1.5"
          >
            {coverCandidates.map(candidate => {
              const active = metadata.coverImageSrc === candidate.dataUri;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={coverLabel(candidate)}
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
                    alt={coverLabel(candidate)}
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
      <div className="grid grid-cols-[196px_minmax(0,1fr)] gap-7 pt-4 pr-[18px] pb-5 pl-6">
        {renderCoverColumn()}

        <div className="flex min-w-0 flex-col gap-4">
          {exportError && (
            <div className="bg-danger-soft text-danger rounded-[10px] px-3 py-2.5 text-[12px] leading-[1.6]">
              <div className="font-medium">
                {t("export.formatFailed", { formats: formatNames(exportError.formats) })}
              </div>
              {exportError.details.length > 0 && (
                <div className="mt-0.5 whitespace-pre-wrap opacity-80">
                  {exportError.details
                    .map(detail =>
                      detail.kind === "raw"
                        ? detail.text
                        : t("export.formatFailed", { formats: detail.format })
                    )
                    .join("\n")}
                </div>
              )}
            </div>
          )}

          <Field label={t("field.title")} required>
            <Input
              value={metadata.title}
              placeholder={t("field.titlePlaceholder")}
              onChange={event => onFieldChange("title", event.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("field.author")} required>
              <Input
                value={metadata.author}
                placeholder={t("field.authorPlaceholder")}
                onChange={event => onFieldChange("author", event.target.value)}
              />
            </Field>
            <Field label={t("field.language")} hint={t("field.languageHint")}>
              <Input
                value={metadata.language}
                placeholder="zh-CN"
                onChange={event => onFieldChange("language", event.target.value)}
              />
            </Field>
          </div>

          <Field label={t("field.description")} hint={t("field.optional")}>
            <Textarea
              value={metadata.description}
              rows={3}
              placeholder={t("field.descriptionPlaceholder")}
              onChange={event => onFieldChange("description", event.target.value)}
            />
          </Field>

          <Field label={t("field.formats")} hint={t("field.multiple")}>
            <div className="grid grid-cols-3 gap-2">
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
                        {t(`format.${option.value}.description`)}
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
        title={t("title")}
        icon={<BookOpen strokeWidth={1.75} />}
        subtitle={t(`step.${currentStep.key}.subtitle`)}
        context={videoTitle || undefined}
        width={880}
        height={760}
        locked={isRewriting || exporting}
        footer={
          step === "rewrite" ? (
            <>
              <StepIndicator current={step} />
              <Button variant="secondary" size="sm" onClick={handleClose}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!hasDraft || isRewriting}
                onClick={handleGoToExportSettings}
              >
                {t("common.next")}
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
                {t("common.previous")}
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={Download}
                loading={exporting}
                loadingText={t("export.busy")}
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
        title={t("settings.title")}
        description={t("settings.description")}
        confirmText={t("settings.open")}
        onConfirm={onOpenLLMSettings}
      />

      <ConfirmDialog
        open={continuePrompt !== null}
        onOpenChange={next => !next && settleContinuePrompt(false)}
        title={t("continue.title")}
        description={
          continuePrompt
            ? t("continue.description", {
                canceled: formatLabel(continuePrompt.canceled),
                next: formatLabel(continuePrompt.next),
              })
            : undefined
        }
        confirmText={t("continue.confirm")}
        onConfirm={() => settleContinuePrompt(true)}
      />
    </>
  );
};

export default VideoNoteEpubExportModal;

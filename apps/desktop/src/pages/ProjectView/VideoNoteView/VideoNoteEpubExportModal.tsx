import { useEffect, useMemo, useRef, useState } from "react";
import { App } from "antd";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { LoadingOutlined } from "@ant-design/icons";
import { motion, AnimatePresence } from "motion/react";
import classNames from "classnames";
import type { Descendant } from "slate";
import { Editor, EditorRef } from "@tau/editor/src";
import { SelectDropDown } from "@tau/shared";
import { readBinaryFile, selectFile, showInFolder } from "@/commands";
import type { EpubMetadataInput } from "@/types";
import type { ProviderConfig, ModelConfig } from "@/types/llm";
import CustomModal from "@/components/CustomModal";
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
import useThemeColors from "@/hooks/useThemeColors";
import type { VideoEbookRewriteStyle } from "@/constants/prompts/video-ebook-rewrite";
import { summarizeExportResults, type ExportFormatResult } from "./export-result-summary";

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
  detail: string;
  icon: string;
}> = [
  {
    label: "杂志风",
    value: "magazine",
    description: "叙事性强、可读性高，兼顾信息密度与阅读节奏",
    detail: "适合把复杂内容整理成更顺滑、更有阅读感的长文结构。",
    icon: "📰",
  },
  {
    label: "学术总结",
    value: "academic",
    description: "结构严谨、概念清晰，强调论点与结论",
    detail: "适合输出定义、论据、方法与结论更明确的总结型内容。",
    icon: "🎓",
  },
  {
    label: "轻松博客",
    value: "casual",
    description: "语气亲切、段落短、节奏快，强调易读性",
    detail: "适合快速浏览和轻阅读场景，让内容更自然、更容易读完。",
    icon: "✏️",
  },
  {
    label: "技术文档",
    value: "technical",
    description: "结构化表达，强调可检索性与准确性",
    detail: "适合沉淀术语、前提、步骤和边界条件都更清晰的说明文。",
    icon: "📋",
  },
];

const FORMAT_OPTIONS = [
  {
    value: "pdf" as const,
    label: "PDF",
    icon: "📄",
    description: "适合打印和阅读，支持自适应分页",
  },
  {
    value: "epub" as const,
    label: "EPUB",
    icon: "📚",
    description: "电子书格式，支持封面和章节导航",
  },
];

const STEP_META: Record<Step, { title: string; subtitle: string }> = {
  rewrite: {
    title: "AI 生成草稿",
    subtitle: "选择写作风格，生成并编辑电子书草稿",
  },
  "export-settings": {
    title: "导出设置",
    subtitle: "配置书籍元数据与封面，选择导出格式",
  },
};

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

const StepIndicator = ({ currentStep }: { currentStep: Step }) => {
  const steps: Array<{ key: Step; label: string; number: number }> = [
    { key: "rewrite", label: "生成草稿", number: 1 },
    { key: "export-settings", label: "导出设置", number: 2 },
  ];

  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, idx) => {
        const isActive = s.key === currentStep;
        const isPast = currentStep === "export-settings" && s.key === "rewrite";
        return (
          <div key={s.key} className="flex items-center gap-1.5">
            {idx > 0 && (
              <div
                className={classNames(
                  "h-px w-5 transition-colors",
                  isPast || isActive ? "bg-[var(--th-accent)]" : "bg-gray-200 dark:bg-zinc-700"
                )}
              />
            )}
            <div
              className={classNames(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all",
                isActive
                  ? "dark:bg-[var(--th-accent)]/15 bg-[var(--th-accent-soft)] text-[var(--th-active-text)]"
                  : isPast
                    ? "text-[var(--th-accent)]/70/60"
                    : "text-gray-400 dark:text-slate-500"
              )}
            >
              <span
                className={classNames(
                  "h-4.5 w-4.5 flex items-center justify-center rounded-full text-[10px] font-bold",
                  isActive
                    ? "bg-[var(--th-btn-bg)] text-[var(--th-btn-text)] dark:bg-[var(--th-accent)]"
                    : isPast
                      ? "bg-[var(--th-accent-soft)] text-[var(--th-active-text)]"
                      : "bg-gray-200 text-gray-500 dark:bg-zinc-700 dark:text-slate-400"
                )}
              >
                {isPast ? "✓" : s.number}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

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
  const { message, modal } = App.useApp();
  const themeColors = useThemeColors();
  const editorRef = useRef<EditorRef>(null);
  const [step, setStep] = useState<Step>("rewrite");
  const [editorSessionId, setEditorSessionId] = useState(0);
  const [selectedStyle, setSelectedStyle] = useState<VideoEbookRewriteStyle>("magazine");
  const [styleDropdownOpen, setStyleDropdownOpen] = useState(false);
  const [selectedFormats, setSelectedFormats] = useState<Set<"pdf" | "epub">>(new Set(["epub"]));
  const [draftContent, setDraftContent] = useState<Descendant[]>(DEFAULT_CONTENT);
  const [hasDraft, setHasDraft] = useState(false);
  const [exporting, setExporting] = useState(false);
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
  const styleTriggerRef = useRef<HTMLButtonElement>(null);

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

  const rewriteActionLabel = hasDraft ? "重新生成" : "生成草稿";

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
    const defaultMetadata = buildDefaultEpubMetadata({
      content: emptyContent,
      title: videoTitle || "视频电子书",
      remembered,
    });
    setMetadata(defaultMetadata);
    setStyleDropdownOpen(false);
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
    message.error(rewriteError.message || "电子书草稿生成失败");
  }, [open, rewriteError, message]);

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
      message.success("封面图已更新");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      message.error(`读取封面图失败：${msg}`);
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
    const formats = Array.from(selectedFormats);
    if (formats.length === 0) return "请选择格式";
    if (formats.length === 1) {
      return `导出 ${formats[0].toUpperCase()}`;
    }
    return "导出 PDF 和 EPUB";
  }, [selectedFormats]);

  const selectedStyleOption = useMemo(
    () => STYLE_OPTIONS.find(option => option.value === selectedStyle) || STYLE_OPTIONS[0],
    [selectedStyle]
  );

  const handleStartRewrite = useMemoizedFn(() => {
    if (!normalizeText(transcript)) {
      message.warning("缺少转录文稿，请先完成转录");
      return;
    }
    if (!providerConfig || !modelConfig) {
      modal.confirm({
        title: "未配置重写模型",
        content: "请先在设置中配置「视频电子书重写」的 LLM 模型。",
        okText: "打开设置",
        cancelText: "取消",
        onOk: onOpenLLMSettings,
      });
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

  const handleConfirmExport = useMemoizedFn(async () => {
    const markdown = normalizeText(getMarkdown(draftContent));
    if (!markdown) {
      message.error("请先生成或编辑电子书草稿");
      return;
    }

    // 验证至少选择一种格式
    if (selectedFormats.size === 0) {
      message.error("请至少选择一种导出格式");
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
      message.error("书名不能为空");
      return;
    }
    if (!normalizedMetadata.author) {
      message.error("作者不能为空");
      return;
    }
    if (!normalizedMetadata.language) {
      message.error("语言不能为空");
      return;
    }

    setExporting(true);
    const formatsToExport = Array.from(selectedFormats);
    const results: ExportFormatResult[] = [];

    try {
      for (let i = 0; i < formatsToExport.length; i++) {
        const format = formatsToExport[i];
        const isLastFormat = i === formatsToExport.length - 1;

        if (format === "pdf") {
          const pdfResult = await exportVideoNoteToPdfWithDialog({
            content: draftContent,
            metadata: normalizedMetadata,
            defaultFileName: normalizedMetadata.title,
          });

          // 处理取消
          if (pdfResult.canceled) {
            results.push({
              format: "PDF",
              success: false,
              canceled: true,
            });

            if (!isLastFormat) {
              const shouldContinue = await new Promise<boolean>(resolve => {
                modal.confirm({
                  title: "继续导出？",
                  content: `您已取消 PDF 导出，是否继续导出 ${formatsToExport[i + 1].toUpperCase()}？`,
                  okText: "继续",
                  cancelText: "取消",
                  onOk: () => resolve(true),
                  onCancel: () => resolve(false),
                });
              });

              if (!shouldContinue) {
                message.info("已取消导出");
                return;
              }
            }
          }
          // 处理失败（未取消但没有文件路径）
          else if (!pdfResult.filePath) {
            results.push({
              format: "PDF",
              success: false,
              warnings: pdfResult.warnings || ["PDF 导出失败"],
            });
          }
          // 成功
          else {
            results.push({
              format: "PDF",
              success: true,
              filePath: pdfResult.filePath,
              warnings: pdfResult.warnings,
            });
          }
        } else if (format === "epub") {
          const epubResult = await exportSlateToEpubWithDialog({
            content: draftContent,
            metadata: normalizedMetadata,
            defaultFileName: normalizedMetadata.title,
          });

          // 处理取消
          if (epubResult.canceled) {
            results.push({
              format: "EPUB",
              success: false,
              canceled: true,
            });

            if (!isLastFormat) {
              const shouldContinue = await new Promise<boolean>(resolve => {
                modal.confirm({
                  title: "继续导出？",
                  content: `您已取消 EPUB 导出，是否继续导出 ${formatsToExport[i + 1].toUpperCase()}？`,
                  okText: "继续",
                  cancelText: "取消",
                  onOk: () => resolve(true),
                  onCancel: () => resolve(false),
                });
              });

              if (!shouldContinue) {
                message.info("已取消导出");
                return;
              }
            }
          }
          // 处理失败（未取消但没有文件路径）
          else if (!epubResult.filePath) {
            results.push({
              format: "EPUB",
              success: false,
              warnings: epubResult.warnings || ["EPUB 导出失败"],
            });
          }
          // 成功
          else {
            results.push({
              format: "EPUB",
              success: true,
              filePath: epubResult.filePath,
              warnings: epubResult.warnings,
            });
          }
        }
      }

      // 显示结果
      const summary = summarizeExportResults(results);
      const { successResults, failedResults, canceledResults, status } = summary;

      if (status === "all-failed") {
        const failedFormats = failedResults.map(r => r.format).join("、");
        const failedWarnings = failedResults.flatMap(r => r.warnings || []).join("\n");
        modal.error({
          title: "导出失败",
          content: (
            <div>
              <p>
                <strong>失败格式：</strong>
                {failedFormats}
              </p>
              {failedWarnings && <p className="mt-2 text-xs text-gray-500">{failedWarnings}</p>}
            </div>
          ),
          okText: "知道了",
        });
        return;
      }

      if (status === "partial-success") {
        const successFormats = successResults.map(r => r.format).join("、");
        const canceledFormats = canceledResults.map(r => r.format).join("、");

        if (failedResults.length > 0) {
          const failedFormats = failedResults.map(r => r.format).join("、");
          const failedWarnings = failedResults.flatMap(r => r.warnings || []).join("\n");
          modal.warning({
            title: "部分导出成功",
            content: (
              <div>
                <p>
                  <strong>成功：</strong>
                  {successFormats}
                </p>
                <p>
                  <strong>失败：</strong>
                  {failedFormats}
                </p>
                {canceledFormats && (
                  <p>
                    <strong>已取消：</strong>
                    {canceledFormats}
                  </p>
                )}
                {failedWarnings && <p className="mt-2 text-xs text-gray-500">{failedWarnings}</p>}
              </div>
            ),
            okText: "知道了",
          });
        } else {
          const detail = canceledFormats ? `，已取消 ${canceledFormats}` : "";
          message.warning(`已导出 ${successFormats}${detail}`);
        }

        if (successResults[0]?.filePath) {
          await revealExportInFolder(successResults[0].filePath);
        }
      } else if (status === "all-success") {
        const paths = successResults.map(r => `${r.format}: ${r.filePath}`).join("\n");
        message.success(`导出成功！\n${paths}`);

        if (successResults[0]?.filePath) {
          await revealExportInFolder(successResults[0].filePath);
        }
      } else if (status === "all-canceled") {
        message.info("已取消导出");
        return;
      } else {
        message.info("未完成任何导出");
        return;
      }

      setRemembered({
        author: normalizedMetadata.author,
        language: normalizedMetadata.language,
      });

      onClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      message.error(`导出失败：${msg}`);
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

  const primaryButtonClass = classNames(
    "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
    themeColors.buttonBg,
    themeColors.buttonTextClass,
    "disabled:bg-gray-200 dark:disabled:bg-zinc-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed dark:disabled:border dark:disabled:border-slate-700"
  );

  const secondaryButtonClass = classNames(
    "px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
    "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300",
    "hover:bg-gray-200 dark:hover:bg-zinc-700",
    "border border-gray-200 dark:border-gray-700"
  );

  const inputClass = classNames(
    "w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-all",
    "bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700",
    "text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500",
    "focus:border-[var(--th-border-focus)] focus:ring-2 focus:ring-[var(--th-accent)]/20"
  );

  const renderRewriteStep = () => (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0">
        <span className="mb-2 block text-xs font-semibold text-gray-500 dark:text-slate-400">
          选择写作风格
        </span>
        <div className="flex items-center gap-3">
          <button
            ref={styleTriggerRef}
            type="button"
            disabled={isRewriting}
            onClick={() => setStyleDropdownOpen(prev => !prev)}
            className={classNames(
              "flex h-12 min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border px-4 text-left transition-all",
              "disabled:cursor-not-allowed disabled:opacity-60",
              "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 dark:border-slate-700 dark:bg-zinc-900/50 dark:hover:border-slate-600 dark:hover:bg-zinc-800/50"
            )}
          >
            <span className="min-w-0 truncate text-sm font-semibold text-gray-800 dark:text-slate-100">
              {selectedStyleOption.label}
            </span>
            <svg
              className={classNames(
                "h-4 w-4 shrink-0 text-gray-400 transition-transform dark:text-slate-500",
                styleDropdownOpen && "rotate-180"
              )}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {isRewriting ? (
            <button
              type="button"
              className="flex h-12 shrink-0 items-center justify-center rounded-xl px-4 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
              onClick={stopRewrite}
            >
              取消生成
            </button>
          ) : (
            <button
              type="button"
              className={classNames(
                "flex h-12 shrink-0 items-center justify-center rounded-xl px-5 text-sm font-semibold transition-colors",
                themeColors.buttonBg,
                themeColors.buttonTextClass
              )}
              onClick={handleStartRewrite}
            >
              {rewriteActionLabel}
            </button>
          )}
        </div>
        <SelectDropDown
          items={STYLE_OPTIONS}
          selectedKey={selectedStyle}
          show={styleDropdownOpen}
          onClose={() => setStyleDropdownOpen(false)}
          onSelect={option => {
            setSelectedStyle(option.value);
          }}
          triggerElement={styleTriggerRef.current}
          getKey={option => option.value}
          renderItem={option => {
            const isSelected = option.value === selectedStyle;
            return (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div
                    className={classNames(
                      "text-[15px] font-semibold leading-6",
                      isSelected
                        ? "text-[var(--th-active-text)]"
                        : "text-gray-800 dark:text-slate-100"
                    )}
                  >
                    {option.label}
                  </div>
                  <p className="mt-1 text-[13px] leading-6 text-gray-500 dark:text-slate-400">
                    {option.description}
                  </p>
                  <p className="mt-1 text-[12px] leading-5 text-gray-400 dark:text-slate-500">
                    {option.detail}
                  </p>
                </div>
                {isSelected && (
                  <span className="mt-1 text-base font-semibold text-[var(--th-accent)]">✓</span>
                )}
              </div>
            );
          }}
          width={Math.max(styleTriggerRef.current?.offsetWidth || 0, 420)}
          maxHeight={420}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-zinc-950/50">
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-gray-100 px-3 dark:border-slate-700/60">
          <span className="text-xs text-gray-500 dark:text-slate-400">
            {isRewriting ? (
              <span className="inline-flex items-center gap-1.5">
                <LoadingOutlined className="animate-spin" />
                {isPending ? "等待模型响应..." : "正在流式生成中..."}
              </span>
            ) : hasDraft ? (
              "草稿已就绪，可直接编辑"
            ) : (
              "选择风格后点击「生成草稿」开始"
            )}
          </span>
          <span
            className={classNames(
              "rounded-md px-2 py-0.5 text-[10px] font-medium",
              isRewriting
                ? "bg-[var(--th-warning)]/15 text-status-warning"
                : "bg-[var(--th-success)]/15 text-status-success"
            )}
          >
            {isRewriting ? "只读" : "可编辑"}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          <Editor
            ref={editorRef}
            key={`video-note-ebook-${videoNoteId}-${editorSessionId}`}
            initValue={draftContent}
            onChange={handleEditorChange}
            readonly={isRewriting}
            className="h-full overflow-y-auto rounded-[18px]"
            style={{
              padding: "20px 20px 20px 32px",
              scrollbarGutter: "stable",
            }}
            features={{ disableHeaderCollapse: true }}
          />
        </div>
      </div>
    </div>
  );

  const renderExportSettingsStep = () => (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="min-h-0 flex-1 overflow-y-auto border border-transparent pr-2"
        style={{ scrollbarGutter: "stable" }}
      >
        <div className="space-y-5 pb-1">
          {/* 导出格式选择 */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-gray-600 dark:text-slate-300">
              导出格式
            </label>
            <div className="grid grid-cols-2 gap-3">
              {FORMAT_OPTIONS.map(option => {
                const isSelected = selectedFormats.has(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      const newFormats = new Set(selectedFormats);
                      if (isSelected) {
                        newFormats.delete(option.value);
                      } else {
                        newFormats.add(option.value);
                      }
                      setSelectedFormats(newFormats);
                    }}
                    className={classNames(
                      "flex flex-col items-start rounded-xl border p-3 text-left transition-all",
                      isSelected
                        ? "bg-[var(--th-accent-soft)]/80 ring-[var(--th-accent)]/25 border-[var(--th-border-focus)] ring-2"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/80 dark:border-slate-700 dark:bg-zinc-900/50 dark:hover:border-slate-600 dark:hover:bg-zinc-800/50"
                    )}
                  >
                    <span className="text-base">{option.icon}</span>
                    <span
                      className={classNames(
                        "text-xs font-semibold",
                        isSelected
                          ? "text-[var(--th-active-text)]"
                          : "text-gray-700 dark:text-slate-200"
                      )}
                    >
                      {option.label}
                    </span>
                    <span
                      className={classNames(
                        "text-[11px]",
                        isSelected
                          ? "text-[var(--th-accent)]/80/70"
                          : "text-gray-400 dark:text-slate-500"
                      )}
                    >
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 基本信息 */}
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-600 dark:text-slate-300">
                书名 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={metadata.title}
                placeholder="请输入书名"
                onChange={event => onFieldChange("title", event.target.value)}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600 dark:text-slate-300">
                  作者 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={metadata.author}
                  placeholder="请输入作者"
                  onChange={event => onFieldChange("author", event.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600 dark:text-slate-300">
                  语言 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={metadata.language}
                  placeholder="例如 zh-CN / en"
                  onChange={event => onFieldChange("language", event.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-600 dark:text-slate-300">
                简介
              </label>
              <textarea
                value={metadata.description}
                rows={2}
                placeholder="可选，建议一句话简介"
                onChange={event => onFieldChange("description", event.target.value)}
                className={classNames(inputClass, "resize-y")}
              />
            </div>
          </div>

          {/* 封面图 */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-600 dark:text-slate-300">
                封面图（可选）
              </label>
              <span className="text-[11px] text-gray-400 dark:text-slate-500">
                封面将用于 EPUB 和 PDF 首页
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleChooseCoverFromFile}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-zinc-900 dark:text-slate-300 dark:hover:bg-zinc-800"
              >
                选择本地图片
              </button>
              {normalizeText(metadata.coverImageSrc) && (
                <button
                  type="button"
                  onClick={handleClearCover}
                  className="rounded-lg px-2.5 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-slate-500 dark:hover:bg-zinc-800 dark:hover:text-slate-300"
                >
                  清除
                </button>
              )}
            </div>

            {selectedCoverPreview ? (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-zinc-950">
                <img
                  src={selectedCoverPreview}
                  alt="封面预览"
                  className="h-40 w-full object-cover"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-4 py-8 dark:border-slate-700 dark:bg-zinc-950/50">
                <span className="text-xs text-gray-400 dark:text-slate-500">
                  未选择封面图，将使用默认样式
                </span>
              </div>
            )}

            {loadingCoverCandidates ? (
              <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500">
                <LoadingOutlined className="animate-spin" />
                正在提取正文图片...
              </div>
            ) : coverCandidates.length > 0 ? (
              <div>
                <span className="mb-2 block text-[11px] text-gray-400 dark:text-slate-500">
                  从草稿中提取的图片
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {coverCandidates.map(candidate => {
                    const isSelected = metadata.coverImageSrc === candidate.dataUri;
                    return (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => handleSelectCoverCandidate(candidate)}
                        className={classNames(
                          "overflow-hidden rounded-lg border-2 transition-all",
                          isSelected
                            ? "ring-[var(--th-accent)]/25 border-[var(--th-accent)] ring-2"
                            : "border-transparent hover:border-gray-300 dark:hover:border-slate-600"
                        )}
                      >
                        <img
                          src={candidate.dataUri}
                          alt={candidate.label}
                          className="h-16 w-full object-cover"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  const renderFooter = () => {
    if (step === "rewrite") {
      return (
        <div className="flex items-center justify-between">
          <StepIndicator currentStep={step} />
          <div className="flex gap-3">
            <button type="button" onClick={handleClose} className={secondaryButtonClass}>
              取消
            </button>
            <button
              type="button"
              onClick={handleGoToExportSettings}
              disabled={!hasDraft || isRewriting}
              className={classNames(primaryButtonClass, "flex items-center gap-1.5")}
            >
              下一步
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between">
        <StepIndicator currentStep={step} />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleBackToRewrite}
            className={classNames(secondaryButtonClass, "flex items-center gap-1.5")}
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            上一步
          </button>
          <button
            type="button"
            onClick={handleConfirmExport}
            disabled={selectedFormats.size === 0 || exporting}
            className={classNames(primaryButtonClass, "flex items-center gap-2")}
          >
            {exporting && (
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.35" />
                <path
                  d="M12 3a9 9 0 0 1 9 9"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeOpacity="0.85"
                />
              </svg>
            )}
            {exportButtonText}
          </button>
        </div>
      </div>
    );
  };

  return (
    <CustomModal
      open={open}
      onCancel={handleClose}
      title={STEP_META[step].title}
      subtitle={STEP_META[step].subtitle}
      footer={renderFooter()}
      width={880}
      bodyClassName="flex min-h-0 px-5 pb-1"
      contentStyle={{ height: "calc(100vh - 200px)" }}
      destroyOnClose={false}
      maskClosable={!isRewriting}
      showCloseButton={!isRewriting}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {step === "rewrite" && renderRewriteStep()}
          {step === "export-settings" && renderExportSettingsStep()}
        </motion.div>
      </AnimatePresence>
    </CustomModal>
  );
};

export default VideoNoteEpubExportModal;

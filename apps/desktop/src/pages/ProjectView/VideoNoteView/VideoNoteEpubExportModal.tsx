import { useEffect, useMemo, useRef, useState } from "react";
import { App } from "antd";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { LoadingOutlined } from "@ant-design/icons";
import { motion, AnimatePresence } from "motion/react";
import classNames from "classnames";
import type { Descendant } from "slate";
import { Editor, EditorRef } from "@tau/editor/src";
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
import useVideoEbookRewrite from "@/hooks/useVideoEbookRewrite";
import useThemeColors from "@/hooks/useThemeColors";
import type { VideoEbookRewriteStyle } from "@/constants/prompts/video-ebook-rewrite";

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
  icon: string;
}> = [
  {
    label: "杂志风",
    value: "magazine",
    description: "叙事性强、可读性高，兼顾信息密度与阅读节奏",
    icon: "📰",
  },
  {
    label: "学术总结",
    value: "academic",
    description: "结构严谨、概念清晰，强调论点与结论",
    icon: "🎓",
  },
  {
    label: "轻松博客",
    value: "casual",
    description: "语气亲切、段落短、节奏快，强调易读性",
    icon: "✏️",
  },
  {
    label: "技术文档",
    value: "technical",
    description: "结构化表达，强调可检索性与准确性",
    icon: "📋",
  },
];

const STEP_META: Record<Step, { title: string; subtitle: string }> = {
  rewrite: {
    title: "AI 生成草稿",
    subtitle: "选择写作风格，生成并编辑电子书草稿",
  },
  "export-settings": {
    title: "导出设置",
    subtitle: "配置书籍元数据与封面，导出 EPUB 文件",
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
  const globalBuffer = (globalThis as unknown as { Buffer?: typeof Buffer })
    .Buffer;
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
                  isPast || isActive
                    ? "bg-indigo-400 dark:bg-indigo-500"
                    : "bg-gray-200 dark:bg-slate-700",
                )}
              />
            )}
            <div
              className={classNames(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all",
                isActive
                  ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400"
                  : isPast
                    ? "text-indigo-500/70 dark:text-indigo-400/60"
                    : "text-gray-400 dark:text-slate-500",
              )}
            >
              <span
                className={classNames(
                  "flex h-4.5 w-4.5 items-center justify-center rounded-full text-[10px] font-bold",
                  isActive
                    ? "bg-indigo-500 text-white dark:bg-indigo-500"
                    : isPast
                      ? "bg-indigo-200 text-indigo-600 dark:bg-indigo-500/30 dark:text-indigo-400"
                      : "bg-gray-200 text-gray-500 dark:bg-slate-700 dark:text-slate-400",
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
  const [selectedStyle, setSelectedStyle] =
    useState<VideoEbookRewriteStyle>("magazine");
  const [draftContent, setDraftContent] =
    useState<Descendant[]>(DEFAULT_CONTENT);
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
  const [remembered, setRemembered] = useLocalStorageState<
    EpubRememberedMetadata | undefined
  >(STORAGE_KEY, {
    defaultValue: undefined,
  });

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
    async (
      contentForCover: Descendant[],
      defaultMetadata: EpubMetadataInput,
    ) => {
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
      setMetadata((prev) => {
        const currentCover = normalizeText(prev.coverImageSrc);
        const matchedCandidate = nextCandidates.find(
          (candidate) =>
            candidate.dataUri === currentCover ||
            candidate.source === currentCover,
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
    },
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
    setEditorSessionId((prev) => prev + 1);
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
    message.error(rewriteError.message || "电子书草稿生成失败");
  }, [open, rewriteError, message]);

  const onFieldChange = useMemoizedFn(
    (field: keyof EpubMetadataInput, value: string) => {
      setMetadata((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
  );

  const handleSelectCoverCandidate = useMemoizedFn(
    (candidate: CoverCandidate) => {
      setMetadata((prev) => ({
        ...prev,
        coverImageSrc: candidate.dataUri,
      }));
    },
  );

  const handleChooseCoverFromFile = useMemoizedFn(async () => {
    const selected = await selectFile({
      properties: ["openFile"],
      filters: [
        {
          name: "图片",
          extensions: [
            "png",
            "jpg",
            "jpeg",
            "webp",
            "gif",
            "bmp",
            "svg",
            "avif",
          ],
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

      setCoverCandidates((prev) => {
        const deduped = prev.filter(
          (candidate) => candidate.dataUri !== newCandidate.dataUri,
        );
        return [newCandidate, ...deduped];
      });

      setMetadata((prev) => ({
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
    setMetadata((prev) => ({
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
      (candidate) =>
        candidate.source === coverValue || candidate.dataUri === coverValue,
    );
    return matched?.dataUri || "";
  }, [metadata.coverImageSrc, coverCandidates]);

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
    setMetadata((prev) => ({
      ...defaultMetadata,
      title: prev.title || defaultMetadata.title,
      author: prev.author || defaultMetadata.author,
      language: prev.language || defaultMetadata.language,
      description: prev.description || defaultMetadata.description,
    }));

    loadCoverCandidates(draftContent, metadata).catch((error) => {
      console.error("加载封面候选图失败:", error);
      setLoadingCoverCandidates(false);
    });

    setStep("export-settings");
  });

  const handleBackToRewrite = useMemoizedFn(() => {
    setStep("rewrite");
  });

  const handleConfirmExport = useMemoizedFn(async () => {
    const markdown = normalizeText(getMarkdown(draftContent));
    if (!markdown) {
      message.error("请先生成或编辑电子书草稿");
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
    try {
      const result = await exportSlateToEpubWithDialog({
        content: draftContent,
        metadata: normalizedMetadata,
        defaultFileName: normalizedMetadata.title,
      });

      setRemembered({
        author: normalizedMetadata.author,
        language: normalizedMetadata.language,
      });

      if (result.canceled) {
        message.info("已取消 EPUB 导出");
      } else {
        message.success(
          result.filePath
            ? `EPUB 导出成功，已保存到：${result.filePath}`
            : "EPUB 导出成功",
        );
        if (result.filePath) {
          try {
            await showInFolder(result.filePath);
          } catch (error) {
            console.warn("打开导出目录失败:", error);
          }
        }
      }
      onClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      message.error(`EPUB 导出失败：${msg}`);
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
    "disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed",
  );

  const secondaryButtonClass = classNames(
    "px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
    "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300",
    "hover:bg-gray-200 dark:hover:bg-gray-700",
    "border border-gray-200 dark:border-gray-700",
  );

  const inputClass = classNames(
    "w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-all",
    "bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700",
    "text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500",
    "focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20",
  );

  const renderRewriteStep = () => (
    <div className="flex h-[560px] flex-col gap-4">
      {/* 风格选择卡片 */}
      <div className="shrink-0">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">
            选择写作风格
          </span>
          {isRewriting ? (
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
              onClick={stopRewrite}
            >
              取消生成
            </button>
          ) : (
            <button
              type="button"
              className={classNames(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                themeColors.buttonBg,
                themeColors.buttonTextClass,
              )}
              onClick={handleStartRewrite}
            >
              {rewriteActionLabel}
            </button>
          )}
        </div>
        <div className="grid grid-cols-4 gap-2.5">
          {STYLE_OPTIONS.map((option) => {
            const isSelected = selectedStyle === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={isRewriting}
                onClick={() => setSelectedStyle(option.value)}
                className={classNames(
                  "group relative flex flex-col items-start rounded-xl border p-3 text-left transition-all",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                  isSelected
                    ? "border-indigo-400 bg-indigo-50/80 ring-2 ring-indigo-500/25 dark:border-indigo-500 dark:bg-indigo-500/10 dark:ring-indigo-500/20"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/80 dark:border-slate-700 dark:bg-slate-900/50 dark:hover:border-slate-600 dark:hover:bg-slate-800/50",
                )}
              >
                <span className="mb-1 text-base leading-none">
                  {option.icon}
                </span>
                <span
                  className={classNames(
                    "text-xs font-semibold",
                    isSelected
                      ? "text-indigo-700 dark:text-indigo-300"
                      : "text-gray-700 dark:text-slate-200",
                  )}
                >
                  {option.label}
                </span>
                <span
                  className={classNames(
                    "mt-0.5 text-[11px] leading-tight",
                    isSelected
                      ? "text-indigo-500/80 dark:text-indigo-400/70"
                      : "text-gray-400 dark:text-slate-500",
                  )}
                >
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 编辑器区域 */}
      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-950/50">
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
                ? "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
                : "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
            )}
          >
            {isRewriting ? "只读" : "可编辑"}
          </span>
        </div>
        <div className="relative min-h-0 flex-1 overflow-auto p-3">
          <Editor
            ref={editorRef}
            key={`video-note-ebook-${videoNoteId}-${editorSessionId}`}
            initValue={draftContent}
            onChange={handleEditorChange}
            readonly={isRewriting}
            features={{ disableHeaderCollapse: true }}
          />
        </div>
      </div>
    </div>
  );

  const renderExportSettingsStep = () => (
    <div className="flex h-[560px] flex-col gap-5 overflow-y-auto pr-1">
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
            onChange={(event) => onFieldChange("title", event.target.value)}
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
              onChange={(event) => onFieldChange("author", event.target.value)}
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
              onChange={(event) =>
                onFieldChange("language", event.target.value)
              }
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
            onChange={(event) =>
              onFieldChange("description", event.target.value)
            }
            className={classNames(inputClass, "resize-y")}
          />
        </div>
      </div>

      {/* 封面图 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-600 dark:text-slate-300">
            封面图（可选）
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleChooseCoverFromFile}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              选择本地图片
            </button>
            {normalizeText(metadata.coverImageSrc) && (
              <button
                type="button"
                onClick={handleClearCover}
                className="rounded-lg px-2.5 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                清除
              </button>
            )}
          </div>
        </div>

        {selectedCoverPreview ? (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-950">
            <img
              src={selectedCoverPreview}
              alt="封面预览"
              className="h-40 w-full object-cover"
            />
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-4 py-8 dark:border-slate-700 dark:bg-slate-950/50">
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
              {coverCandidates.map((candidate) => {
                const isSelected = metadata.coverImageSrc === candidate.dataUri;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => handleSelectCoverCandidate(candidate)}
                    className={classNames(
                      "overflow-hidden rounded-lg border-2 transition-all",
                      isSelected
                        ? "border-indigo-500 ring-2 ring-indigo-500/25"
                        : "border-transparent hover:border-gray-300 dark:hover:border-slate-600",
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
  );

  const renderFooter = () => {
    if (step === "rewrite") {
      return (
        <div className="flex items-center justify-between">
          <StepIndicator currentStep={step} />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              className={secondaryButtonClass}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleGoToExportSettings}
              disabled={!hasDraft || isRewriting}
              className={classNames(
                primaryButtonClass,
                "flex items-center gap-1.5",
              )}
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
            className={classNames(
              secondaryButtonClass,
              "flex items-center gap-1.5",
            )}
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
            disabled={exporting}
            className={classNames(
              primaryButtonClass,
              "flex items-center gap-2",
            )}
          >
            {exporting && (
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeOpacity="0.35"
                />
                <path
                  d="M12 3a9 9 0 0 1 9 9"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeOpacity="0.85"
                />
              </svg>
            )}
            导出 EPUB
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
      bodyClassName="px-5 pb-1"
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
        >
          {step === "rewrite" && renderRewriteStep()}
          {step === "export-settings" && renderExportSettingsStep()}
        </motion.div>
      </AnimatePresence>
    </CustomModal>
  );
};

export default VideoNoteEpubExportModal;

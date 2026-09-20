import { useEffect, useMemo, useState } from "react";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import type { Descendant } from "slate";
import { BookOpen } from "lucide-react";
import { Button, Dialog, Input, Textarea, toast } from "@tau/ui";
import { readBinaryFile, selectFile, showInFolder } from "@/commands";
import type { EpubMetadataInput } from "@/types";
import { resolveLocalMediaPath } from "@/utils/localMediaPath";
import { remoteResourceToLocal } from "@/utils/resouce";
import {
  EpubRememberedMetadata,
  buildDefaultEpubMetadata,
  extractImageSources,
  exportSlateToEpubWithDialog,
} from "@/utils/epub-export";

interface EpubExportModalProps {
  open: boolean;
  onClose: () => void;
  content: Descendant[];
  title?: string;
}

const STORAGE_KEY = "epub-export-metadata-remembered";

/** 表单字段标签，口径与 ui/patterns 的 FormField 一致 */
const FIELD_LABEL = "text-ink-1 text-tau-meta font-medium";

const normalizeText = (value?: string) => (value || "").trim();
const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

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

interface CoverCandidate {
  id: string;
  source: string;
  dataUri: string;
  label: string;
}

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

const EpubExportModal = (props: EpubExportModalProps) => {
  const { open, onClose, content, title } = props;
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

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    const defaultMetadata = buildDefaultEpubMetadata({
      content,
      title,
      remembered,
    });
    setMetadata(defaultMetadata);
    setCoverCandidates([]);
    setLoadingCoverCandidates(true);

    const loadCoverCandidates = async () => {
      const rawSources = [
        normalizeText(defaultMetadata.coverImageSrc),
        ...extractImageSources(content, 12),
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

      if (cancelled) {
        return;
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
    };

    loadCoverCandidates().catch(error => {
      if (cancelled) {
        return;
      }
      const msg = error instanceof Error ? error.message : String(error);
      console.error("加载封面候选图失败:", msg);
      setLoadingCoverCandidates(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, content, title, remembered]);

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
      toast.success("封面图已更新");
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

  const handleConfirm = useMemoizedFn(async () => {
    const normalizedMetadata: EpubMetadataInput = {
      title: normalizeText(metadata.title),
      author: normalizeText(metadata.author),
      language: normalizeText(metadata.language) || "zh-CN",
      description: normalizeText(metadata.description),
      coverImageSrc: normalizeText(metadata.coverImageSrc) || undefined,
    };

    if (!normalizedMetadata.title) {
      toast.warning("书名不能为空");
      return;
    }
    if (!normalizedMetadata.author) {
      toast.warning("作者不能为空");
      return;
    }
    if (!normalizedMetadata.language) {
      toast.warning("语言不能为空");
      return;
    }

    setExporting(true);
    try {
      const result = await exportSlateToEpubWithDialog({
        content,
        metadata: normalizedMetadata,
        defaultFileName: normalizedMetadata.title,
      });

      setRemembered({
        author: normalizedMetadata.author,
        language: normalizedMetadata.language,
      });

      if (result.canceled) {
        toast.info("已取消 EPUB 导出");
      } else {
        toast.success(
          result.filePath ? `EPUB 导出成功，已保存到：${result.filePath}` : "EPUB 导出成功"
        );
        if (result.filePath) {
          try {
            await showInFolder(result.filePath);
          } catch (error) {
            console.warn("打开导出目录失败:", error);
          }
        }
        if (result.warnings.length > 0) {
          toast.warning(`导出完成，但有 ${result.warnings.length} 条警告`);
          console.warn("EPUB 导出警告:", result.warnings);
        }
      }
      onClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`EPUB 导出失败：${msg}`);
    } finally {
      setExporting(false);
    }
  });

  return (
    <Dialog
      title="导出 EPUB"
      icon={<BookOpen />}
      subtitle="填写电子书元数据后导出，图片会内嵌，音视频会转换为占位链接。"
      open={open}
      onOpenChange={next => {
        if (!next) onClose();
      }}
      width={620}
      locked={exporting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={exporting}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            loading={exporting}
            loadingText="导出中..."
          >
            导出
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <label className={FIELD_LABEL}>书名</label>
          <Input
            type="text"
            value={metadata.title}
            placeholder="请输入书名"
            onChange={event => onFieldChange("title", event.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className={FIELD_LABEL}>作者</label>
            <Input
              type="text"
              value={metadata.author}
              placeholder="请输入作者"
              onChange={event => onFieldChange("author", event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={FIELD_LABEL}>语言</label>
            <Input
              type="text"
              value={metadata.language}
              placeholder="例如 zh-CN / en"
              onChange={event => onFieldChange("language", event.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={FIELD_LABEL}>简介</label>
          <Textarea
            value={metadata.description}
            rows={3}
            placeholder="可选，建议一句话简介"
            onChange={event => onFieldChange("description", event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className={FIELD_LABEL}>封面图（可选）</label>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={handleChooseCoverFromFile}>
                选择本地图片
              </Button>
              <Button size="sm" variant="ghost" onClick={handleClearCover}>
                清除封面
              </Button>
            </div>
          </div>

          {selectedCoverPreview ? (
            <div className="border-line-1 bg-surface rounded-tau-md border p-3">
              <img
                src={selectedCoverPreview}
                alt="封面预览"
                className="rounded-tau-sm h-44 w-full object-cover"
              />
            </div>
          ) : (
            <div className="border-line-2 text-ink-3 rounded-tau-md text-tau-sm border border-dashed px-4 py-6 text-center">
              未选择封面图
            </div>
          )}

          <div className="text-ink-3 text-tau-sm">
            自动提取正文图片作为候选，导出时会以内嵌图片写入 EPUB。
          </div>

          {loadingCoverCandidates ? (
            <div className="text-ink-3 text-tau-sm">正在提取正文图片...</div>
          ) : coverCandidates.length > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {coverCandidates.map(candidate => {
                const selected = metadata.coverImageSrc === candidate.dataUri;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => handleSelectCoverCandidate(candidate)}
                    className={`rounded-tau-md ease-tau-out border-[1.5px] p-1 text-left transition-colors ${
                      selected
                        ? "border-accent shadow-[0_0_0_2px_var(--tau-accent-soft)]"
                        : "border-line-1 hover:border-ink-3/50"
                    }`}
                  >
                    <img
                      src={candidate.dataUri}
                      alt={candidate.label}
                      className="rounded-tau-sm h-20 w-full object-cover"
                    />
                    <div className="text-ink-2 truncate px-1 pt-1 text-[11px]">
                      {candidate.label}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-ink-3 text-tau-sm">未从正文中提取到可用图片</div>
          )}
        </div>
      </div>
    </Dialog>
  );
};

export default EpubExportModal;

import { useEffect, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { v4 as getUuid } from "uuid";
import { ImageIcon, Plus, Sparkles, WandSparkles, X } from "lucide-react";
import { Button, Dialog, DialogBody, ImagePreview, Spinner, Textarea, cn, toast } from "@tau/ui";

import { showMediaNode } from "./mediaModalHost";
import type { CustomElement } from "@tau/editor";
import { type MediaAction, type MediaInsertSource } from "@tau/editor/extensions/media/services";
import LocalImage from "@/components/LocalImage";
import { generateImageResources } from "@/services/image-generation";
import { useImageCapabilities } from "@/services/image-capabilities";
import { aiNotifyText } from "@/services/notifications/ai.i18n";
import { notifyAiTask } from "@/services/notifications/aiNotify";
import { uploadResource as uploadResourceCommand } from "@/hooks/useUploadResource";
import { aiImageT, useAIImageI18n } from "./ai-image.i18n";

/**
 * AI 生图/修图弹窗（desktop）：
 * generate 模式作为图片插入来源，edit 模式作为已有图片的业务操作。
 * 依赖宿主的图片生成配置与资源上传，整体属于业务能力，不进入编辑器内核。
 */

type AIAction = "generate" | "edit";

type PendingAIImage = {
  id: string;
  url: string;
  prompt: string;
  /** 展示类别与创建时固定的序号，渲染时投影为「结果 N」「参考 N」 */
  kind: "result" | "reference";
  index: number;
  fileName?: string;
  mimeType?: string;
};

type AIReferenceItem =
  | { id: string; kind: "empty" | "original"; url?: string }
  | { id: string; kind: "result" | "reference"; index: number; url?: string };

const isImageGenerationConfigured = () => useImageCapabilities.getState().canGenerate;
const isImageEditingConfigured = () => useImageCapabilities.getState().canEdit;

export interface AIImageDialogProps {
  open: boolean;
  onClose: () => void;
  mode: AIAction;
  /** edit 模式下的原始图地址 */
  originalUrl?: string;
  /** 确认结果：generate 插入 / edit 替换 */
  onConfirm: (url: string) => void;
}

export const AIImageDialog = ({
  open,
  onClose,
  mode,
  originalUrl,
  onConfirm,
}: AIImageDialogProps) => {
  const capabilities = useImageCapabilities();
  const { t } = useAIImageI18n();
  const taskRef = useRef<AbortController | null>(null);
  useEffect(() => {
    setAiSubmitting(false);
    return () => {
      taskRef.current?.abort();
    };
  }, [open, mode, originalUrl]);
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [aiSubmitting, setAiSubmitting] = useState(false);
  const [generatedCandidates, setGeneratedCandidates] = useState<PendingAIImage[]>([]);
  const [editReferenceCandidates, setEditReferenceCandidates] = useState<PendingAIImage[]>([]);
  const [editedCandidates, setEditedCandidates] = useState<PendingAIImage[]>([]);
  const [selectedGenerateReference, setSelectedGenerateReference] = useState("empty");
  const [selectedEditReferenceIds, setSelectedEditReferenceIds] = useState(["original"]);
  const [selectedEditResultId, setSelectedEditResultId] = useState<string | null>(null);
  const [previewingReference, setPreviewingReference] = useState<AIReferenceItem | null>(null);

  const referenceLabel = (item: AIReferenceItem) =>
    item.kind === "result"
      ? t("candidate.result", { index: item.index })
      : item.kind === "reference"
        ? t("candidate.reference", { index: item.index })
        : item.kind === "original"
          ? t("candidate.original")
          : t("candidate.none");

  const getAIReferenceItems = (action: AIAction): AIReferenceItem[] => {
    if (action === "generate") {
      return [
        { id: "empty", kind: "empty" },
        ...generatedCandidates.map(item => ({
          id: item.id,
          kind: item.kind,
          index: item.index,
          url: item.url,
        })),
      ];
    }

    return [
      {
        id: "original",
        kind: "original",
        url: originalUrl,
      },
      ...editReferenceCandidates.map(item => ({
        id: item.id,
        kind: item.kind,
        index: item.index,
        url: item.url,
      })),
    ];
  };

  const getSelectedReference = (action: AIAction) => {
    const items = getAIReferenceItems(action);
    if (action === "generate") {
      const selectedItem = items.find(item => item.id === selectedGenerateReference);
      return {
        ids: selectedItem ? [selectedItem.id] : [],
        items: selectedItem ? [selectedItem] : [],
      };
    }

    const selectedItems = items.filter(item => selectedEditReferenceIds.includes(item.id));
    return {
      ids: selectedItems.map(item => item.id),
      items: selectedItems,
    };
  };

  const getSelectedResult = (action: AIAction) => {
    const selectedId = action === "generate" ? selectedGenerateReference : selectedEditResultId;
    const candidates = action === "generate" ? generatedCandidates : editedCandidates;
    return selectedId ? (candidates.find(item => item.id === selectedId) ?? null) : null;
  };

  const handleRunAIImage = useMemoizedFn(async (action: AIAction) => {
    const isGenerate = action === "generate";
    const prompt = (isGenerate ? generatePrompt : editPrompt).trim();
    if (!prompt) {
      toast.warning(t("feedback.promptRequired"));
      return;
    }

    const selectedReference = getSelectedReference(action);
    const selectedReferenceUrls = selectedReference.items
      .map(item => item.url)
      .filter((item): item is string => Boolean(item));
    if (selectedReferenceUrls.length ? !capabilities.canEdit : !capabilities.canGenerate) {
      toast.warning(t("feedback.capabilityUnavailable"));
      return;
    }
    taskRef.current?.abort();
    const controller = new AbortController();
    taskRef.current = controller;
    setAiSubmitting(true);
    try {
      const [result] = await generateImageResources({
        prompt,
        imagePaths: selectedReferenceUrls,
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      if (!result) throw new Error(t("feedback.noResult"));
      const candidates = isGenerate ? generatedCandidates : editedCandidates;
      const pendingImage: PendingAIImage = {
        id: getUuid(),
        url: result.url,
        prompt,
        kind: "result",
        index: candidates.length + 1,
        fileName: result.fileName,
        mimeType: result.mimeType,
      };
      if (isGenerate) {
        setGeneratedCandidates(prev => [...prev, pendingImage]);
        setSelectedGenerateReference(pendingImage.id);
      } else {
        setEditedCandidates(prev => [...prev, pendingImage]);
        setSelectedEditResultId(pendingImage.id);
      }
      notifyAiTask({
        id: "ai-image-panel",
        mode: "unfocused-only",
        title: aiNotifyText(isGenerate ? "image.generateDoneTitle" : "image.editDoneTitle"),
        body: aiNotifyText("image.doneBody"),
        source: aiNotifyText("source.image"),
        icon: "sparkles",
        tone: "ok",
      });
    } catch (error) {
      if (controller.signal.aborted || (error as Error).name === "AbortError") return;
      console.error("AI 图片处理失败:", error);
      const message = (error as Error).message || t("feedback.processFailed");
      const notified = notifyAiTask({
        id: "ai-image-panel",
        mode: "unfocused-only",
        title: aiNotifyText("image.failedTitle"),
        body: message,
        source: aiNotifyText("source.image"),
        icon: "sparkles",
        tone: "danger",
        sticky: true,
      });
      if (!notified) toast.error(message);
    } finally {
      if (taskRef.current === controller && !controller.signal.aborted) setAiSubmitting(false);
    }
  });

  const handleConfirmAIImage = useMemoizedFn(() => {
    const selectedResult = getSelectedResult(mode);
    if (!selectedResult) {
      toast.warning(t("feedback.resultRequired"));
      return;
    }
    onConfirm(selectedResult.url);
    if (mode === "generate") {
      setGeneratePrompt("");
    } else {
      setEditPrompt("");
      setEditReferenceCandidates([]);
      setEditedCandidates([]);
      setSelectedEditReferenceIds(["original"]);
      setSelectedEditResultId(null);
    }
    toast.success(mode === "generate" ? t("feedback.inserted") : t("feedback.replaced"));
  });

  const handleUploadReference = useMemoizedFn(async (action: AIAction) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = action === "edit";
    input.onchange = async e => {
      const files = Array.from((e.target as HTMLInputElement).files ?? []);
      if (files.length === 0) return;
      try {
        const uploadedUrls = await Promise.all(files.map(file => uploadResourceCommand(file)));
        const validUrls = uploadedUrls.filter((item): item is string => Boolean(item));
        if (validUrls.length === 0) {
          return;
        }
        if (action === "generate") {
          const pendingRefs = validUrls.map((uploadedUrl, index) => ({
            id: getUuid(),
            url: uploadedUrl,
            prompt: "",
            kind: "reference" as const,
            index: generatedCandidates.length + index + 1,
          }));
          setGeneratedCandidates(prev => [...prev, ...pendingRefs]);
          setSelectedGenerateReference(pendingRefs[pendingRefs.length - 1]?.id ?? "empty");
        } else {
          setEditReferenceCandidates(prev => {
            const pendingRefs = validUrls.map((uploadedUrl, index) => ({
              id: getUuid(),
              url: uploadedUrl,
              prompt: "",
              kind: "reference" as const,
              index: prev.length + index + 1,
            }));
            setSelectedEditReferenceIds(current => [
              ...current,
              ...pendingRefs.map(item => item.id),
            ]);
            return [...prev, ...pendingRefs];
          });
        }
      } catch (error) {
        console.error("上传参考图失败:", error);
        toast.error(t("feedback.uploadFailed"));
      }
    };
    input.click();
  });

  const handleRemoveReference = useMemoizedFn((action: AIAction, id: string) => {
    const isGenerate = action === "generate";
    if (isGenerate) {
      setGeneratedCandidates(prev => prev.filter(item => item.id !== id));
      if (selectedGenerateReference === id) {
        setSelectedGenerateReference("empty");
      }
    } else {
      setEditReferenceCandidates(prev => prev.filter(item => item.id !== id));
      setSelectedEditReferenceIds(prev => {
        const nextIds = prev.filter(item => item !== id);
        return nextIds.length > 0 ? nextIds : ["original"];
      });
    }
  });

  const [previewIndex, setPreviewIndex] = useState(0);

  /** 缩略图：选中描边 accent，已选中再点放大 */
  const thumbClass = (selected: boolean) =>
    cn(
      "rounded-tau-sm relative size-14 cursor-pointer overflow-hidden border-2 p-0 transition-colors",
      selected ? "border-accent" : "border-line-1 hover:border-ink-3",
      "disabled:cursor-not-allowed disabled:opacity-70"
    );

  const renderAIReferencePicker = (action: AIAction) => {
    const isGenerate = action === "generate";
    const items = getAIReferenceItems(action);
    const selectedIds = isGenerate ? [selectedGenerateReference] : selectedEditReferenceIds;

    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-ink-2 text-[12px]">{t("candidate.section")}</span>
          {!isGenerate && (
            <span className="text-ink-3 text-[11.5px]">{t("candidate.multiSelectHint")}</span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => handleUploadReference(action)}
            disabled={aiSubmitting || !capabilities.canEdit}
          >
            <Plus className="size-3.5" strokeWidth={1.75} />
            {t("candidate.upload")}
          </Button>
        </div>
        <div className="flex gap-2 overflow-x-auto pt-1.5 pb-1">
          {items.map(item => {
            const selected = selectedIds.includes(item.id);
            const canRemove = item.kind === "result" && !aiSubmitting;
            return (
              <div key={item.id} className="relative shrink-0">
                <button
                  type="button"
                  className={thumbClass(selected)}
                  onClick={event => {
                    if (isGenerate) {
                      if (selected && item.url) {
                        setPreviewingReference(item);
                        return;
                      }
                      setSelectedGenerateReference(item.id);
                      return;
                    }

                    const isMultiSelect = event.ctrlKey || event.metaKey;
                    if (!isMultiSelect && selected && item.url) {
                      setPreviewingReference(item);
                      return;
                    }

                    if (!isMultiSelect) {
                      setSelectedEditReferenceIds([item.id]);
                      return;
                    }

                    setSelectedEditReferenceIds(prev => {
                      return prev.includes(item.id)
                        ? prev.filter(id => id !== item.id)
                        : [...prev, item.id];
                    });
                  }}
                  disabled={aiSubmitting}
                  title={selected && item.url ? t("candidate.enlarge") : referenceLabel(item)}
                >
                  {item.url ? (
                    <LocalImage
                      className="block h-full w-full object-cover"
                      url={item.url}
                      alt={referenceLabel(item)}
                    />
                  ) : (
                    <span className="bg-sunken text-ink-3 text-tau-tiny flex h-full w-full flex-col items-center justify-center gap-0.5">
                      <ImageIcon className="size-4" strokeWidth={1.5} />
                      {t("candidate.none")}
                    </span>
                  )}
                </button>
                {canRemove && (
                  <button
                    type="button"
                    className="bg-ink-2 text-ink-inverse hover:bg-danger absolute -top-1 -right-1 z-10 grid size-4 cursor-pointer place-items-center rounded-full transition-colors"
                    onClick={() => handleRemoveReference(action, item.id)}
                    title={t("candidate.remove")}
                    aria-label={t("candidate.remove")}
                  >
                    <X className="size-2.5" strokeWidth={2.5} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderAIResultPicker = () => {
    if (editedCandidates.length === 0) {
      return null;
    }

    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-ink-2 text-[12px]">{t("candidate.results")}</span>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {editedCandidates.map(item => {
            const selected = item.id === selectedEditResultId;
            const label = t("candidate.result", { index: item.index });
            return (
              <button
                key={item.id}
                type="button"
                className={cn(thumbClass(selected), "shrink-0")}
                onClick={() => {
                  if (selected) {
                    setPreviewingReference({
                      id: item.id,
                      kind: "result",
                      index: item.index,
                      url: item.url,
                    });
                    return;
                  }
                  setSelectedEditResultId(item.id);
                }}
                disabled={aiSubmitting}
                title={selected ? t("candidate.enlarge") : label}
              >
                <LocalImage
                  className="block h-full w-full object-cover"
                  url={item.url}
                  alt={label}
                />
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const isGenerate = mode === "generate";
  const prompt = isGenerate ? generatePrompt : editPrompt;
  const setPrompt = isGenerate ? setGeneratePrompt : setEditPrompt;
  const selectedResult = getSelectedResult(mode);
  const selectedReference = getSelectedReference(mode);
  const selectedReferenceCount = selectedReference.items.filter(item => Boolean(item.url)).length;
  const actionText = selectedReferenceCount
    ? t("action.fromReference")
    : isGenerate
      ? t("action.generate")
      : t("action.edit");

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onClose()}
      title={isGenerate ? t("dialog.title.generate") : t("dialog.title.edit")}
      subtitle={isGenerate ? t("dialog.subtitle.generate") : t("dialog.subtitle.edit")}
      icon={
        isGenerate ? (
          <Sparkles className="size-4" strokeWidth={1.75} />
        ) : (
          <WandSparkles className="size-4" strokeWidth={1.75} />
        )
      }
      width={isGenerate ? 600 : 540}
      locked={aiSubmitting}
      footer={
        <>
          <Button variant="secondary" size="sm" disabled={aiSubmitting} onClick={onClose}>
            {t("dialog.cancel")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={aiSubmitting}
            loadingText={t("dialog.running")}
            disabled={!prompt.trim()}
            onClick={() => handleRunAIImage(mode)}
          >
            {actionText}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!selectedResult || aiSubmitting}
            onClick={handleConfirmAIImage}
          >
            {isGenerate ? t("dialog.confirm.generate") : t("dialog.confirm.edit")}
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-3.5">
          {renderAIReferencePicker(mode)}
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-2 text-[12px]">
              {isGenerate ? t("prompt.label.generate") : t("prompt.label.edit")}
            </span>
            <Textarea
              data-autofocus
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
              placeholder={
                isGenerate ? t("prompt.placeholder.generate") : t("prompt.placeholder.edit")
              }
              disabled={aiSubmitting}
              rows={3}
              className="resize-none"
            />
          </label>
          {!isGenerate && renderAIResultPicker()}
          {(aiSubmitting || (isGenerate && selectedResult)) && (
            <div className="bg-sunken rounded-tau-md flex min-h-[160px] flex-col items-center justify-center gap-2 p-4">
              {aiSubmitting ? (
                <>
                  <Spinner className="size-5" />
                  <span className="text-tau-sm text-ink-3">{t("dialog.generating")}</span>
                </>
              ) : selectedResult ? (
                <>
                  <LocalImage
                    className="rounded-tau-sm max-h-[16em] max-w-full object-contain"
                    url={selectedResult.url}
                    alt={selectedResult.prompt}
                  />
                  <span className="text-tau-sm text-ink-3">
                    {isGenerate ? t("dialog.afterConfirm.generate") : t("dialog.afterConfirm.edit")}
                  </span>
                </>
              ) : null}
            </div>
          )}
        </div>
      </DialogBody>
      <ImagePreview
        open={!!previewingReference?.url}
        onOpenChange={next => !next && setPreviewingReference(null)}
        images={
          previewingReference?.url
            ? [{ src: previewingReference.url, alt: referenceLabel(previewingReference) }]
            : []
        }
        index={previewIndex}
        onIndexChange={setPreviewIndex}
        ImageComponent={({ src, alt, className }) => (
          <LocalImage url={src} alt={alt} className={className} />
        )}
      />
    </Dialog>
  );
};

export const aiImageInsertSource: MediaInsertSource = {
  id: "ai-image",
  get label() {
    return aiImageT("source.generate");
  },
  icon: Sparkles,
  mediaTypes: ["image"],
  isAvailable: isImageGenerationConfigured,
  open: ({ onInsert }) => {
    const close = showMediaNode(
      <AIImageDialog
        open
        mode="generate"
        onClose={() => close()}
        onConfirm={url => {
          onInsert({ src: url });
          close();
        }}
      />
    );
  },
};

const AIEditModal = ({
  element,
  open,
  onCancel,
  onApply,
}: {
  element: CustomElement;
  open: boolean;
  onCancel: () => void;
  onApply: (patch: Record<string, unknown>) => void;
}) => {
  const imageElement = element as { previewUrl?: string; url?: string };
  const originalUrl = imageElement.previewUrl || imageElement.url;

  useEffect(() => {
    if (open && !originalUrl) {
      toast.warning(aiImageT("feedback.imageRequired"));
      onCancel();
    }
  }, [open, originalUrl, onCancel]);

  return (
    <AIImageDialog
      open={open && !!originalUrl}
      mode="edit"
      originalUrl={originalUrl}
      onClose={onCancel}
      onConfirm={url => {
        // 同时写 url 与 previewUrl：url 参与序列化落盘，previewUrl 驱动当前渲染
        onApply({ url, previewUrl: url, pasteUploading: false });
        onCancel();
      }}
    />
  );
};

export const aiImageEditAction: MediaAction = {
  id: "ai-image-edit",
  get label() {
    return aiImageT("source.edit");
  },
  mediaTypes: ["image"],
  icon: <WandSparkles size={14} strokeWidth={1.75} />,
  isAvailable: isImageEditingConfigured,
  Modal: AIEditModal,
};

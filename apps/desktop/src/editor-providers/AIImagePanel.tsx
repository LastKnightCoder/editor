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
import { uploadResource as uploadResourceCommand } from "@/hooks/useUploadResource";

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
  label: string;
  fileName?: string;
  mimeType?: string;
};

type AIReferenceItem = {
  id: string;
  label: string;
  url?: string;
  kind: "empty" | "original" | "result";
};

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

  const getAIReferenceItems = (action: AIAction): AIReferenceItem[] => {
    if (action === "generate") {
      return [
        { id: "empty", label: "无参考", kind: "empty" },
        ...generatedCandidates.map(item => ({
          id: item.id,
          label: item.label,
          url: item.url,
          kind: "result" as const,
        })),
      ];
    }

    return [
      {
        id: "original",
        label: "原始图",
        url: originalUrl,
        kind: "original",
      },
      ...editReferenceCandidates.map(item => ({
        id: item.id,
        label: item.label,
        url: item.url,
        kind: "result" as const,
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
      toast.warning("请输入图片要求");
      return;
    }

    const selectedReference = getSelectedReference(action);
    const selectedReferenceUrls = selectedReference.items
      .map(item => item.url)
      .filter((item): item is string => Boolean(item));
    if (selectedReferenceUrls.length ? !capabilities.canEdit : !capabilities.canGenerate) {
      toast.warning("当前图片插件未就绪或不支持该操作");
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
      if (!result) throw new Error("图片生成服务未返回图片");
      const candidates = isGenerate ? generatedCandidates : editedCandidates;
      const pendingImage: PendingAIImage = {
        id: getUuid(),
        url: result.url,
        prompt,
        label: `结果 ${candidates.length + 1}`,
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
    } catch (error) {
      if (controller.signal.aborted || (error as Error).name === "AbortError") return;
      console.error("AI 图片处理失败:", error);
      toast.error((error as Error).message || "AI 图片处理失败");
    } finally {
      if (taskRef.current === controller && !controller.signal.aborted) setAiSubmitting(false);
    }
  });

  const handleConfirmAIImage = useMemoizedFn(() => {
    const selectedResult = getSelectedResult(mode);
    if (!selectedResult) {
      toast.warning("请先生成一张候选图片");
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
    toast.success(mode === "generate" ? "图片已插入" : "图片已替换");
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
            label: `参考 ${generatedCandidates.length + index + 1}`,
          }));
          setGeneratedCandidates(prev => [...prev, ...pendingRefs]);
          setSelectedGenerateReference(pendingRefs[pendingRefs.length - 1]?.id ?? "empty");
        } else {
          setEditReferenceCandidates(prev => {
            const pendingRefs = validUrls.map((uploadedUrl, index) => ({
              id: getUuid(),
              url: uploadedUrl,
              prompt: "",
              label: `参考 ${prev.length + index + 1}`,
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
        toast.error("参考图上传失败");
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
          <span className="text-ink-2 text-[12px]">参考图</span>
          {!isGenerate && (
            <span className="text-ink-3 text-[11.5px]">⌘/Ctrl + 点击多选，点已选中的图放大</span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => handleUploadReference(action)}
            disabled={aiSubmitting || !capabilities.canEdit}
          >
            <Plus className="size-3.5" strokeWidth={1.75} />
            上传参考图
          </Button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 pt-1.5">
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
                  title={selected && item.url ? "点击放大查看" : item.label}
                >
                  {item.url ? (
                    <LocalImage
                      className="block h-full w-full object-cover"
                      url={item.url}
                      alt={item.label}
                    />
                  ) : (
                    <span className="bg-sunken text-ink-3 text-tau-tiny flex h-full w-full flex-col items-center justify-center gap-0.5">
                      <ImageIcon className="size-4" strokeWidth={1.5} />
                      无参考
                    </span>
                  )}
                </button>
                {canRemove && (
                  <button
                    type="button"
                    className="bg-ink-2 text-ink-inverse hover:bg-danger absolute -right-1 -top-1 z-10 grid size-4 cursor-pointer place-items-center rounded-full transition-colors"
                    onClick={() => handleRemoveReference(action, item.id)}
                    title="移除"
                    aria-label="移除"
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
        <span className="text-ink-2 text-[12px]">候选结果</span>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {editedCandidates.map(item => {
            const selected = item.id === selectedEditResultId;
            return (
              <button
                key={item.id}
                type="button"
                className={cn(thumbClass(selected), "shrink-0")}
                onClick={() => {
                  if (selected) {
                    setPreviewingReference({
                      id: item.id,
                      label: item.label,
                      url: item.url,
                      kind: "result",
                    });
                    return;
                  }
                  setSelectedEditResultId(item.id);
                }}
                disabled={aiSubmitting}
                title={selected ? "点击放大查看" : item.label}
              >
                <LocalImage
                  className="block h-full w-full object-cover"
                  url={item.url}
                  alt={item.label}
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
  const actionText = selectedReferenceCount > 0 ? "基于参考图生成" : isGenerate ? "生成" : "编辑";

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onClose()}
      title={isGenerate ? "AI 生成图片" : "AI 编辑图片"}
      subtitle={isGenerate ? "描述想要的画面，可选参考图" : "描述想如何调整这张图片"}
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
            取消
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={aiSubmitting}
            loadingText="生成中…"
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
            {isGenerate ? "确认插入" : "确认替换"}
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-3.5">
          {renderAIReferencePicker(mode)}
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-2 text-[12px]">{isGenerate ? "画面描述" : "修改要求"}</span>
            <Textarea
              data-autofocus
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
              placeholder={
                isGenerate
                  ? "例如：一张白底的产品示意图，温暖手绘风格"
                  : "例如：改成透明背景，并增强主体光影"
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
                  <span className="text-tau-sm text-ink-3">正在生成…</span>
                </>
              ) : selectedResult ? (
                <>
                  <LocalImage
                    className="rounded-tau-sm max-h-[16em] max-w-full object-contain"
                    url={selectedResult.url}
                    alt={selectedResult.prompt}
                  />
                  <span className="text-tau-sm text-ink-3">
                    确认后{isGenerate ? "插入" : "替换"}到文档
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
            ? [{ src: previewingReference.url, alt: previewingReference.label }]
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
  label: "AI 生成",
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
      toast.warning("请先插入一张图片后再编辑");
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
  label: "AI 编辑图片",
  mediaTypes: ["image"],
  icon: <WandSparkles size={14} strokeWidth={1.75} />,
  isAvailable: isImageEditingConfigured,
  Modal: AIEditModal,
};

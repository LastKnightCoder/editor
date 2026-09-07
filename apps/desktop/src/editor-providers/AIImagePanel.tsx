import React, { useEffect, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { App, message } from "antd";
import classnames from "classnames";
import { LoadingOutlined, PictureOutlined } from "@ant-design/icons";
import { v4 as getUuid } from "uuid";
import { Sparkles } from "lucide-react";
import { PortalToBody } from "@tau/shared";

import CustomModal from "@/components/CustomModal";
import { showMediaModal } from "./mediaModalHost";
import type { CustomElement, MediaAction, MediaInsertSource } from "@tau/editor/src";
import { useEditorSlots } from "@tau/editor/src";
import {
  createImageFileFromBase64,
  resolveImageInputFile,
  isProviderConfigValid,
  getActiveImageGenerationConfig,
  createProviderFromConfig,
} from "@/utils/image-generation";
import type { ImageResult } from "@/types/imageGeneration";
import { uploadResource as uploadResourceCommand } from "@/hooks/useUploadResource";

/**
 * AI 生图/修图面板（desktop）：
 * generate 模式作为图片插入来源（空态 Tab），edit 模式作为已有图片的业务操作（Modal）。
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

const isImageGenerationConfigured = () => {
  const config = getActiveImageGenerationConfig();
  return Boolean(config && isProviderConfigValid(config));
};

const uploadGeneratedImageResult = async (result: ImageResult, index = 0) => {
  const file = result.b64Json
    ? createImageFileFromBase64(
        result.b64Json,
        result.mimeType ?? "image/png",
        `editor-ai-image-${index + 1}`
      )
    : result.url
      ? await resolveImageInputFile(result.url)
      : null;

  if (!file) {
    throw new Error("图片生成服务未返回可用图片");
  }

  const url = await uploadResourceCommand(file);
  if (!url) {
    throw new Error("图片已生成，但上传资源失败");
  }

  return {
    url,
    fileName: file.name,
    mimeType: file.type,
    revisedPrompt: result.revisedPrompt,
  };
};

const runImageGeneration = async (prompt: string, images: string[]) => {
  const config = getActiveImageGenerationConfig();
  if (!config || !isProviderConfigValid(config)) {
    throw new Error("图片生成配置无效，请先在设置中填写模型地址、API Key 和模型名称");
  }
  const provider = createProviderFromConfig(config);
  const normalizedImages = images.map(item => item.trim()).filter(Boolean);
  if (normalizedImages.length > 0) {
    const imageFiles = await Promise.all(normalizedImages.map(item => resolveImageInputFile(item)));
    const results = await provider.edit({ config, prompt, imageFiles });
    return uploadGeneratedImageResult(results[0], 0);
  }
  const results = await provider.generate({ config, prompt });
  return uploadGeneratedImageResult(results[0], 0);
};

export interface AIImagePanelProps {
  mode: AIAction;
  /** edit 模式下的原始图地址 */
  originalUrl?: string;
  /** 确认结果：generate 插入 / edit 替换 */
  onConfirm: (url: string) => void;
}

export const AIImagePanel = ({ mode, originalUrl, onConfirm }: AIImagePanelProps) => {
  const { Image: LocalImageComponent } = useEditorSlots();
  const { message: messageApi } = App.useApp();

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
      messageApi.warning("请输入图片要求");
      return;
    }

    const selectedReference = getSelectedReference(action);
    const selectedReferenceUrls = selectedReference.items
      .map(item => item.url)
      .filter((item): item is string => Boolean(item));
    setAiSubmitting(true);
    try {
      const result = await runImageGeneration(prompt, selectedReferenceUrls);
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
      console.error("AI 图片处理失败:", error);
      messageApi.error((error as Error).message || "AI 图片处理失败");
    } finally {
      setAiSubmitting(false);
    }
  });

  const handleConfirmAIImage = useMemoizedFn(() => {
    const selectedResult = getSelectedResult(mode);
    if (!selectedResult) {
      messageApi.warning("请先生成一张候选图片");
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
    messageApi.success(mode === "generate" ? "图片已插入" : "图片已替换");
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
        message.error("参考图上传失败");
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

  const renderAIReferencePicker = (action: AIAction) => {
    const isGenerate = action === "generate";
    const items = getAIReferenceItems(action);
    const selectedIds = isGenerate ? [selectedGenerateReference] : selectedEditReferenceIds;

    return (
      <div className="flex flex-col gap-[0.5em]">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-[0.125em]">
            <span className="text-[0.75em] font-medium text-gray-500 dark:text-zinc-400">
              参考图
            </span>
            {!isGenerate && (
              <span className="text-[0.6875em] text-gray-400 dark:text-zinc-500">
                Ctrl/Command + 点击可多选或取消，普通点击单选，点击已选中图片可放大
              </span>
            )}
          </div>
          <button
            type="button"
            className="flex cursor-pointer items-center gap-[0.25em] border-none bg-transparent text-[0.6875em] text-gray-500 transition-colors duration-150 hover:text-gray-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            onClick={() => handleUploadReference(action)}
            disabled={aiSubmitting}
          >
            <span className="text-[1.1em]">+</span>
            上传参考图
          </button>
        </div>
        <div className="flex gap-[0.5em] overflow-x-auto pb-[0.25em]">
          {items.map(item => {
            const selected = selectedIds.includes(item.id);
            const canRemove = item.kind === "result" && !aiSubmitting;
            return (
              <div key={item.id} className="relative shrink-0">
                <button
                  type="button"
                  className={classnames(
                    "relative h-[3.5em] w-[3.5em] cursor-pointer overflow-hidden rounded-[0.5em] border-[0.125em] p-0 transition-all duration-150",
                    selected
                      ? "border-[var(--th-btn-bg)]"
                      : "border-gray-200 hover:border-gray-400 dark:border-zinc-700 dark:hover:border-zinc-500",
                    "disabled:cursor-not-allowed disabled:opacity-70"
                  )}
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
                    <LocalImageComponent
                      className="block h-full w-full object-cover"
                      url={item.url}
                      alt={item.label}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gray-50 text-[0.875em] text-gray-400 dark:bg-zinc-900 dark:text-zinc-500">
                      <PictureOutlined />
                    </div>
                  )}
                </button>
                {canRemove && (
                  <button
                    type="button"
                    className="absolute -right-[0.25em] -top-[0.25em] z-10 flex h-[1.125em] w-[1.125em] cursor-pointer items-center justify-center rounded-full border-none bg-gray-600 text-[0.625em] leading-none text-white transition-colors duration-150 hover:bg-red-500 dark:bg-zinc-600"
                    onClick={() => handleRemoveReference(action, item.id)}
                    title="移除"
                  >
                    ×
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
      <div className="flex flex-col gap-[0.5em]">
        <span className="text-[0.75em] font-medium text-gray-500 dark:text-zinc-400">候选结果</span>
        <div className="flex gap-[0.5em] overflow-x-auto pb-[0.25em]">
          {editedCandidates.map(item => {
            const selected = item.id === selectedEditResultId;
            return (
              <div key={item.id} className="relative shrink-0">
                <button
                  type="button"
                  className={classnames(
                    "relative h-[3.5em] w-[3.5em] cursor-pointer overflow-hidden rounded-[0.5em] border-[0.125em] p-0 transition-all duration-150",
                    selected
                      ? "border-[var(--th-btn-bg)]"
                      : "border-gray-200 hover:border-gray-400 dark:border-zinc-700 dark:hover:border-zinc-500",
                    "disabled:cursor-not-allowed disabled:opacity-70"
                  )}
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
                  <LocalImageComponent
                    className="block h-full w-full object-cover"
                    url={item.url}
                    alt={item.label}
                  />
                </button>
              </div>
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
    <div className="flex flex-col gap-[0.875em]">
      {renderAIReferencePicker(mode)}
      <textarea
        className="min-h-[7.5em] w-full resize-y rounded-[0.75em] border border-gray-200 bg-gray-50 px-[1em] py-[0.875em] text-[0.875em] leading-[1.6] text-gray-800 shadow-inner outline-none transition-all duration-200 placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_var(--th-border-focus)/20] disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-zinc-500 dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_var(--th-border-focus)/25]"
        value={prompt}
        onChange={event => setPrompt(event.target.value)}
        placeholder={
          isGenerate
            ? "描述你想生成的图片，例如：一张白底的产品示意图，温暖手绘风格"
            : "描述你想如何调整这张图片，例如：改成透明背景，并增强主体光影"
        }
        disabled={aiSubmitting}
        rows={3}
      />
      {!isGenerate && renderAIResultPicker()}
      {(aiSubmitting || (isGenerate && selectedResult)) && (
        <div className="flex flex-col items-center gap-[0.5em] rounded-[0.75em] border border-gray-200 p-[1em] dark:border-zinc-700">
          {aiSubmitting ? (
            <div className="text-text-3 flex items-center gap-[0.5em] text-[0.8125em]">
              <LoadingOutlined />
              <span>正在生成...</span>
            </div>
          ) : selectedResult ? (
            <>
              <LocalImageComponent
                className="max-h-[16em] max-w-full rounded-[0.5em] object-contain"
                url={selectedResult.url}
                alt={selectedResult.prompt}
              />
              <div className="text-text-3 text-[0.75em]">确认后{isGenerate ? "插入" : "替换"}</div>
            </>
          ) : null}
        </div>
      )}
      <div className="flex items-center justify-end gap-[0.5em] border-t border-gray-200 pt-[0.5em] dark:border-zinc-700/50">
        <button
          type="button"
          className="cursor-pointer rounded-[0.75em] border border-gray-200 bg-gray-100 px-[1.25em] py-[0.625em] text-[0.875em] font-semibold text-gray-700 transition-all hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          disabled={!prompt.trim() || aiSubmitting}
          onClick={() => handleRunAIImage(mode)}
        >
          {aiSubmitting ? "处理中..." : actionText}
        </button>
        <button
          type="button"
          className="cursor-pointer rounded-[0.75em] border-none bg-[var(--th-btn-bg)] px-[1.25em] py-[0.625em] text-[0.875em] font-semibold text-[var(--th-btn-text)] transition-all hover:bg-[var(--th-btn-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!selectedResult || aiSubmitting}
          onClick={handleConfirmAIImage}
        >
          {isGenerate ? "确认插入" : "确认替换"}
        </button>
      </div>
      {previewingReference && (
        <PortalToBody>
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
            onClick={() => setPreviewingReference(null)}
          >
            <button
              type="button"
              className="cursor-pointer border-none bg-transparent p-0"
              onClick={() => setPreviewingReference(null)}
              aria-label="关闭预览"
            >
              <LocalImageComponent
                className="max-h-[85vh] max-w-[90vw] rounded-[0.5em] object-contain"
                url={previewingReference.url || ""}
                alt={previewingReference.label}
              />
            </button>
          </div>
        </PortalToBody>
      )}
    </div>
  );
};

export const aiImageInsertSource: MediaInsertSource = {
  id: "ai-image",
  label: "AI 生成",
  icon: Sparkles,
  mediaTypes: ["image"],
  isAvailable: isImageGenerationConfigured,
  open: ({ onInsert }) => {
    showMediaModal({
      title: "AI 生成图片",
      width: 640,
      content: close => (
        <AIImagePanel
          mode="generate"
          onConfirm={url => {
            onInsert({ src: url });
            close();
          }}
        />
      ),
    });
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
      message.warning("请先插入一张图片后再编辑");
      onCancel();
    }
  }, [open, originalUrl, onCancel]);

  return (
    <AIEditModalContainer open={open} title="AI 编辑图片" onCancel={onCancel} footer={null}>
      {open && originalUrl && (
        <AIImagePanel
          mode="edit"
          originalUrl={originalUrl}
          onConfirm={url => {
            // 同时写 url 与 previewUrl：url 参与序列化落盘，previewUrl 驱动当前渲染
            onApply({ url, previewUrl: url, pasteUploading: false });
            onCancel();
          }}
        />
      )}
    </AIEditModalContainer>
  );
};

function AIEditModalContainer(props: {
  open: boolean;
  title: string;
  onCancel: () => void;
  footer: null;
  children: React.ReactNode;
}) {
  return (
    <CustomModal
      open={props.open}
      title={props.title}
      onCancel={props.onCancel}
      footer={props.footer}
      width={520}
      destroyOnClose
    >
      {props.children}
    </CustomModal>
  );
}

export const aiImageEditAction: MediaAction = {
  id: "ai-image-edit",
  label: "AI 编辑图片",
  mediaTypes: ["image"],
  icon: <PictureOutlined size={14} />,
  isAvailable: isImageGenerationConfigured,
  Modal: AIEditModal,
};

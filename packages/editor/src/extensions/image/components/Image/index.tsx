import React, { forwardRef, useEffect, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { message, Button, Input, App } from "antd";
import { Transforms, Path } from "slate";
import {
  ReactEditor,
  RenderElementProps,
  useSlateStatic,
  useReadOnly,
} from "slate-react";
import {
  DeleteOutlined,
  FullscreenOutlined,
  ScissorOutlined,
  FileTextOutlined,
  LoadingOutlined,
  PictureOutlined,
  AlignCenterOutlined,
  AlignLeftOutlined,
  AlignRightOutlined,
} from "@ant-design/icons";
import { CustomModal, ModernTabs, EditText, PortalToBody } from "@tau/shared";
import type { EditTextHandle } from "@tau/shared";

import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import { useUploadResource } from "../../../../hooks/useUploadResource";
import { useImageGeneration } from "../../../../hooks/useImageGeneration";
import useIsLastElement from "../../../../hooks/useIsLastElement";
import { useDragHandlerMenu } from "../../../../hooks/useDragHandlerMenu";

import AddParagraph from "../../../../components/AddParagraph";
import { useImagesOverviewStore } from "../../../../stores";
import type { ImageElement } from "../../../types";
import EditorContextMenu from "../../../../components/EditorContextMenu";
import { imageActionsMap } from "../../index";
import { buildImageMenuItems } from "../../utils/menuItems";
import { getImageAppearanceStyle } from "../../utils/appearance";

import styles from "./index.module.less";
import classnames from "classnames";
import { MdDragIndicator } from "react-icons/md";
import ImageUploader from "../../../../components/ImageUploader";
import {
  useImageResize,
  ResizeDirection,
} from "../../../../hooks/useImageResize";

import { v4 as getUuid } from "uuid";

import type { IResource } from "../../../types";
import { LinkOutlined } from "@ant-design/icons";
import useTheme from "../../../../hooks/useTheme";
import useSettings from "../../../../hooks/useSettings";

import { ImageCropper } from "@tau/shared";
import type { CropperTransform } from "@tau/shared";

type ImageAIAction = "generate" | "edit";

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

interface IImageProps {
  attributes: RenderElementProps["attributes"];
  element: ImageElement;
}

type LocalImageProps = {
  url: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  onLoad?: () => void;
  onClick?: React.MouseEventHandler<HTMLImageElement>;
  crossOrigin?: "" | "anonymous" | "use-credentials";
};

const DefaultLocalImage = forwardRef<HTMLImageElement, LocalImageProps>(
  ({ url, alt, ...rest }, ref) => (
    <img ref={ref} src={url} alt={alt} {...rest} />
  ),
);
DefaultLocalImage.displayName = "DefaultLocalImage";

const Image: React.FC<React.PropsWithChildren<IImageProps>> = (props) => {
  const { attributes, children, element } = props;
  const {
    url,
    alt = "",
    pasteUploading = false,
    previewUrl,
    width,
    description,
    align = "center",
    borderRadius,
    shadow,
  } = element;

  const uploadResource = useUploadResource();
  const imageGeneration = useImageGeneration();
  const { isDark } = useTheme();
  const settings = useSettings();
  const { message: messageApi } = App.useApp();
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const LocalImageComponent =
    editor.services?.components?.Image ||
    (DefaultLocalImage as React.ForwardRefExoticComponent<
      LocalImageProps & React.RefAttributes<HTMLImageElement>
    >);
  const ResourcePickerModal = editor.services?.components?.ResourcePickerModal;

  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      element,
    });

  const [uploading, setUploading] = useState(false);
  const [resourcePickerOpen, setResourcePickerOpen] = useState(false);
  const [networkImageUrl, setNetworkImageUrl] = useState("");
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [aiAction, setAiAction] = useState<ImageAIAction>("generate");
  const [aiEditModalOpen, setAiEditModalOpen] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [aiSubmitting, setAiSubmitting] = useState(false);
  const [generatedCandidates, setGeneratedCandidates] = useState<
    PendingAIImage[]
  >([]);
  const [editedCandidates, setEditedCandidates] = useState<PendingAIImage[]>(
    [],
  );
  const [selectedGenerateReference, setSelectedGenerateReference] =
    useState("empty");
  const [selectedEditReference, setSelectedEditReference] =
    useState("original");
  const [previewingReference, setPreviewingReference] =
    useState<AIReferenceItem | null>(null);
  const uploadTabRef = useRef<HTMLDivElement>(null);

  const [isSelected, setIsSelected] = useState(false);
  const [showDescEditor, setShowDescEditor] = useState(false);
  const descRef = useRef<EditTextHandle | null>(null);
  const isLast = useIsLastElement(element);
  const [settingVersion, setSettingVersion] = useState(0);
  const imageGenerationAvailable = Boolean(
    settingVersion >= 0 && imageGeneration?.isAvailable?.(),
  );

  const { menuProps, dragHandlerProps } = useDragHandlerMenu({
    element,
    editor,
    buildMenuItems: (params) => buildImageMenuItems(params, messageApi),
  });

  const { showImageOverview } = useImagesOverviewStore((state) => ({
    showImageOverview: state.showImageOverview,
  }));

  const showOverView = useMemoizedFn(() => {
    showImageOverview(element, editor);
  });

  const showAIReferenceOverview = useMemoizedFn((item: AIReferenceItem) => {
    if (!item.url) {
      return;
    }
    setPreviewingReference(item);
  });

  const deleteImage = useMemoizedFn(() => {
    if (readOnly) {
      return;
    }
    const path = ReactEditor.findPath(editor, element);
    Transforms.delete(editor, {
      at: path,
    });
    Transforms.insertNodes(
      editor,
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "" }],
      },
      {
        at: path,
        select: true,
      },
    );
  });

  const setLink = useMemoizedFn((url: string) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        url,
      },
      {
        at: path,
      },
    );
  });

  const handleInsertFromResource = useMemoizedFn(
    async (selected: IResource[]) => {
      if (!selected.length) {
        setResourcePickerOpen(false);
        return;
      }
      const [first, ...rest] = selected;
      const firstUrl = first.path || first.url;
      if (!firstUrl) {
        message.warning("资源缺少可用的 URL");
        return;
      }
      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes(
        editor,
        {
          url: firstUrl,
          previewUrl: firstUrl,
          pasteUploading: false,
        },
        {
          at: path,
        },
      );

      let referencePath = path;
      rest.forEach((resource) => {
        const resourceUrl = resource.path || resource.url;
        if (!resourceUrl) {
          return;
        }
        referencePath = Path.next(referencePath);
        Transforms.insertNodes(
          editor,
          {
            type: "image",
            url: resourceUrl,
            uuid: getUuid(),
            children: [{ type: "formatted", text: "" }],
          },
          { at: referencePath },
        );
      });

      setResourcePickerOpen(false);
    },
  );

  const handleApplyNetworkUrl = useMemoizedFn(async () => {
    const value = networkImageUrl.trim();
    if (!value) {
      message.warning("请输入图片地址");
      return;
    }
    setLinkSubmitting(true);
    try {
      setLink(value);
      setNetworkImageUrl("");
    } finally {
      setLinkSubmitting(false);
    }
  });

  const openAIImagePanel = useMemoizedFn((action: ImageAIAction) => {
    if (!imageGenerationAvailable || !imageGeneration) {
      messageApi.warning(
        "图片生成配置不可用，请先在设置中填写模型地址、API Key 和模型名称",
      );
      return;
    }
    if (action === "edit" && !url) {
      messageApi.warning("请先插入一张图片后再编辑");
      return;
    }
    setAiAction(action);
    setAiEditModalOpen(true);
    setEditPrompt("");
    setEditedCandidates([]);
    setSelectedEditReference("original");
  });

  const getAIReferenceItems = (action: ImageAIAction): AIReferenceItem[] => {
    if (action === "generate") {
      return [
        { id: "empty", label: "无参考", kind: "empty" },
        ...generatedCandidates.map((item) => ({
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
        url: previewUrl || url,
        kind: "original",
      },
      ...editedCandidates.map((item) => ({
        id: item.id,
        label: item.label,
        url: item.url,
        kind: "result" as const,
      })),
    ];
  };

  const getSelectedReference = (action: ImageAIAction) => {
    const selectedId =
      action === "generate" ? selectedGenerateReference : selectedEditReference;
    return getAIReferenceItems(action).find((item) => item.id === selectedId);
  };

  const getSelectedResult = (action: ImageAIAction) => {
    const selectedId =
      action === "generate" ? selectedGenerateReference : selectedEditReference;
    const candidates =
      action === "generate" ? generatedCandidates : editedCandidates;
    return candidates.find((item) => item.id === selectedId) ?? null;
  };

  const handleRunAIImage = useMemoizedFn(
    async (action: ImageAIAction = aiAction) => {
      const isGenerate = action === "generate";
      const prompt = (isGenerate ? generatePrompt : editPrompt).trim();
      if (!prompt) {
        messageApi.warning("请输入图片要求");
        return;
      }
      if (!imageGeneration) {
        messageApi.warning("图片生成服务不可用");
        return;
      }

      const selectedReference = getSelectedReference(action);
      setAiSubmitting(true);
      try {
        setAiAction(action);
        const result = selectedReference?.url
          ? await imageGeneration.editImage({
              prompt,
              imageUrl: selectedReference.url,
            })
          : await imageGeneration.generateImage({ prompt });
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
          setGeneratedCandidates((prev) => [...prev, pendingImage]);
          setSelectedGenerateReference(pendingImage.id);
        } else {
          setEditedCandidates((prev) => [...prev, pendingImage]);
          setSelectedEditReference(pendingImage.id);
        }
      } catch (error) {
        console.error("AI 图片处理失败:", error);
        messageApi.error((error as Error).message || "AI 图片处理失败");
      } finally {
        setAiSubmitting(false);
      }
    },
  );

  const handleConfirmAIImage = useMemoizedFn(() => {
    const selectedResult = getSelectedResult(aiAction);
    if (!selectedResult) {
      messageApi.warning("请先生成一张候选图片");
      return;
    }
    setLink(selectedResult.url);
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        previewUrl: selectedResult.url,
        pasteUploading: false,
      },
      { at: path },
    );
    if (aiAction === "generate") {
      setGeneratePrompt("");
    } else {
      setAiEditModalOpen(false);
      setEditedCandidates([]);
      setSelectedEditReference("original");
      setEditPrompt("");
    }
    messageApi.success(aiAction === "generate" ? "图片已插入" : "图片已替换");
  });

  const handlePasteImage = useMemoizedFn(async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf("image") !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file && uploadResource) {
          setUploading(true);
          try {
            const uploadedUrl = await uploadResource(file);
            if (uploadedUrl) {
              setLink(uploadedUrl);
              message.success("图片上传成功");
            } else {
              message.error("图片上传失败");
            }
          } catch (error) {
            console.error("上传图片失败:", error);
            message.error("图片上传失败");
          } finally {
            setUploading(false);
          }
        } else if (!uploadResource) {
          message.warning("尚未配置任何图床，无法上传图片");
        }
        break;
      }
    }
  });

  const toggleAlign = () => {
    if (readOnly) return;
    const path = ReactEditor.findPath(editor, element);
    let newAlign: "left" | "center" | "right";

    // 循环切换：left -> center -> right -> left
    if (align === "left") {
      newAlign = "center";
    } else if (align === "center") {
      newAlign = "right";
    } else {
      newAlign = "left";
    }

    Transforms.setNodes(
      editor,
      {
        align: newAlign,
      },
      {
        at: path,
      },
    );
  };

  // ImageCropper state
  const [cropperOpen, setCropperOpen] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const displayImgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [maxWidth, setMaxWidth] = useState<number>(Infinity);

  // 从 img 元素获取 blob
  const getImageBlob = async (): Promise<Blob | null> => {
    try {
      const imgElement = displayImgRef.current || imgRef.current;
      if (!imgElement) return null;

      // 创建 canvas
      const canvas = document.createElement("canvas");
      canvas.width = imgElement.naturalWidth;
      canvas.height = imgElement.naturalHeight;

      // 绘制图片
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.drawImage(imgElement, 0, 0);

      // 转换为 blob
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          resolve(blob);
        }, "image/png");
      });
    } catch (error) {
      console.error("获取图片 blob 失败:", error);
      return null;
    }
  };

  // Register actions for menu access
  useEffect(() => {
    imageActionsMap.set(element, {
      showOverview: showOverView,
      deleteImage,
      startCrop: () => setCropperOpen(true),
      startAIEdit: () => openAIImagePanel("edit"),
      showDescEditor: () => setShowDescEditor(true),
      getImageBlob,
    });
    return () => {
      imageActionsMap.delete(element);
    };
  }, [element, showOverView, deleteImage, openAIImagePanel]);

  useEffect(() => {
    if (!settings.subscribe) {
      return;
    }

    return settings.subscribe(() => {
      setSettingVersion((prev) => prev + 1);
    });
  }, [settings]);

  useEffect(() => {
    if (!previewUrl && url) {
      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes(
        editor,
        {
          previewUrl: url,
        },
        {
          at: path,
        },
      );
    }
  }, [url, previewUrl, editor, element]);

  // 外部点击取消选中
  useEffect(() => {
    const handleDocMouseDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const target = e.target as Node;
      if (!containerRef.current.contains(target)) {
        setIsSelected(false);
      }
    };
    document.addEventListener("mousedown", handleDocMouseDown);
    return () => document.removeEventListener("mousedown", handleDocMouseDown);
  }, []);

  // 选中图片后，按 Delete/Backspace 删除图片
  useEffect(() => {
    const handleDocKeyDown = (e: KeyboardEvent) => {
      if (readOnly || !isSelected) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;

      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      setIsSelected(false);
      deleteImage();
    };

    document.addEventListener("keydown", handleDocKeyDown);
    return () => document.removeEventListener("keydown", handleDocKeyDown);
  }, [deleteImage, isSelected, readOnly]);

  // 监听本地上传 Tab 的粘贴事件
  useEffect(() => {
    const uploadTab = uploadTabRef.current;
    if (!uploadTab || readOnly || url) return;

    uploadTab.addEventListener("paste", handlePasteImage);
    return () => {
      uploadTab.removeEventListener("paste", handlePasteImage);
    };
  }, [handlePasteImage, readOnly, url]);

  // 计算编辑器可用最大宽度
  useEffect(() => {
    const editorEl = containerRef.current?.closest(
      '[data-slate-editor="true"]',
    ) as HTMLElement | null;
    if (editorEl) {
      setMaxWidth(editorEl.clientWidth);
    }
  }, []);

  const updateElementWidth = useMemoizedFn((newWidth?: number) => {
    if (typeof newWidth !== "number") return;
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { width: newWidth }, { at: path });
  });

  const updateDescription = useMemoizedFn((value: string) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { description: value }, { at: path });
  });

  const exitDescEditing = useMemoizedFn(() => {
    const val = descRef.current?.getValue() || "";
    if (!val.trim()) {
      updateDescription("");
      setShowDescEditor(false);
    } else {
      setShowDescEditor(false);
    }
  });

  // Handle crop confirm
  const handleCropConfirm = useMemoizedFn(
    async (transform: CropperTransform, blob: Blob) => {
      if (!uploadResource) {
        messageApi.warning("尚未配置任何图床,无法上传裁剪图片");
        setCropperOpen(false);
        return;
      }

      setUploading(true);
      try {
        const file = new File([blob], "cropped.jpg", { type: "image/jpeg" });
        const uploadRes = await uploadResource(file);

        if (uploadRes) {
          const path = ReactEditor.findPath(editor, element);
          Transforms.setNodes(
            editor,
            {
              cropTransform: transform,
              previewUrl: uploadRes,
            },
            { at: path },
          );
          messageApi.success("裁剪图片已保存");
        } else {
          messageApi.warning("裁剪图片上传失败");
        }
      } catch (error) {
        console.error("裁剪图片上传失败:", error);
        messageApi.error("裁剪图片上传失败");
      } finally {
        setUploading(false);
        setCropperOpen(false);
      }
    },
  );

  const handleDisplayImageLoad = useMemoizedFn(() => {
    if (displayImgRef.current) {
      const img = displayImgRef.current;
      const imgNaturalWidth = img.naturalWidth;
      const imgNaturalHeight = img.naturalHeight;
      setNaturalSize({ width: imgNaturalWidth, height: imgNaturalHeight });

      if (!width) {
        const editorEl = containerRef.current?.closest(
          '[data-slate-editor="true"]',
        ) as HTMLElement | null;
        const editorWidth = editorEl?.clientWidth || 0;
        const dpr = window.devicePixelRatio || 1;
        const initialWidth = Math.min(
          imgNaturalWidth / dpr,
          editorWidth || imgNaturalWidth,
        );
        updateElementWidth(initialWidth);
        resize.setSize({ width: initialWidth });
      }
    }
  });

  const resize = useImageResize({
    initialSize: { width },
    minWidth: 50,
    maxWidth,
    minHeight: 10,
    aspectRatio:
      naturalSize.width && naturalSize.height
        ? naturalSize.width / naturalSize.height
        : undefined,
    onResizeEnd: (size) => {
      if (size.width) {
        updateElementWidth(size.width);
      }
    },
    readonly: readOnly,
    keepAspectRatio: true,
  });

  const handleSelect = useMemoizedFn((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (readOnly) {
      // 只读下直接预览
      showOverView();
      return;
    }
    if (isSelected) {
      // 选中后再次点击进行预览
      showOverView();
    } else {
      setIsSelected(true);
    }
  });

  // 仅四角句柄，样式更明显
  const RESIZE_HANDLES: { direction: ResizeDirection; cursor: string }[] = [
    { direction: "nw", cursor: "nwse-resize" },
    { direction: "ne", cursor: "nesw-resize" },
    { direction: "se", cursor: "nwse-resize" },
    { direction: "sw", cursor: "nesw-resize" },
  ];

  const renderAIReferencePicker = (action: ImageAIAction) => {
    const isGenerate = action === "generate";
    const items = getAIReferenceItems(action);
    const selectedId = isGenerate
      ? selectedGenerateReference
      : selectedEditReference;
    const setSelectedId = isGenerate
      ? setSelectedGenerateReference
      : setSelectedEditReference;

    return (
      <div className={styles.aiReferenceSection}>
        <div className={styles.aiReferenceTitle}>参考图</div>
        <div className={styles.aiReferenceList}>
          {items.map((item) => {
            const selected = item.id === selectedId;
            return (
              <button
                key={item.id}
                type="button"
                className={classnames(styles.aiReferenceCard, {
                  [styles.selected]: selected,
                })}
                onClick={() => {
                  if (selected && item.url) {
                    showAIReferenceOverview(item);
                    return;
                  }
                  setSelectedId(item.id);
                }}
                disabled={aiSubmitting}
                title={selected && item.url ? "点击放大查看" : "选择为参考图"}
              >
                {item.url ? (
                  <LocalImageComponent
                    className={styles.aiReferenceImage}
                    url={item.url}
                    alt={item.label}
                  />
                ) : (
                  <div className={styles.aiReferenceEmpty}>
                    <PictureOutlined />
                  </div>
                )}
                <span className={styles.aiReferenceLabel}>
                  {selected && item.url ? "查看" : item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderAIImagePanel = (
    action: ImageAIAction,
    options: { hideActions?: boolean } = {},
  ) => {
    const isGenerate = action === "generate";
    const prompt = isGenerate ? generatePrompt : editPrompt;
    const setPrompt = isGenerate ? setGeneratePrompt : setEditPrompt;
    const selectedResult = getSelectedResult(action);
    const selectedReference = getSelectedReference(action);
    const actionText = selectedReference?.url
      ? "基于所选图片生成"
      : isGenerate
        ? "生成预览"
        : "编辑预览";

    return (
      <div className={styles.aiInlinePanel}>
        {renderAIReferencePicker(action)}
        <textarea
          className={styles.aiPromptInput}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={
            isGenerate
              ? "描述你想生成的图片，例如：一张白底的产品示意图，温暖手绘风格"
              : "描述你想如何调整这张图片，例如：改成透明背景，并增强主体光影"
          }
          disabled={aiSubmitting}
          rows={4}
        />
        <div className={styles.aiPreviewPanel}>
          {aiSubmitting ? (
            <div className={styles.aiPreviewEmpty}>
              <LoadingOutlined />
              <span>正在处理图片，请稍候...</span>
            </div>
          ) : selectedResult ? (
            <>
              <LocalImageComponent
                className={styles.aiPreviewImage}
                url={selectedResult.url}
                alt={selectedResult.prompt}
              />
              <div className={styles.aiPreviewMeta}>
                当前候选确认后才会{isGenerate ? "插入" : "替换"}。
              </div>
            </>
          ) : (
            <div className={styles.aiPreviewEmpty}>
              <PictureOutlined />
              <span>生成结果会先显示在这里，不会立即修改文档。</span>
            </div>
          )}
        </div>
        {!options.hideActions && (
          <div className={styles.aiActions}>
            <button
              type="button"
              className={styles.aiSecondaryButton}
              disabled={!prompt.trim() || aiSubmitting}
              onClick={() => handleRunAIImage(action)}
            >
              {aiSubmitting ? "处理中..." : actionText}
            </button>
            <button
              type="button"
              className={styles.aiPrimaryButton}
              disabled={!selectedResult || aiSubmitting}
              onClick={handleConfirmAIImage}
            >
              {isGenerate ? "确认插入" : "确认替换"}
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderPlaceholder = () => {
    if (readOnly) return null;
    return (
      <div
        className={classnames(styles.sourcePanel, {
          [styles.dark]: isDark,
        })}
      >
        <div className={styles.panelHeader}>
          <h4>插入图片</h4>
          <p>选择一个来源来上传或引用图片，支持 JPG、PNG、WebP。</p>
        </div>
        <ModernTabs
          isDark={isDark}
          items={[
            ...(imageGenerationAvailable
              ? [
                  {
                    key: "ai",
                    label: "AI 生成",
                    children: (
                      <div className={styles.tabCard}>
                        <p className={styles.tabHint}>
                          输入图片要求，先生成预览，确认后再插入文档。
                        </p>
                        {renderAIImagePanel("generate")}
                      </div>
                    ),
                  },
                ]
              : []),
            {
              key: "upload",
              label: "本地上传",
              children: (
                <div ref={uploadTabRef} className={styles.tabCard} tabIndex={0}>
                  <p className={styles.tabHint}>
                    支持拖拽或点击上传，也可以直接粘贴图片。
                  </p>
                  <ImageUploader
                    loading={uploading || pasteUploading}
                    onUploadSuccess={(link) => setLink(link)}
                    uploadResource={uploadResource}
                    showTabs={false}
                  />
                </div>
              ),
            },
            {
              key: "url",
              label: "网络图片",
              children: (
                <div className={styles.tabCard}>
                  <p className={styles.tabHint}>
                    粘贴图片直链，我们会立即在编辑器中展示。
                  </p>
                  <div className={styles.inputRow}>
                    <div className={styles.inputWrapper}>
                      <Input
                        prefix={<LinkOutlined className={styles.inputIcon} />}
                        placeholder="https://example.com/awesome-image.png"
                        value={networkImageUrl}
                        onChange={(e) => setNetworkImageUrl(e.target.value)}
                        onPressEnter={handleApplyNetworkUrl}
                      />
                    </div>
                    <Button
                      type="primary"
                      className={styles.primaryButton}
                      loading={linkSubmitting}
                      onClick={handleApplyNetworkUrl}
                    >
                      插入
                    </Button>
                  </div>
                </div>
              ),
            },
            {
              key: "library",
              label: "资源库",
              children: (
                <div className={styles.tabCard}>
                  <p className={styles.tabHint}>
                    从资源库中选择已上传的图片并插入到文档。
                  </p>
                  <div className={styles.actionsRow}>
                    <Button
                      className={styles.secondaryButton}
                      onClick={() => setResourcePickerOpen(true)}
                    >
                      打开资源库
                    </Button>
                  </div>
                </div>
              ),
            },
          ]}
        />
      </div>
    );
  };

  const renderPreview = () => {
    const displayUrl = previewUrl || url;
    const effectiveBorderRadius =
      borderRadius ?? settings.get("appearance.image.borderRadius") ?? "none";
    const effectiveShadow =
      shadow ?? settings.get("appearance.image.shadow") ?? "none";
    const imageAppearanceStyle = getImageAppearanceStyle({
      borderRadius: effectiveBorderRadius,
      shadow: effectiveShadow,
    });

    return (
      <div
        ref={containerRef}
        className={classnames(styles.imageContainer, {
          [styles.resizing]: resize.isResizing,
          [styles.selected]: isSelected,
          [styles.alignLeft]: align === "left",
          [styles.alignCenter]: align === "center",
          [styles.alignRight]: align === "right",
        })}
        style={{
          width: resize.size.width
            ? `${resize.size.width}px`
            : width
              ? `${width}px`
              : "auto",
          maxWidth: "100%",
          ["--image-border-radius" as string]:
            imageAppearanceStyle.borderRadius,
        }}
      >
        <LocalImageComponent
          className={classnames(styles.image, {
            [styles.zoomIn]: readOnly || isSelected,
          })}
          style={imageAppearanceStyle}
          url={displayUrl}
          alt={alt}
          ref={displayImgRef}
          onClick={handleSelect}
          onLoad={handleDisplayImageLoad}
          crossOrigin="anonymous"
        />
        {/* 描述编辑/展示区域 */}
        {(showDescEditor || (description && description.trim().length > 0)) && (
          <div
            style={{
              marginTop: "0.5em",
              color: "rgba(0,0,0,0.65)",
              fontSize: "0.875em",
              lineHeight: 1.4,
              wordBreak: "break-word",
              textAlign: "center",
            }}
          >
            {showDescEditor ? (
              <EditText
                ref={(r) => {
                  descRef.current = r;
                }}
                defaultValue={description || ""}
                placeholder="请输入图片描述"
                contentEditable={!readOnly}
                defaultFocus
                onChange={(val) => updateDescription(val)}
                onBlur={exitDescEditing}
                onPressEnter={exitDescEditing}
                isSlateEditor={true}
              />
            ) : (
              <div
                onClick={() => {
                  if (readOnly) return;
                  setShowDescEditor(true);
                  setTimeout(() => descRef.current?.focusEnd(), 0);
                }}
                style={{ cursor: readOnly ? "default" : "pointer" }}
              >
                {description}
              </div>
            )}
          </div>
        )}
        {!readOnly && isSelected && (
          <>
            {RESIZE_HANDLES.map(({ direction, cursor }) => (
              <div
                key={direction}
                className={classnames(
                  styles.resizeHandle,
                  // @ts-ignore
                  styles[`resize-${direction}`],
                )}
                style={{ cursor }}
                onPointerDown={(e) => resize.handleResizeStart(e, direction)}
              />
            ))}
            {resize.isResizing && (
              <div className={styles.imageInfo}>
                {Math.round(resize.size.width || 0)} px
              </div>
            )}
          </>
        )}
        {!readOnly && (
          <div className={styles.actions}>
            <div onClick={showOverView} className={styles.item}>
              <FullscreenOutlined />
            </div>
            <div className={styles.divider}></div>
            <div
              onClick={toggleAlign}
              className={styles.item}
              title={
                align === "left"
                  ? "居中对齐"
                  : align === "center"
                    ? "右对齐"
                    : "左对齐"
              }
            >
              {align === "left" && <AlignLeftOutlined />}
              {align === "center" && <AlignCenterOutlined />}
              {align === "right" && <AlignRightOutlined />}
            </div>
            <div className={styles.divider}></div>
            {!description && !showDescEditor && (
              <>
                <div
                  onClick={() => {
                    if (readOnly) return;
                    setShowDescEditor(true);
                    setTimeout(() => descRef.current?.focusEnd(), 0);
                  }}
                  className={styles.item}
                >
                  <FileTextOutlined />
                </div>
                <div className={styles.divider}></div>
              </>
            )}
            {imageGenerationAvailable && (
              <>
                <div
                  onClick={() => openAIImagePanel("edit")}
                  className={styles.item}
                  title="AI 编辑图片"
                >
                  <PictureOutlined />
                </div>
                <div className={styles.divider}></div>
              </>
            )}
            <div onClick={() => setCropperOpen(true)} className={styles.item}>
              <ScissorOutlined />
            </div>
            <div className={styles.divider}></div>
            <div onClick={deleteImage} className={styles.item}>
              <DeleteOutlined />
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    if (url) {
      return renderPreview();
    } else {
      return renderPlaceholder();
    }
  };

  return (
    <div
      className={classnames(styles.dropContainer, {
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}
      ref={(node) => {
        drop(node);
      }}
      contentEditable={false}
      style={{ userSelect: "none" }}
    >
      <div {...attributes}>
        {renderContent()}
        <div
          contentEditable={false}
          ref={(node) => {
            drag(node);
          }}
          className={classnames(styles.dragHandler, {
            [styles.canDrag]: canDrag,
          })}
          onClick={dragHandlerProps.onClick}
        >
          <MdDragIndicator className={styles.icon} />
        </div>
        <EditorContextMenu {...menuProps} readonly={readOnly} />
        {children}
        {!(readOnly && isLast) && <AddParagraph element={element} />}
      </div>
      {previewingReference?.url && (
        <PortalToBody>
          <div
            className={styles.aiReferencePreviewOverlay}
            onClick={() => setPreviewingReference(null)}
          >
            <button
              type="button"
              className={styles.aiReferencePreviewClose}
              onClick={() => setPreviewingReference(null)}
              aria-label="关闭预览"
            >
              ×
            </button>
            <button
              type="button"
              className={styles.aiReferencePreviewImageWrap}
              onClick={() => setPreviewingReference(null)}
              aria-label="关闭预览"
            >
              <LocalImageComponent
                className={styles.aiReferencePreviewImage}
                url={previewingReference.url}
                alt={previewingReference.label}
              />
            </button>
          </div>
        </PortalToBody>
      )}
      <CustomModal
        open={aiEditModalOpen}
        onCancel={() => {
          if (aiSubmitting) return;
          setAiEditModalOpen(false);
          setEditedCandidates([]);
          setSelectedEditReference("original");
        }}
        title="AI 编辑图片"
        subtitle="输入调整要求，先生成预览，确认后再替换当前图片"
        width={720}
        destroyOnClose
        className={classnames(styles.aiEditModal, { [styles.dark]: isDark })}
        bodyClassName={styles.aiEditModalBody}
        footer={
          <div className={styles.aiActions}>
            <button
              type="button"
              className={styles.aiSecondaryButton}
              disabled={aiSubmitting}
              onClick={() => {
                setAiEditModalOpen(false);
                setEditedCandidates([]);
                setSelectedEditReference("original");
                setEditPrompt("");
              }}
            >
              取消
            </button>
            <button
              type="button"
              className={styles.aiSecondaryButton}
              disabled={!editPrompt.trim() || aiSubmitting}
              onClick={() => handleRunAIImage("edit")}
            >
              {aiSubmitting
                ? "处理中..."
                : getSelectedReference("edit")?.url
                  ? "基于所选图片生成"
                  : "编辑预览"}
            </button>
            <button
              type="button"
              className={styles.aiPrimaryButton}
              disabled={!getSelectedResult("edit") || aiSubmitting}
              onClick={handleConfirmAIImage}
            >
              确认替换
            </button>
          </div>
        }
      >
        <div className={styles.aiEditModalContent}>
          {renderAIImagePanel("edit", { hideActions: true })}
        </div>
      </CustomModal>
      {ResourcePickerModal && (
        <ResourcePickerModal
          open={resourcePickerOpen}
          onCancel={() => setResourcePickerOpen(false)}
          allowedTypes={["image"]}
          multiple
          title="选择图片"
          onConfirm={handleInsertFromResource}
        />
      )}
      <ImageCropper
        open={cropperOpen}
        onCancel={() => setCropperOpen(false)}
        imageUrl={url}
        initialTransform={element.cropTransform}
        onConfirm={handleCropConfirm}
        alt={alt}
        isDark={isDark}
      />
    </div>
  );
};

export default Image;

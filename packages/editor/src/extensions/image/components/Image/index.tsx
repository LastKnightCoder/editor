import React, { forwardRef, useEffect, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { message, App } from "antd";
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

type AIReferenceSelection = {
  ids: string[];
  items: AIReferenceItem[];
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
  const [editReferenceCandidates, setEditReferenceCandidates] = useState<
    PendingAIImage[]
  >([]);
  const [editedCandidates, setEditedCandidates] = useState<PendingAIImage[]>(
    [],
  );
  const [selectedGenerateReference, setSelectedGenerateReference] =
    useState("empty");
  const [selectedEditReferenceIds, setSelectedEditReferenceIds] = useState([
    "original",
  ]);
  const [selectedEditResultId, setSelectedEditResultId] = useState<
    string | null
  >(null);
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
    setEditReferenceCandidates([]);
    setEditedCandidates([]);
    setSelectedEditReferenceIds(["original"]);
    setSelectedEditResultId(null);
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
      ...editReferenceCandidates.map((item) => ({
        id: item.id,
        label: item.label,
        url: item.url,
        kind: "result" as const,
      })),
    ];
  };

  const getSelectedReference = (
    action: ImageAIAction,
  ): AIReferenceSelection => {
    const items = getAIReferenceItems(action);
    if (action === "generate") {
      const selectedItem = items.find(
        (item) => item.id === selectedGenerateReference,
      );
      return {
        ids: selectedItem ? [selectedItem.id] : [],
        items: selectedItem ? [selectedItem] : [],
      };
    }

    const selectedItems = items.filter((item) =>
      selectedEditReferenceIds.includes(item.id),
    );
    return {
      ids: selectedItems.map((item) => item.id),
      items: selectedItems,
    };
  };

  const getSelectedResult = (action: ImageAIAction) => {
    const selectedId =
      action === "generate" ? selectedGenerateReference : selectedEditResultId;
    const candidates =
      action === "generate" ? generatedCandidates : editedCandidates;
    return selectedId
      ? (candidates.find((item) => item.id === selectedId) ?? null)
      : null;
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
      const selectedReferenceUrls = selectedReference.items
        .map((item) => item.url)
        .filter((item): item is string => Boolean(item));
      setAiSubmitting(true);
      try {
        setAiAction(action);
        const result = selectedReferenceUrls.length
          ? await imageGeneration.editImage({
              prompt,
              images: selectedReferenceUrls,
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
          setSelectedEditResultId(pendingImage.id);
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
      setEditReferenceCandidates([]);
      setEditedCandidates([]);
      setSelectedEditReferenceIds(["original"]);
      setSelectedEditResultId(null);
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

  const handleUploadReference = useMemoizedFn(async (action: ImageAIAction) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = action === "edit";
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files ?? []);
      if (files.length === 0) return;
      if (!uploadResource) {
        message.warning("尚未配置图床，无法上传参考图");
        return;
      }
      try {
        const uploadedUrls = await Promise.all(
          files.map((file) => uploadResource(file)),
        );
        const validUrls = uploadedUrls.filter((item): item is string =>
          Boolean(item),
        );
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
          setGeneratedCandidates((prev) => [...prev, ...pendingRefs]);
          setSelectedGenerateReference(
            pendingRefs[pendingRefs.length - 1]?.id ?? "empty",
          );
        } else {
          setEditReferenceCandidates((prev) => {
            const pendingRefs = validUrls.map((uploadedUrl, index) => ({
              id: getUuid(),
              url: uploadedUrl,
              prompt: "",
              label: `参考 ${prev.length + index + 1}`,
            }));
            setSelectedEditReferenceIds((current) => [
              ...current,
              ...pendingRefs.map((item) => item.id),
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

  const handleRemoveReference = useMemoizedFn(
    (action: ImageAIAction, id: string) => {
      const isGenerate = action === "generate";
      if (isGenerate) {
        setGeneratedCandidates((prev) => prev.filter((item) => item.id !== id));
        if (selectedGenerateReference === id) {
          setSelectedGenerateReference("empty");
        }
      } else {
        setEditReferenceCandidates((prev) =>
          prev.filter((item) => item.id !== id),
        );
        setSelectedEditReferenceIds((prev) => {
          const nextIds = prev.filter((item) => item !== id);
          return nextIds.length > 0 ? nextIds : ["original"];
        });
      }
    },
  );

  const renderAIReferencePicker = (action: ImageAIAction) => {
    const isGenerate = action === "generate";
    const items = getAIReferenceItems(action);
    const selectedIds = isGenerate
      ? [selectedGenerateReference]
      : selectedEditReferenceIds;

    return (
      <div className="flex flex-col gap-[0.5em]">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-[0.125em]">
            <span className="text-[0.75em] font-medium text-gray-500 dark:text-zinc-400">
              参考图
            </span>
            {!isGenerate && (
              <span className="text-[0.6875em] text-gray-400 dark:text-zinc-500">
                Ctrl/Command +
                点击可多选或取消，普通点击单选，点击已选中图片可放大
              </span>
            )}
          </div>
          <button
            type="button"
            className="text-[0.6875em] text-gray-500 dark:text-zinc-400 cursor-pointer border-none bg-transparent hover:text-gray-800 dark:hover:text-zinc-200 transition-colors duration-150 flex items-center gap-[0.25em]"
            onClick={() => handleUploadReference(action)}
            disabled={aiSubmitting}
          >
            <span className="text-[1.1em]">+</span>
            上传参考图
          </button>
        </div>
        <div className="flex gap-[0.5em] overflow-x-auto pb-[0.25em]">
          {items.map((item) => {
            const selected = selectedIds.includes(item.id);
            const canRemove = item.kind === "result" && !aiSubmitting;
            return (
              <div key={item.id} className="relative shrink-0">
                <button
                  type="button"
                  className={classnames(
                    "relative w-[3.5em] h-[3.5em] p-0 overflow-hidden rounded-[0.5em] cursor-pointer transition-all duration-150 border-[0.125em]",
                    selected
                      ? "border-[var(--th-btn-bg)]"
                      : "border-gray-200 dark:border-zinc-700 hover:border-gray-400 dark:hover:border-zinc-500",
                    "disabled:cursor-not-allowed disabled:opacity-70",
                  )}
                  onClick={(event) => {
                    if (isGenerate) {
                      if (selected && item.url) {
                        showAIReferenceOverview(item);
                        return;
                      }
                      setSelectedGenerateReference(item.id);
                      return;
                    }

                    const isMultiSelect = event.ctrlKey || event.metaKey;
                    if (!isMultiSelect && selected && item.url) {
                      showAIReferenceOverview(item);
                      return;
                    }

                    if (!isMultiSelect) {
                      setSelectedEditReferenceIds([item.id]);
                      return;
                    }

                    setSelectedEditReferenceIds((prev) => {
                      return prev.includes(item.id)
                        ? prev.filter((id) => id !== item.id)
                        : [...prev, item.id];
                    });
                  }}
                  disabled={aiSubmitting}
                  title={selected && item.url ? "点击放大查看" : item.label}
                >
                  {item.url ? (
                    <LocalImageComponent
                      className="w-full h-full object-cover block"
                      url={item.url}
                      alt={item.label}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-zinc-900 text-gray-400 dark:text-zinc-500 text-[0.875em]">
                      <PictureOutlined />
                    </div>
                  )}
                </button>
                {canRemove && (
                  <button
                    type="button"
                    className="absolute -top-[0.25em] -right-[0.25em] w-[1.125em] h-[1.125em] rounded-full bg-gray-600 dark:bg-zinc-600 text-white text-[0.625em] border-none cursor-pointer flex items-center justify-center leading-none hover:bg-red-500 transition-colors duration-150 z-10"
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
        <span className="text-[0.75em] font-medium text-gray-500 dark:text-zinc-400">
          候选结果
        </span>
        <div className="flex gap-[0.5em] overflow-x-auto pb-[0.25em]">
          {editedCandidates.map((item) => {
            const selected = item.id === selectedEditResultId;
            return (
              <div key={item.id} className="relative shrink-0">
                <button
                  type="button"
                  className={classnames(
                    "relative w-[3.5em] h-[3.5em] p-0 overflow-hidden rounded-[0.5em] cursor-pointer transition-all duration-150 border-[0.125em]",
                    selected
                      ? "border-[var(--th-btn-bg)]"
                      : "border-gray-200 dark:border-zinc-700 hover:border-gray-400 dark:hover:border-zinc-500",
                    "disabled:cursor-not-allowed disabled:opacity-70",
                  )}
                  onClick={() => {
                    if (selected) {
                      showAIReferenceOverview({
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
                    className="w-full h-full object-cover block"
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

  const renderAIImagePanel = (
    action: ImageAIAction,
    options: { hideActions?: boolean } = {},
  ) => {
    const isGenerate = action === "generate";
    const prompt = isGenerate ? generatePrompt : editPrompt;
    const setPrompt = isGenerate ? setGeneratePrompt : setEditPrompt;
    const selectedResult = getSelectedResult(action);
    const selectedReference = getSelectedReference(action);
    const selectedReferenceCount = selectedReference.items.filter((item) =>
      Boolean(item.url),
    ).length;
    const actionText =
      selectedReferenceCount > 0
        ? "基于参考图生成"
        : isGenerate
          ? "生成"
          : "编辑";

    return (
      <div className="flex flex-col gap-[0.875em]">
        {renderAIReferencePicker(action)}
        <textarea
          className="w-full min-h-[7.5em] resize-y px-[1em] py-[0.875em] rounded-[0.75em] border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-950 text-gray-800 dark:text-white text-[0.875em] leading-[1.6] outline-none transition-all duration-200 shadow-inner placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:border-[var(--th-border-focus)] focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_var(--th-border-focus)/20] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_var(--th-border-focus)/25] disabled:cursor-not-allowed disabled:opacity-60"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
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
          <div className="flex flex-col items-center gap-[0.5em] p-[1em] rounded-[0.75em] border border-gray-200 dark:border-zinc-700">
            {aiSubmitting ? (
              <div className="flex items-center gap-[0.5em] text-text-3 text-[0.8125em]">
                <LoadingOutlined />
                <span>正在生成...</span>
              </div>
            ) : selectedResult ? (
              <>
                <LocalImageComponent
                  className="max-w-full max-h-[16em] object-contain rounded-[0.5em]"
                  url={selectedResult.url}
                  alt={selectedResult.prompt}
                />
                <div className="text-text-3 text-[0.75em]">
                  确认后{isGenerate ? "插入" : "替换"}
                </div>
              </>
            ) : null}
          </div>
        )}
        {!options.hideActions && (
          <div className="flex items-center justify-end gap-[0.5em] pt-[0.5em] border-t border-gray-200 dark:border-zinc-700/50">
            <button
              type="button"
              className="px-[1.25em] py-[0.625em] rounded-[0.75em] text-[0.875em] font-semibold cursor-pointer transition-all bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-200 hover:bg-gray-200 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={!prompt.trim() || aiSubmitting}
              onClick={() => handleRunAIImage(action)}
            >
              {aiSubmitting ? "处理中..." : actionText}
            </button>
            <button
              type="button"
              className="px-[1.25em] py-[0.625em] rounded-[0.75em] border-none text-[0.875em] font-semibold cursor-pointer transition-all bg-[var(--th-btn-bg)] text-[var(--th-btn-text)] hover:bg-[var(--th-btn-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
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
      <div className="rounded-[0.75em] p-[1.25em] border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
        <ModernTabs
          isDark={isDark}
          variant="flat"
          items={[
            {
              key: "upload",
              label: "本地上传",
              children: (
                <div
                  ref={uploadTabRef}
                  className="flex flex-col gap-[1em]"
                  tabIndex={0}
                >
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
                <div className="flex flex-col gap-[1em]">
                  <div className="flex gap-[0.75em] flex-wrap items-center">
                    <div className="flex-1 relative">
                      <span className="absolute left-[0.75em] top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 pointer-events-none">
                        <LinkOutlined />
                      </span>
                      <input
                        type="text"
                        className="w-full px-[1em] py-[0.875em] pl-[2.25em] rounded-[0.75em] border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-950 text-gray-800 dark:text-white text-[0.875em] outline-none transition-all duration-200 shadow-inner placeholder:text-gray-400 dark:placeholder:text-zinc-500 focus:border-[var(--th-border-focus)] focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_var(--th-border-focus)/20] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_var(--th-border-focus)/25]"
                        placeholder="https://example.com/awesome-image.png"
                        value={networkImageUrl}
                        onChange={(e) => setNetworkImageUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleApplyNetworkUrl();
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      className="px-[1.25em] py-[0.75em] rounded-[0.75em] border-none text-[0.875em] font-semibold bg-[var(--th-btn-bg)] text-[var(--th-btn-text)] cursor-pointer transition-all duration-200 hover:bg-[var(--th-btn-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={linkSubmitting}
                      onClick={handleApplyNetworkUrl}
                    >
                      {linkSubmitting ? "插入中..." : "插入"}
                    </button>
                  </div>
                </div>
              ),
            },
            {
              key: "library",
              label: "资源库",
              children: (
                <div className="flex flex-col gap-[1em]">
                  <div className="flex justify-start">
                    <button
                      type="button"
                      className="px-[1.25em] py-[0.75em] rounded-[0.75em] text-[0.875em] font-semibold cursor-pointer transition-all bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-200 hover:bg-gray-200 dark:hover:bg-zinc-700"
                      onClick={() => setResourcePickerOpen(true)}
                    >
                      打开资源库
                    </button>
                  </div>
                </div>
              ),
            },
            ...(imageGenerationAvailable
              ? [
                  {
                    key: "ai",
                    label: "AI 生成",
                    children: (
                      <div className="flex flex-col gap-[1em]">
                        {renderAIImagePanel("generate")}
                      </div>
                    ),
                  },
                ]
              : []),
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
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-[0.125em]"
            onClick={() => setPreviewingReference(null)}
          >
            <button
              type="button"
              className="absolute top-[1.5em] right-[1.5em] w-[2.5em] h-[2.5em] rounded-full bg-white/10 text-white text-[1.5em] border-none cursor-pointer flex items-center justify-center hover:bg-white/20 transition-colors duration-150"
              onClick={() => setPreviewingReference(null)}
              aria-label="关闭预览"
            >
              ×
            </button>
            <button
              type="button"
              className="border-none bg-transparent p-0 cursor-pointer"
              onClick={() => setPreviewingReference(null)}
              aria-label="关闭预览"
            >
              <LocalImageComponent
                className="max-w-[90vw] max-h-[85vh] object-contain rounded-[0.5em]"
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
          setEditReferenceCandidates([]);
          setEditedCandidates([]);
          setSelectedEditReferenceIds(["original"]);
          setSelectedEditResultId(null);
        }}
        title="AI 编辑图片"
        subtitle="输入调整要求，先生成预览，确认后再替换当前图片"
        width={720}
        destroyOnClose
        className="max-h-[90vh]"
        bodyClassName="max-h-[calc(90vh-10.625em)] overflow-y-auto pr-[0.25em]"
        footer={
          <div className="flex justify-end gap-[0.625em] flex-wrap">
            <button
              type="button"
              className="h-[2.25em] px-[1em] rounded-[0.625em] border border-[var(--th-border)] text-[0.875em] font-medium cursor-pointer bg-bg-elevated text-text-1 transition-all duration-200 hover:border-[var(--th-border-hover)] hover:bg-bg-container disabled:opacity-45 disabled:cursor-not-allowed"
              disabled={aiSubmitting}
              onClick={() => {
                setAiEditModalOpen(false);
                setEditReferenceCandidates([]);
                setEditedCandidates([]);
                setSelectedEditReferenceIds(["original"]);
                setSelectedEditResultId(null);
                setEditPrompt("");
              }}
            >
              取消
            </button>
            <button
              type="button"
              className="h-[2.25em] px-[1em] rounded-[0.625em] border border-[var(--th-border)] text-[0.875em] font-medium cursor-pointer bg-bg-elevated text-text-1 transition-all duration-200 hover:border-[var(--th-border-hover)] hover:bg-bg-container disabled:opacity-45 disabled:cursor-not-allowed"
              disabled={!editPrompt.trim() || aiSubmitting}
              onClick={() => handleRunAIImage("edit")}
            >
              {aiSubmitting
                ? "处理中..."
                : getSelectedReference("edit").items.some((item) => item.url)
                  ? "基于所选图片生成"
                  : "编辑预览"}
            </button>
            <button
              type="button"
              className="h-[2.25em] px-[1em] rounded-[0.625em] border-none text-[0.875em] font-medium cursor-pointer bg-[var(--th-btn-bg)] text-[var(--th-btn-text)] transition-all duration-200 hover:bg-[var(--th-btn-hover)] disabled:opacity-45 disabled:cursor-not-allowed"
              disabled={!getSelectedResult("edit") || aiSubmitting}
              onClick={handleConfirmAIImage}
            >
              确认替换
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-[1em]">
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

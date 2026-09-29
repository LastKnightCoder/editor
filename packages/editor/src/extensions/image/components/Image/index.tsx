import React, { useEffect, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { useNotifier } from "../../../../services/hooks";
import { Transforms } from "slate";
import { ReactEditor, RenderElementProps, useSlateStatic, useReadOnly } from "slate-react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Crop,
  FileText,
  Maximize2,
  Trash2,
} from "lucide-react";
import { EditText } from "@tau/shared";
import type { EditTextHandle } from "@tau/shared";

import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import { useUploadResource } from "../../../../hooks/useUploadResource";
import useIsLastElement from "../../../../hooks/useIsLastElement";
import { useDragHandlerMenu } from "../../../../hooks/useDragHandlerMenu";

import AddParagraph from "../../../../components/AddParagraph";
import { useImagesOverviewStore } from "../../../../stores";
import type { ImageElement } from "../../../types";
import EditorContextMenu from "../../../../components/EditorContextMenu";
import { imageActionsMap } from "../../index";
import { buildImageMenuItems } from "../../utils/menuItems";
import { getImageAppearanceStyle } from "../../utils/appearance";

import { cn } from "@tau/ui";
import {
  BLOCK_DRAG_GROUP,
  DragHandle,
  DropIndicator,
  dimWhileDragging,
} from "../../../../components/BlockDrag";
import { useImageResize, ResizeDirection } from "../../../../hooks/useImageResize";

import useTheme from "../../../../hooks/useTheme";
import { useImageAppearance, type ImageAppearanceOption } from "../../appearanceOption";
import { IMediaActions, useEditorSlots, useOptionalService } from "../../../../services";
import { openLocalMediaPicker } from "../../../../utils/mediaInsert";
import {
  MEDIA_ACTION_BAR_CLASS,
  MEDIA_ACTION_DIVIDER_CLASS,
  MEDIA_ACTION_ITEM_CLASS,
  MEDIA_ALIGN_CLASS,
  MEDIA_CORNER_HANDLE_CLASS,
  MEDIA_CORNER_POSITION_CLASS,
  MEDIA_HOVER_GROUP,
  MEDIA_RESIZE_INFO_CLASS,
} from "../../../../utils/mediaFrameClasses";

import { ImageCropper } from "@tau/shared";
import type { CropperTransform } from "@tau/shared";

interface IImageProps {
  attributes: RenderElementProps["attributes"];
  element: ImageElement;
  appearance?: ImageAppearanceOption;
}

const Image: React.FC<React.PropsWithChildren<IImageProps>> = props => {
  const { attributes, children, element, appearance: appearanceOption } = props;
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
  const { isDark } = useTheme();
  const appearance = useImageAppearance(appearanceOption);
  const messageApi = useNotifier();
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const { Image: LocalImageComponent } = useEditorSlots();

  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } = useDragAndDrop({
    element,
  });

  const [uploading, setUploading] = useState(false);

  const [isSelected, setIsSelected] = useState(false);
  const [showDescEditor, setShowDescEditor] = useState(false);
  const descRef = useRef<EditTextHandle | null>(null);
  const isLast = useIsLastElement(element);

  const { menuProps, dragHandlerProps } = useDragHandlerMenu({
    element,
    editor,
    buildMenuItems: params => buildImageMenuItems(params, messageApi, appearance),
  });

  const { showImageOverview } = useImagesOverviewStore(state => ({
    showImageOverview: state.showImageOverview,
  }));

  const showOverView = useMemoizedFn(() => {
    showImageOverview(element, editor);
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
      }
    );
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
      }
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
      return new Promise(resolve => {
        canvas.toBlob(blob => {
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
      runMediaAction: (actionId: string) => setActiveActionId(actionId),
      showDescEditor: () => setShowDescEditor(true),
      getImageBlob,
    });
    return () => {
      imageActionsMap.delete(element);
    };
  }, [element, showOverView, deleteImage]);

  const imageActions = (useOptionalService(IMediaActions) ?? []).filter(
    action => action.mediaTypes.includes("image") && (action.isAvailable?.() ?? true)
  );
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const activeAction = imageActions.find(action => action.id === activeActionId) ?? null;
  const runMediaAction = (actionId: string) => setActiveActionId(actionId);

  const handleActionApply = (patch: Record<string, unknown>) => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, patch as Partial<ImageElement>, { at: path });
  };

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
        }
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

  // 计算编辑器可用最大宽度
  useEffect(() => {
    const editorEl = containerRef.current?.closest(
      '[data-slate-editor="true"]'
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
  const handleCropConfirm = useMemoizedFn(async (transform: CropperTransform, blob: Blob) => {
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
          { at: path }
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
  });

  const handleDisplayImageLoad = useMemoizedFn(() => {
    if (displayImgRef.current) {
      const img = displayImgRef.current;
      const imgNaturalWidth = img.naturalWidth;
      const imgNaturalHeight = img.naturalHeight;
      setNaturalSize({ width: imgNaturalWidth, height: imgNaturalHeight });

      if (!width) {
        const editorEl = containerRef.current?.closest(
          '[data-slate-editor="true"]'
        ) as HTMLElement | null;
        const editorWidth = editorEl?.clientWidth || 0;
        const dpr = window.devicePixelRatio || 1;
        const initialWidth = Math.min(imgNaturalWidth / dpr, editorWidth || imgNaturalWidth);
        updateElementWidth(initialWidth);
        resize.setSize({ width: initialWidth });
      }
    }
  });

  const resize = useImageResize({
    initialSize: { width },
    emElementRef: containerRef,
    minWidth: 50,
    maxWidth,
    minHeight: 10,
    aspectRatio:
      naturalSize.width && naturalSize.height ? naturalSize.width / naturalSize.height : undefined,
    onResizeEnd: size => {
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

  // 遗留空图片元素的最小占位（正常流程经 slash 菜单直接创建已填充的元素）
  const renderPlaceholder = () => {
    if (readOnly) return null;
    return (
      <div className="flex items-center justify-center gap-[0.5em] rounded-[0.75em] border border-dashed border-gray-300 p-[1.5em] text-[0.875em] text-gray-500 dark:border-zinc-700 dark:text-zinc-400">
        {uploading || pasteUploading ? (
          <span>图片上传中...</span>
        ) : (
          <>
            <span>空图片，</span>
            <button
              type="button"
              className="cursor-pointer border-none bg-transparent p-0 font-semibold text-[var(--ed-text-inverse)] underline-offset-2 hover:underline"
              onClick={() => openLocalMediaPicker(editor, "image", element)}
            >
              选择文件
            </button>
            <span>上传</span>
          </>
        )}
      </div>
    );
  };

  const renderPreview = () => {
    const displayUrl = previewUrl || url;
    const effectiveBorderRadius = borderRadius ?? appearance?.borderRadius ?? "none";
    const effectiveShadow = shadow ?? appearance?.shadow ?? "none";
    const imageAppearanceStyle = getImageAppearanceStyle({
      borderRadius: effectiveBorderRadius,
      shadow: effectiveShadow,
    });

    return (
      <div
        ref={containerRef}
        className={cn(
          MEDIA_HOVER_GROUP,
          "relative my-0 block w-fit max-w-full rounded-[var(--image-border-radius,0)]",
          MEDIA_ALIGN_CLASS[align],
          isSelected &&
            "after:pointer-events-none after:absolute after:-inset-[2px] after:rounded-[var(--image-border-radius,0)] after:border-[1.5px] after:border-solid after:border-[var(--ed-accent)] after:content-['']"
        )}
        style={{
          width: resize.size.width
            ? `${resize.size.width / 16}em`
            : width
              ? `${width / 16}em`
              : "auto",
          maxWidth: "100%",
          ["--image-border-radius" as string]: imageAppearanceStyle.borderRadius,
        }}
      >
        <LocalImageComponent
          className={cn(
            "block h-auto w-full max-w-full",
            readOnly || isSelected ? "cursor-zoom-in" : "cursor-default"
          )}
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
                ref={r => {
                  descRef.current = r;
                }}
                defaultValue={description || ""}
                placeholder="请输入图片描述"
                contentEditable={!readOnly}
                defaultFocus
                onChange={val => updateDescription(val)}
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
                className={cn(MEDIA_CORNER_HANDLE_CLASS, MEDIA_CORNER_POSITION_CLASS[direction])}
                style={{ cursor }}
                onPointerDown={e => resize.handleResizeStart(e, direction)}
              />
            ))}
            {resize.isResizing && (
              <div className={MEDIA_RESIZE_INFO_CLASS}>{Math.round(resize.size.width || 0)} px</div>
            )}
          </>
        )}
        {!readOnly && (
          <div className={MEDIA_ACTION_BAR_CLASS}>
            <div onClick={showOverView} className={MEDIA_ACTION_ITEM_CLASS}>
              <Maximize2 size="1em" />
            </div>
            <div className={MEDIA_ACTION_DIVIDER_CLASS}></div>
            <div
              onClick={toggleAlign}
              className={MEDIA_ACTION_ITEM_CLASS}
              title={align === "left" ? "居中对齐" : align === "center" ? "右对齐" : "左对齐"}
            >
              {align === "left" && <AlignLeft size="1em" />}
              {align === "center" && <AlignCenter size="1em" />}
              {align === "right" && <AlignRight size="1em" />}
            </div>
            <div className={MEDIA_ACTION_DIVIDER_CLASS}></div>
            {!description && !showDescEditor && (
              <>
                <div
                  onClick={() => {
                    if (readOnly) return;
                    setShowDescEditor(true);
                    setTimeout(() => descRef.current?.focusEnd(), 0);
                  }}
                  className={MEDIA_ACTION_ITEM_CLASS}
                >
                  <FileText size="1em" />
                </div>
                <div className={MEDIA_ACTION_DIVIDER_CLASS}></div>
              </>
            )}
            {imageActions.map(action => (
              <React.Fragment key={action.id}>
                <div
                  onClick={() => runMediaAction(action.id)}
                  className={MEDIA_ACTION_ITEM_CLASS}
                  title={action.label}
                >
                  {action.icon}
                </div>
                <div className={MEDIA_ACTION_DIVIDER_CLASS}></div>
              </React.Fragment>
            ))}
            <div onClick={() => setCropperOpen(true)} className={MEDIA_ACTION_ITEM_CLASS}>
              <Crop size="1em" />
            </div>
            <div className={MEDIA_ACTION_DIVIDER_CLASS}></div>
            <div onClick={deleteImage} className={MEDIA_ACTION_ITEM_CLASS}>
              <Trash2 size="1em" />
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
      className={cn(
        "relative",
        BLOCK_DRAG_GROUP,
        dimWhileDragging(isDragging || (isOverCurrent && canDrop))
      )}
      ref={node => {
        drop(node);
      }}
      contentEditable={false}
      style={{ userSelect: "none" }}
    >
      <DropIndicator active={isOverCurrent && canDrop} before={isBefore} />
      <div {...attributes}>
        {renderContent()}
        <DragHandle
          dragRef={node => {
            drag(node);
          }}
          canDrag={canDrag}
          onClick={dragHandlerProps.onClick}
        />
        <EditorContextMenu {...menuProps} readonly={readOnly} />
        {children}
        {!(readOnly && isLast) && <AddParagraph element={element} />}
      </div>
      {activeAction && (
        <activeAction.Modal
          element={element}
          open={activeActionId === activeAction.id}
          onCancel={() => setActiveActionId(null)}
          onApply={handleActionApply}
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

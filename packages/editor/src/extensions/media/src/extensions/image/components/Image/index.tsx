import React, { useEffect, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { Transforms } from "slate";
import { RenderElementProps, useReadOnly, useSlateStatic } from "slate-react";
import { Button, Spinner, cn } from "@tau/ui";
import { ImageOff } from "lucide-react";
import { EditText } from "@tau/shared";
import type { EditTextHandle } from "@tau/shared";

import {
  AddParagraph,
  useIsLastElement,
  getCommandElementPath,
  OverlayBackDismiss,
  ElementMenu,
  captureElementSubmission,
} from "@tau/editor/api";
import ImageCropEditor, { type ImageCropTransform } from "../../../../components/ImageCropEditor";
import { useImageResize, type ResizeDirection } from "../../../../hooks/useImageResize";
import {
  beginMediaSubmission,
  mediaResourceSnapshot,
  useMediaUploading,
} from "../../../../utils/mediaSubmission";
import { IMediaActions } from "../../../../services/tokens";
import { useEditorSlots } from "../../../../services/hooks";
import { useNotifier, useOptionalService, useTouchVoidSelection } from "@tau/editor/api";
import { openImageLightbox } from "../../../../stores";
import type { ImageElement } from "../../../../types";
import { copyImageElement, imageElementToBlob } from "../../../../utils/imageBlob";
import {
  MEDIA_ALIGN_CLASS,
  MEDIA_CORNER_HANDLE_CLASS,
  MEDIA_CORNER_POSITION_CLASS,
  MEDIA_RESIZE_INFO_CLASS,
  MEDIA_SELECTED_OUTLINE_CLASS,
  MEDIA_SIDE_HANDLE_CLASS,
  MEDIA_SIDE_POSITION_CLASS,
} from "../../../../utils/mediaFrameClasses";
import { editorContentWidth, matchWidthPreset } from "../../../../utils/mediaWidth";
import { isOverlayTarget, isTextTarget, shouldIgnoreBlockKey } from "@tau/editor/api";
import { useImageAppearance, type ImageAppearanceOption } from "../../appearanceOption";
import { imageActionsMap } from "../../utils/actionsMap";
import { getImageAppearanceStyle } from "../../utils/appearance";
import ImageSelectionToolbar from "./ImageSelectionToolbar";
import { mediaWidthControls } from "../../../../utils/mediaWidthControls";

interface IImageProps {
  attributes: RenderElementProps["attributes"];
  element: ImageElement;
  appearance?: ImageAppearanceOption;
}

type LoadStatus = "loading" | "loaded" | "error";

/** 加载前不知道原图比例时的占位比例 */
const FALLBACK_ASPECT = "16 / 9";

const RESIZE_HANDLES: { direction: ResizeDirection; cursor: string; side?: boolean }[] = [
  { direction: "nw", cursor: "nwse-resize" },
  { direction: "ne", cursor: "nesw-resize" },
  { direction: "se", cursor: "nwse-resize" },
  { direction: "sw", cursor: "nesw-resize" },
  { direction: "w", cursor: "ew-resize", side: true },
  { direction: "e", cursor: "ew-resize", side: true },
];

const imageFileOf = (data: DataTransfer | null) =>
  Array.from(data?.files ?? []).find(file => file.type.startsWith("image/")) ?? null;

/**
 * 图片块：悬停不出控件，单击选中、双击预览；选中后上方浮出属性条，四角等比缩放、两侧拖宽（吸附 50 / 75 / 100%）。
 * 说明行只在已有说明或正在编辑时占位，选中本身不改变块高；从属性条「说明」按钮或 Enter 进入编辑。加载前按存下的原图比例占位，失败给出重试 / 替换；选中时拖入或粘贴图片即替换。
 * 触屏模式：单击把 Slate 选区放进本块表示选中，属性条、手柄、快捷键与拖入替换都不出现，操作由宿主工具栏经命令完成。
 */
const Image: React.FC<React.PropsWithChildren<IImageProps>> = props => {
  const { attributes, children, element, appearance: appearanceOption } = props;
  const {
    url,
    alt = "",
    previewUrl,
    width,
    description,
    align = "center",
    borderRadius,
    shadow,
    naturalWidth,
    naturalHeight,
  } = element;

  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const notifier = useNotifier();
  const uploading = useMediaUploading(editor, element);
  const appearance = useImageAppearance(appearanceOption);
  const { Image: ImageSlot } = useEditorSlots();
  const isLast = useIsLastElement(element);
  const touchSelection = useTouchVoidSelection(element);
  const { touch } = touchSelection;

  const containerRef = useRef<HTMLDivElement>(null);
  const displayImgRef = useRef<HTMLImageElement>(null);
  const descRef = useRef<EditTextHandle | null>(null);
  // 上传等异步操作结束时按最新节点定位（期间节点对象可能已被替换）
  const elementRef = useRef(element);
  elementRef.current = element;

  const displayUrl = previewUrl || url;
  const isCropped = !!previewUrl && previewUrl !== url;

  const [pointerSelected, setIsSelected] = useState(false);
  const isSelected = touch ? touchSelection.selected : pointerSelected;
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [loadedSize, setLoadedSize] = useState<{ width: number; height: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showDescEditor, setShowDescEditor] = useState(false);
  const [contentWidth, setContentWidth] = useState(0);
  const [menu, setMenu] = useState<{
    position: { x: number; y: number };
  } | null>(null);
  const menuOpenRef = useRef(false);
  menuOpenRef.current = !!menu;
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const cropSessionRef = useRef<ReturnType<typeof captureElementSubmission<ImageElement>> | null>(
    null
  );
  const cropSession = cropSessionRef.current;
  useEffect(() => () => cropSessionRef.current?.dispose(), []);
  useEffect(() => {
    cropSessionRef.current?.check();
  }, [url, previewUrl, element.cropTransform]);

  const imageActions = (useOptionalService(IMediaActions) ?? []).filter(
    action => action.mediaTypes.includes("image") && (action.isAvailable?.() ?? true)
  );
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const activeAction = imageActions.find(action => action.id === activeActionId) ?? null;

  useEffect(() => {
    if (!readOnly) return;
    setCropOpen(false);
    setCropSrc(null);
    setActiveActionId(null);
    setShowDescEditor(false);
    setIsSelected(false);
    setMenu(null);
  }, [readOnly]);

  // ---- 节点读写 ----
  const setProps = useMemoizedFn((patch: Partial<ImageElement>) => {
    if (!containerRef.current?.isConnected) return false;
    const path = getCommandElementPath(editor, { element: elementRef.current });
    if (!path) return false;
    Transforms.setNodes(editor, patch, { at: path });
    return true;
  });

  useEffect(() => {
    if (!previewUrl && url && !readOnly) {
      setProps({ previewUrl: url });
    }
  }, [url, previewUrl, readOnly, setProps]);

  useEffect(() => {
    setStatus("loading");
  }, [displayUrl]);

  // ---- 选中 / 取消 ----
  useEffect(() => {
    const handleDocMouseDown = (event: MouseEvent) => {
      if (menuOpenRef.current) return;
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsSelected(false);
      }
    };
    document.addEventListener("mousedown", handleDocMouseDown);
    return () => document.removeEventListener("mousedown", handleDocMouseDown);
  }, []);

  useEffect(() => {
    if (isSelected) {
      setContentWidth(editorContentWidth(containerRef.current));
    } else if (!touch) {
      // 触屏下说明编辑由输入框失焦收起，焦点移入说明时 Slate 选区可能已离开本块
      setShowDescEditor(false);
    }
  }, [isSelected, touch]);

  const preview = useMemoizedFn(() => openImageLightbox(editor, element));

  const handleFrameClick = useMemoizedFn((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (readOnly) {
      preview();
    } else if (touch) {
      touchSelection.select();
    } else {
      setIsSelected(true);
    }
  });

  // ---- 删除 / 替换 ----
  const deleteImage = useMemoizedFn(() => {
    if (readOnly) return;
    const path = getCommandElementPath(editor, { element });
    if (!path) return;
    Transforms.delete(editor, { at: path });
    Transforms.insertNodes(
      editor,
      { type: "paragraph", children: [{ type: "formatted", text: "" }] },
      { at: path, select: true }
    );
  });

  const replaceWithFile = useMemoizedFn(
    async (file: File, pending?: ReturnType<typeof beginMediaSubmission>) => {
      const submission = pending ?? beginMediaSubmission(editor, elementRef.current);
      if (!submission) return;
      try {
        if (submission.check()) return;
        let uploaded: string | undefined;
        try {
          uploaded = await submission.upload(file);
          if (!uploaded) throw new Error("图片上传失败");
        } catch (error) {
          if (!submission.check()) {
            console.error("替换图片失败:", error);
            notifier.error("图片上传失败");
          }
          return;
        }
        // 换图保留宽度、对齐与说明，裁剪参数和原图尺寸随新图作废
        submission.commit(({ path }) => {
          Transforms.setNodes(
            editor,
            {
              url: uploaded,
              previewUrl: uploaded,
              cropTransform: undefined,
              naturalWidth: undefined,
              naturalHeight: undefined,
            },
            { at: path }
          );
        });
      } finally {
        submission.dispose();
      }
    }
  );

  const pickReplacement = useMemoizedFn((options?: { capture?: boolean }) => {
    const submission = beginMediaSubmission(editor, elementRef.current);
    if (!submission) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (options?.capture) input.setAttribute("capture", "environment");
    input.style.display = "none";
    document.body.appendChild(input);
    submission.signal.addEventListener("abort", () => input.remove(), { once: true });
    input.oncancel = () => submission.dispose();
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void replaceWithFile(file, submission);
      else submission.dispose();
    };
    input.click();
  });

  // ---- 裁剪 ----
  const startCrop = useMemoizedFn(() => {
    if (readOnly || !url) return;
    cropSessionRef.current?.dispose();
    const snapshot = mediaResourceSnapshot(element);
    const session = captureElementSubmission(editor, {
      element,
      accept: current => mediaResourceSnapshot(current) === snapshot,
    });
    if (session.check()) {
      session.dispose();
      return;
    }
    cropSessionRef.current = session;
    session.signal.addEventListener(
      "abort",
      () => {
        if (cropSessionRef.current !== session) return;
        cropSessionRef.current = null;
        setCropOpen(false);
        setCropSrc(null);
      },
      { once: true }
    );
    // 未裁剪过：显示图就是原图，直接用它已解析的地址；裁剪过则另行解析原图（见下方隐藏的插槽图片）
    setCropSrc(!isCropped ? (displayImgRef.current?.currentSrc ?? null) : null);
    setCropOpen(true);
  });

  const closeCrop = useMemoizedFn(() => {
    cropSessionRef.current?.dispose();
    setCropOpen(false);
    setCropSrc(null);
  });

  const handleCropConfirm = useMemoizedFn(
    async (
      {
        transform,
        blob,
        ext,
      }: {
        transform: ImageCropTransform;
        blob: Blob;
        ext: string;
      },
      session: typeof cropSession
    ) => {
      if (!session || session.check()) return;
      const submission = beginMediaSubmission(editor, elementRef.current, {
        signal: session.signal,
      });
      if (!submission) return;
      try {
        const file = new File([blob], `crop-${Date.now()}.${ext}`, { type: blob.type });
        let uploaded: string | undefined;
        try {
          uploaded = await submission.upload(file);
          if (!uploaded) throw new Error("裁剪结果上传失败，请重试");
        } catch (error) {
          if (submission.check()) return;
          throw error;
        }
        const outcome = submission.commit(({ path }) => {
          Transforms.setNodes(
            editor,
            {
              cropTransform: transform,
              previewUrl: uploaded,
              naturalWidth: Math.round(transform.cropWidth),
              naturalHeight: Math.round(transform.cropHeight),
            },
            { at: path }
          );
        });
        if (outcome.status === "committed") closeCrop();
      } finally {
        submission.dispose();
      }
    }
  );

  // ---- 说明 ----
  const openDescEditor = useMemoizedFn(() => {
    if (readOnly) return;
    // 触屏下未选中时点说明只选中图片，避免滚动时误触弹出键盘
    if (touch && !isSelected) {
      touchSelection.select();
      return;
    }
    setShowDescEditor(true);
    setTimeout(() => descRef.current?.focusEnd(), 0);
  });

  const exitDescEditing = useMemoizedFn(() => {
    const value = descRef.current?.getValue() || "";
    if (!value.trim()) setProps({ description: "" });
    setShowDescEditor(false);
  });

  // 菜单命令通过 actionsMap 调用组件内的动作
  useEffect(() => {
    imageActionsMap.set(element, {
      replaceImage: pickReplacement,
      deleteImage,
      startCrop,
      runMediaAction: id => {
        if (!readOnly) setActiveActionId(id);
      },
      showDescEditor: openDescEditor,
      getImageBlob: async () =>
        displayImgRef.current ? imageElementToBlob(displayImgRef.current) : null,
    });
    return () => {
      imageActionsMap.delete(element);
    };
  }, [element, pickReplacement, deleteImage, startCrop, openDescEditor, readOnly]);

  // ---- 选中时的键盘与粘贴：捕获阶段抢在编辑器之前处理 ----
  useEffect(() => {
    if (!isSelected || readOnly) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (cropOpen || shouldIgnoreBlockKey(event, containerRef.current)) return;
      const mod = event.metaKey || event.ctrlKey;
      let handled = true;
      if (!mod && event.key === " ") preview();
      else if (!mod && (event.key === "c" || event.key === "C")) startCrop();
      else if (!mod && event.key === "Enter") openDescEditor();
      else if (!mod && (event.key === "Delete" || event.key === "Backspace")) {
        setIsSelected(false);
        deleteImage();
      } else if (!mod && event.key === "Escape") setIsSelected(false);
      else if (mod && event.key.toLowerCase() === "c" && !window.getSelection()?.toString()) {
        void (async () => {
          const ok = displayImgRef.current ? await copyImageElement(displayImgRef.current) : false;
          if (ok) notifier.success("图片已复制");
          else notifier.error("复制失败：图片来源不允许读取");
        })();
      } else handled = false;
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (cropOpen || isOverlayTarget(target)) return;
      if (!target?.contains?.(containerRef.current) && isTextTarget(target)) return;
      const file = imageFileOf(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      event.stopPropagation();
      void replaceWithFile(file);
    };
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("paste", handlePaste, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("paste", handlePaste, true);
    };
  }, [
    isSelected,
    readOnly,
    cropOpen,
    preview,
    startCrop,
    openDescEditor,
    deleteImage,
    replaceWithFile,
    notifier,
  ]);

  // ---- 尺寸 ----
  const emScale = () => {
    const el = containerRef.current;
    return el ? (parseFloat(getComputedStyle(el).fontSize) || 16) / 16 : 1;
  };

  const handleDisplayImageLoad = useMemoizedFn(() => {
    const img = displayImgRef.current;
    if (!img) return;
    setStatus("loaded");
    const size = { width: img.naturalWidth, height: img.naturalHeight };
    setLoadedSize(size);
    if (readOnly) return;
    const patch: Partial<ImageElement> = {};
    if (naturalWidth !== size.width || naturalHeight !== size.height) {
      patch.naturalWidth = size.width;
      patch.naturalHeight = size.height;
    }
    if (!width) {
      const available = editorContentWidth(containerRef.current) || size.width;
      const initial = Math.min(size.width / (window.devicePixelRatio || 1), available) / emScale();
      patch.width = initial;
      resize.setSize({ width: initial });
    }
    if (Object.keys(patch).length) setProps(patch);
  });

  const aspectWidth = naturalWidth ?? loadedSize?.width;
  const aspectHeight = naturalHeight ?? loadedSize?.height;
  const aspectRatio =
    aspectWidth && aspectHeight ? `${aspectWidth} / ${aspectHeight}` : FALLBACK_ASPECT;

  const resize = useImageResize({
    initialSize: { width },
    emElementRef: containerRef,
    minWidth: 50,
    minHeight: 10,
    aspectRatio: aspectWidth && aspectHeight ? aspectWidth / aspectHeight : undefined,
    onResizeEnd: size => size.width && setProps({ width: size.width }),
    readonly: readOnly,
    keepAspectRatio: true,
    symmetric: align === "center",
    snap: true,
  });

  const currentWidth = resize.size.width ?? width;
  const applyWidthPreset = (ratio: number) => {
    const available = editorContentWidth(containerRef.current);
    if (!available) return;
    const next = (available * ratio) / emScale();
    resize.setSize({ width: next });
    setProps({ width: next });
  };

  useEffect(() => {
    mediaWidthControls.set(element, {
      applyPreset: ratio => {
        if (!readOnly) applyWidthPreset(ratio);
      },
    });
    return () => {
      mediaWidthControls.delete(element);
    };
  });

  const openMore = (anchor: DOMRect) => {
    setMenu({
      position: { x: anchor.left, y: anchor.bottom + 6 },
    });
  };

  // ---- 渲染 ----
  const effectiveBorderRadius = borderRadius ?? appearance?.borderRadius ?? "none";
  const effectiveShadow = shadow ?? appearance?.shadow ?? "none";
  const appearanceStyle = getImageAppearanceStyle({
    borderRadius: effectiveBorderRadius,
    shadow: effectiveShadow,
  });
  const showHandles = !readOnly && isSelected && !touch && status !== "error";
  const busy = uploading;

  const renderPlaceholder = () => {
    if (readOnly) return null;
    return (
      <button
        type="button"
        onClick={() => pickReplacement()}
        className="text-tau-body flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-[12px] border-none bg-[var(--ed-bg-surface)] py-10 text-[var(--ed-text-secondary)] shadow-[0_0_0_1px_var(--ed-border)] transition-colors hover:bg-[var(--ed-bg-hover)]"
      >
        {busy ? (
          <>
            <Spinner className="size-4" />
            图片上传中…
          </>
        ) : (
          "选择图片，或把图片拖到这里"
        )}
      </button>
    );
  };

  const renderFrameContent = () => {
    if (status === "error") {
      return (
        <div className="absolute inset-0 grid place-items-center bg-[var(--ed-bg-sunken)] p-4">
          <div className="flex max-w-full flex-col items-center gap-1.5 text-center">
            <span className="grid size-9 place-items-center rounded-full bg-[var(--ed-bg-surface)] text-[var(--ed-text-secondary)]">
              <ImageOff size={17} />
            </span>
            <span className="text-tau-body font-medium text-[var(--ed-text)]">图片加载失败</span>
            <span className="text-tau-sm line-clamp-2 max-w-[42ch] [font-family:var(--ed-font-mono)] break-all text-[var(--ed-text-tertiary)]">
              {displayUrl}
            </span>
            <span className="mt-1 flex gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                onClick={event => {
                  event.stopPropagation();
                  setStatus("loading");
                  setReloadKey(key => key + 1);
                }}
              >
                重试
              </Button>
              {!readOnly && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={event => {
                    event.stopPropagation();
                    pickReplacement();
                  }}
                >
                  替换图片
                </Button>
              )}
            </span>
          </div>
        </div>
      );
    }
    return (
      <>
        {status === "loading" && (
          <div className="absolute inset-0 animate-pulse bg-[var(--ed-bg-sunken)]" />
        )}
        <ImageSlot
          key={reloadKey}
          ref={displayImgRef}
          url={displayUrl}
          alt={alt}
          crossOrigin="anonymous"
          draggable={false}
          className={cn(
            "absolute inset-0 block h-full w-full object-contain transition-opacity duration-200",
            status === "loaded" ? "opacity-100" : "opacity-0"
          )}
          onLoad={handleDisplayImageLoad}
          onLoadError={() => setStatus("error")}
        />
      </>
    );
  };

  const renderBlock = () => (
    <div
      ref={containerRef}
      className={cn("relative my-0 w-fit max-w-full", MEDIA_ALIGN_CLASS[align])}
      style={{
        // 未存宽度（只读下的老文档）：加载后按原图尺寸，加载前占满一行作占位
        width: currentWidth
          ? `${currentWidth / 16}em`
          : loadedSize
            ? `${loadedSize.width / (window.devicePixelRatio || 1)}px`
            : "100%",
        maxWidth: "100%",
      }}
    >
      {!readOnly && isSelected && !touch && (
        <ImageSelectionToolbar
          align={align}
          activePreset={matchWidthPreset(
            currentWidth ? currentWidth * emScale() : undefined,
            contentWidth
          )}
          actions={imageActions.map(action => ({
            id: action.id,
            label: action.label,
            icon: action.icon,
          }))}
          onAlign={next => setProps({ align: next })}
          onWidthPreset={applyWidthPreset}
          hasDescription={!!description}
          onCrop={startCrop}
          onAction={setActiveActionId}
          onCaption={openDescEditor}
          onMore={openMore}
        />
      )}

      <div className="relative">
        <div
          className={cn(
            "relative overflow-hidden",
            readOnly ? "cursor-zoom-in" : isSelected ? "cursor-default" : "cursor-pointer",
            isSelected && !readOnly && MEDIA_SELECTED_OUTLINE_CLASS
          )}
          style={{ ...appearanceStyle, aspectRatio }}
          onClick={handleFrameClick}
          onDoubleClick={event => {
            event.preventDefault();
            if (!touch) preview();
          }}
          onDragOver={event => {
            if (readOnly || touch || !isSelected || !event.dataTransfer.types.includes("Files"))
              return;
            event.preventDefault();
            event.stopPropagation();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={event => {
            const file = isSelected && !readOnly ? imageFileOf(event.dataTransfer) : null;
            setDragOver(false);
            if (!file) return;
            event.preventDefault();
            event.stopPropagation();
            void replaceWithFile(file);
          }}
        >
          {renderFrameContent()}
          {busy && (
            <div className="text-tau-sm absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-[10px] bg-[var(--ed-bg-surface)] px-3 py-1.5 text-[var(--ed-text-secondary)] shadow-[var(--ed-shadow-float)]">
              <Spinner className="size-3.5" />
              上传中…
            </div>
          )}
          {dragOver && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[var(--ed-accent-soft)] outline-2 -outline-offset-8 outline-[var(--ed-accent)] outline-dashed">
              <span className="text-tau-body rounded-full bg-[var(--ed-bg-surface)] px-3.5 py-1.5 font-semibold text-[var(--ed-accent-text)] shadow-[var(--ed-shadow-float)]">
                松开以替换这张图片
              </span>
            </div>
          )}
        </div>

        {showHandles &&
          RESIZE_HANDLES.map(({ direction, cursor, side }) => (
            <div
              key={direction}
              className={cn(
                side ? MEDIA_SIDE_HANDLE_CLASS : MEDIA_CORNER_HANDLE_CLASS,
                side ? MEDIA_SIDE_POSITION_CLASS[direction] : MEDIA_CORNER_POSITION_CLASS[direction]
              )}
              style={{ cursor }}
              onPointerDown={event => resize.handleResizeStart(event, direction)}
            />
          ))}
        {resize.isResizing && resize.availableWidth > 0 && (
          <div
            className={cn(
              MEDIA_RESIZE_INFO_CLASS,
              resize.snappedPreset != null && "bg-[var(--ed-accent)] text-[var(--ed-text-inverse)]"
            )}
          >
            {Math.round((((resize.size.width || 0) * emScale()) / resize.availableWidth) * 100)}% ·{" "}
            {Math.round((resize.size.width || 0) * emScale())} px
          </div>
        )}
      </div>

      {/* 桌面选中不出占位，避免点选时块高变化；触屏保留占位配合宿主「说明」按钮 */}
      {(showDescEditor || description || (touch && isSelected && !readOnly)) && (
        <div
          data-media-caption="true"
          className="text-tau-sm mt-2 text-center leading-relaxed break-words text-[var(--ed-text-tertiary)]"
        >
          {showDescEditor ? (
            // 编辑与展示同一版式：不加输入框，只有光标，文字位置不动
            <EditText
              ref={instance => {
                descRef.current = instance;
              }}
              // 空内容时占位符绝对定位不占高，min-h 保住一行，聚焦前后高度不变
              className="min-h-[1lh] text-[var(--ed-text-secondary)] caret-[var(--ed-accent)] outline-none"
              defaultValue={description || ""}
              placeholder="添加图片说明…"
              contentEditable={!readOnly}
              defaultFocus
              onChange={value => setProps({ description: value })}
              onBlur={exitDescEditing}
              onPressEnter={exitDescEditing}
              isSlateEditor
            />
          ) : description ? (
            <div
              className={cn(
                !readOnly && "cursor-text transition-colors hover:text-[var(--ed-text-secondary)]"
              )}
              onClick={openDescEditor}
            >
              {description}
            </div>
          ) : (
            <button
              type="button"
              className="cursor-text border-none bg-transparent p-0 text-inherit opacity-70 transition-opacity hover:opacity-100"
              onClick={openDescEditor}
            >
              添加图片说明…
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="relative select-none" contentEditable={false}>
      <div {...attributes}>
        {url ? renderBlock() : renderPlaceholder()}
        {children}
        {!(readOnly && isLast) && <AddParagraph element={element} />}
      </div>

      {menu && (
        <ElementMenu element={element} position={menu.position} onClose={() => setMenu(null)} />
      )}

      <OverlayBackDismiss
        open={Boolean(activeAction) && !readOnly}
        onDismiss={() => setActiveActionId(null)}
      />
      <OverlayBackDismiss open={cropOpen && !readOnly} onDismiss={closeCrop} />
      {activeAction && !readOnly && (
        <activeAction.Modal
          element={element}
          open={activeActionId === activeAction.id}
          onCancel={() => setActiveActionId(null)}
          onApply={patch => setProps(patch as Partial<ImageElement>)}
        />
      )}

      {/* 裁剪过的图：显示的是裁剪结果，另行解析原图地址给编辑器 */}
      {cropOpen && !cropSrc && (
        <ImageSlot
          url={url}
          alt=""
          loading="eager"
          crossOrigin="anonymous"
          className="pointer-events-none fixed top-0 left-0 h-px w-px opacity-0"
          onLoad={event => setCropSrc(event.currentTarget.currentSrc)}
          onLoadError={() => {
            notifier.error("原图加载失败，无法裁剪");
            closeCrop();
          }}
        />
      )}
      {cropOpen && cropSrc && (
        <ImageCropEditor
          imageSrc={cropSrc}
          originalUrl={url}
          initialTransform={element.cropTransform}
          onCancel={closeCrop}
          onConfirm={result => handleCropConfirm(result, cropSession)}
        />
      )}
    </div>
  );
};

export default Image;

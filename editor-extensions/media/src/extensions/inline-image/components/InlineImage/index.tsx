import React, { memo, useEffect, useRef, useState } from "react";
import { RenderElementProps, useSlateStatic, useReadOnly, ReactEditor } from "slate-react";
import { Transforms } from "slate";
import { useMemoizedFn } from "ahooks";
import { cn, mergeRefs } from "@tau/ui";
import { ImageOff } from "lucide-react";

import { InlineChromiumBugfix, getCommandElementPath } from "@tau/editor/api";
import ImageUploader from "../../../../components/ImageUploader";
import type { InlineImageElement } from "../../../../types";
import { useImageResize, ResizeDirection } from "../../../../hooks/useImageResize";
import { useEditorSlots } from "../../../../services/hooks";
import { openImageLightbox } from "../../../../stores";
import {
  MEDIA_CORNER_HANDLE_CLASS,
  MEDIA_CORNER_POSITION_CLASS,
  MEDIA_SELECTED_OUTLINE_CLASS,
} from "../../../../utils/mediaFrameClasses";
import { shouldIgnoreBlockKey } from "../../../../utils/keyboardTarget";

interface InlineImageProps extends RenderElementProps {
  element: InlineImageElement;
}

const RESIZE_HANDLES: { direction: ResizeDirection; cursor: string }[] = [
  { direction: "nw", cursor: "nwse-resize" },
  { direction: "ne", cursor: "nesw-resize" },
  { direction: "se", cursor: "nwse-resize" },
  { direction: "sw", cursor: "nesw-resize" },
];

/**
 * 行内图片：与图片块同一套交互——悬停不出控件，单击选中（圆角描边 + 四角等比缩放把手），
 * 双击进入灯箱；只读下单击直接预览。选中时 Delete / Backspace 删除、Esc 取消。
 */
const InlineImageComponent: React.FC<InlineImageProps> = memo(props => {
  const { attributes, children, element } = props;
  const { url, alt, width, height } = element;
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const { Image } = useEditorSlots();
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLSpanElement>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [isSelected, setIsSelected] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [url]);

  const setProps = useMemoizedFn((patch: Partial<InlineImageElement>) => {
    const path = getCommandElementPath(editor, { element });
    if (path) Transforms.setNodes(editor, patch, { at: path });
  });

  const resize = useImageResize({
    initialSize: { width, height },
    emElementRef: imageRef,
    minWidth: 10,
    minHeight: 10,
    aspectRatio: naturalSize.width / naturalSize.height || 16 / 9,
    onResizeEnd: newSize => {
      if (newSize.width && newSize.height) {
        setProps({ width: newSize.width, height: newSize.height });
      }
    },
    readonly: readOnly,
    keepAspectRatio: true,
  });

  // 首次加载后按原图尺寸（DPR 折算、不超过编辑区）写入宽高
  const handleImageLoad = useMemoizedFn(() => {
    const img = imageRef.current;
    if (!img) return;
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    if (!width && !height && !readOnly) {
      const editorWidth =
        containerRef.current?.closest('[data-slate-editor="true"]')?.clientWidth || 800;
      const imgWidth = Math.min(img.naturalWidth / (window.devicePixelRatio || 1), editorWidth);
      const imgHeight = imgWidth / (img.naturalWidth / img.naturalHeight);
      setProps({ width: imgWidth, height: imgHeight });
      resize.setSize({ width: imgWidth, height: imgHeight });
    }
  });

  useEffect(() => {
    if (!isSelected) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsSelected(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreBlockKey(event, containerRef.current)) return;
      if (event.key === "Escape") {
        setIsSelected(false);
      } else if ((event.key === "Delete" || event.key === "Backspace") && !readOnly) {
        event.preventDefault();
        event.stopPropagation();
        setIsSelected(false);
        try {
          Transforms.removeNodes(editor, { at: ReactEditor.findPath(editor, element) });
        } catch {
          // 节点已被删除
        }
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isSelected, readOnly, editor, element]);

  const handleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (readOnly) openImageLightbox(editor, element);
    else setIsSelected(true);
  };

  return (
    <span
      {...attributes}
      className="relative inline-block"
      contentEditable={false}
      ref={mergeRefs(attributes.ref, containerRef)}
    >
      {url ? (
        <span
          className={cn(
            "relative mx-[2px] my-0 inline-block rounded-[4px] align-text-bottom",
            readOnly ? "cursor-zoom-in" : "cursor-pointer",
            isSelected && !readOnly && MEDIA_SELECTED_OUTLINE_CLASS,
            resize.isResizing && "select-none"
          )}
          style={{
            width: resize.size.width ? `${resize.size.width / 16}em` : "auto",
            height: resize.size.height ? `${resize.size.height / 16}em` : "auto",
          }}
          onClick={handleClick}
          onDoubleClick={event => {
            event.preventDefault();
            openImageLightbox(editor, element);
          }}
        >
          {failed ? (
            <span
              title={`图片加载失败：${url}`}
              className="inline-grid h-full min-h-[1.5em] w-full min-w-[1.5em] place-items-center rounded-[4px] bg-[var(--ed-bg-sunken)] align-bottom text-[var(--ed-text-tertiary)]"
            >
              <ImageOff size="0.9em" />
            </span>
          ) : (
            <Image
              url={url}
              ref={imageRef}
              alt={alt}
              draggable={false}
              className="h-full w-full rounded-[4px] object-contain align-bottom"
              onLoad={handleImageLoad}
              onLoadError={() => setFailed(true)}
            />
          )}
          {!readOnly &&
            isSelected &&
            !failed &&
            RESIZE_HANDLES.map(({ direction, cursor }) => (
              <span
                key={direction}
                className={cn(
                  MEDIA_CORNER_HANDLE_CLASS,
                  MEDIA_CORNER_POSITION_CLASS[direction],
                  "h-[10px] w-[10px]"
                )}
                style={{ cursor }}
                onPointerDown={event => resize.handleResizeStart(event, direction)}
              />
            ))}
          {resize.isResizing && (
            <span className="text-tau-micro pointer-events-none absolute bottom-full left-1/2 z-[3] mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--ed-text)] px-2 py-0.5 tabular-nums text-[var(--ed-text-inverse)] [font-family:var(--ed-font-mono)]">
              {Math.round(resize.size.width || 0)} × {Math.round(resize.size.height || 0)}
            </span>
          )}
        </span>
      ) : !readOnly ? (
        <ImageUploader inline={true} element={element} />
      ) : null}
      <InlineChromiumBugfix />
      {children}
      <InlineChromiumBugfix />
    </span>
  );
});

export default InlineImageComponent;

import React, { memo, useState, useRef, useEffect, forwardRef } from "react";
import { RenderElementProps, useSlateStatic, useReadOnly, ReactEditor } from "slate-react";
import InlineChromiumBugfix from "../../../../components/InlineChromiumBugFix";
import type { InlineImageElement } from "../../../types";
import ImageUploader from "../../../../components/ImageUploader";
import { Transforms, Editor, Element as SlateElement, NodeEntry } from "slate";
import { useUploadResource } from "../../../../hooks/useUploadResource";
import { useImageResize, ResizeDirection } from "../../../../hooks/useImageResize";
import { cn } from "@tau/ui";
import { useMemoizedFn } from "ahooks";
import { useEditorSlots } from "../../../../services";
import { MEDIA_RESIZE_INFO_CLASS } from "../../../../utils/mediaFrameClasses";
interface InlineImageProps extends RenderElementProps {
  element: InlineImageElement;
}

const RESIZE_HANDLES: { direction: ResizeDirection; cursor: string }[] = [
  { direction: "n", cursor: "ns-resize" },
  { direction: "s", cursor: "ns-resize" },
  { direction: "e", cursor: "ew-resize" },
  { direction: "w", cursor: "ew-resize" },
  { direction: "ne", cursor: "nesw-resize" },
  { direction: "nw", cursor: "nwse-resize" },
  { direction: "se", cursor: "nwse-resize" },
  { direction: "sw", cursor: "nesw-resize" },
];

// 边句柄是透明热区（8px 条），四角热区 12px 见方
const RESIZE_HANDLE_POSITION_CLASS: Record<ResizeDirection, string> = {
  n: "left-0 top-0 h-[8px] w-full",
  s: "bottom-0 left-0 h-[8px] w-full",
  e: "right-0 top-0 h-full w-[8px]",
  w: "left-0 top-0 h-full w-[8px]",
  nw: "left-0 top-0 h-[12px] w-[12px]",
  ne: "right-0 top-0 h-[12px] w-[12px]",
  sw: "bottom-0 left-0 h-[12px] w-[12px]",
  se: "bottom-0 right-0 h-[12px] w-[12px]",
};

type InlineLocalImageProps = {
  url: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  onLoad?: () => void;
};

const DefaultInlineInlineImage = forwardRef<HTMLImageElement, InlineLocalImageProps>(
  ({ url, alt, ...rest }, ref) => <img ref={ref} src={url} alt={alt} {...rest} />
);
DefaultInlineInlineImage.displayName = "DefaultInlineImage";

const InlineImageComponent: React.FC<InlineImageProps> = memo(props => {
  const { attributes, children, element } = props;
  const { url, alt, uuid, width, height } = element;
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const uploadResource = useUploadResource();
  const { Image } = useEditorSlots();
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLSpanElement>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [maxWidth, setMaxWidth] = useState(0);

  // 计算编辑器最大宽度
  useEffect(() => {
    const editorEl = containerRef.current?.closest('[contenteditable="true"]');
    if (editorEl) {
      setMaxWidth(editorEl.clientWidth);
    }
  }, []);

  // 更新元素的尺寸属性
  const updateElementSize = useMemoizedFn((widthValue?: number, heightValue?: number) => {
    if (typeof widthValue !== "number" || typeof heightValue !== "number") return;

    const path = ReactEditor.findPath(editor, element);

    Transforms.setNodes(editor, { width: widthValue, height: heightValue }, { at: path });
  });

  // 图片加载完成后获取原始尺寸
  const handleImageLoad = useMemoizedFn(() => {
    if (imageRef.current) {
      const imgNaturalWidth = imageRef.current.naturalWidth;
      const imgNaturalHeight = imageRef.current.naturalHeight;
      const aspectRatio = imgNaturalWidth / imgNaturalHeight;

      setNaturalSize({
        width: imgNaturalWidth,
        height: imgNaturalHeight,
      });

      // 如果没有指定尺寸，使用原始尺寸
      if (!width && !height) {
        const editorWidth =
          containerRef.current?.closest('[data-slate-editor="true"]')?.clientWidth || 0;
        // 处理 DPR 缩放
        const dpr = window.devicePixelRatio || 1;
        const imgWidth = Math.min(imgNaturalWidth / dpr, editorWidth || 800);
        const imgHeight = imgWidth / aspectRatio;

        // 更新元素属性
        updateElementSize(imgWidth, imgHeight);
        // 更新 size 初始值
        resize.setSize({ width: imgWidth, height: imgHeight });
      }
    }
  });

  // 使用 resize hook 处理图片调整大小
  const resize = useImageResize({
    initialSize: { width, height },
    emElementRef: imageRef,
    minWidth: 10,
    maxWidth,
    minHeight: 10,
    aspectRatio: naturalSize.width / naturalSize.height || 16 / 9,
    onResizeEnd: newSize => {
      if (newSize.width && newSize.height) {
        updateElementSize(newSize.width, newSize.height);
      }
    },
    readonly: readOnly,
    keepAspectRatio: true,
  });

  // 图片上传成功时更新节点
  const handleUploadSuccess = useMemoizedFn((uploadedUrl: string) => {
    // 查找当前元素节点路径
    const nodeEntries = Array.from(
      Editor.nodes(editor, {
        at: [],
        match: (n: any) =>
          SlateElement.isElement(n) && n.type === "inline-image" && n.uuid === uuid,
      })
    );

    if (nodeEntries.length > 0) {
      const nodeEntry = nodeEntries[0] as NodeEntry<InlineImageElement>;
      Transforms.setNodes(editor, { url: uploadedUrl }, { at: nodeEntry[1] });
    }
  });

  return (
    <span
      {...attributes}
      className="relative inline-block"
      contentEditable={false}
      ref={containerRef}
    >
      {url ? (
        // 显示图片内容
        <span
          className={cn(
            "relative mx-[2px] my-0 inline-block overflow-hidden rounded-[4px] align-text-bottom",
            resize.isResizing && "pointer-events-none select-none"
          )}
          style={{
            width: resize.size.width ? `${resize.size.width / 16}em` : "auto",
            height: resize.size.height ? `${resize.size.height / 16}em` : "auto",
          }}
        >
          {Image ? (
            <Image
              url={url}
              ref={imageRef}
              alt={alt}
              className="h-full w-full object-contain align-bottom"
              onLoad={handleImageLoad}
            />
          ) : (
            <img
              ref={imageRef}
              src={url}
              alt={alt}
              className="h-full w-full object-contain align-bottom"
              onLoad={handleImageLoad}
            />
          )}
          {!readOnly &&
            RESIZE_HANDLES.map(({ direction, cursor }) => (
              <div
                key={direction}
                className={cn(
                  "absolute z-[2] touch-none bg-transparent",
                  RESIZE_HANDLE_POSITION_CLASS[direction]
                )}
                style={{ cursor }}
                onPointerDown={e => resize.handleResizeStart(e, direction)}
              />
            ))}
          {resize.isResizing && (
            <div className={MEDIA_RESIZE_INFO_CLASS}>
              {Math.round(resize.size.width || 0)} × {Math.round(resize.size.height || 0)}
            </div>
          )}
        </span>
      ) : (
        <ImageUploader
          inline={true}
          onUploadSuccess={handleUploadSuccess}
          uploadResource={uploadResource}
        />
      )}
      <InlineChromiumBugfix />
      {children}
      <InlineChromiumBugfix />
    </span>
  );
});

export default InlineImageComponent;

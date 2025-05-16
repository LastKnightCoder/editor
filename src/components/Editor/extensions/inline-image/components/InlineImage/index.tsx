import React, { memo, useState, useRef, useEffect } from "react";
import {
  RenderElementProps,
  useSlate,
  useReadOnly,
  ReactEditor,
} from "slate-react";
import InlineChromiumBugfix from "@/components/Editor/components/InlineChromiumBugFix";
import { InlineImageElement } from "@/components/Editor/types";
import ImageUploader from "@/components/Editor/components/ImageUploader";
import { Transforms, Editor, Element as SlateElement, NodeEntry } from "slate";
import { useUploadResource } from "@/components/Editor/hooks/useUploadResource";
import {
  useImageResize,
  ResizeDirection,
} from "@/components/Editor/hooks/useImageResize";
import styles from "./index.module.less";
import classnames from "classnames";
import LocalImage from "@/components/LocalImage";
import { useMemoizedFn } from "ahooks";

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

const InlineImageComponent: React.FC<InlineImageProps> = memo((props) => {
  const { attributes, children, element } = props;
  const { url, alt, uuid, width, height } = element;
  const editor = useSlate();
  const readOnly = useReadOnly();
  const uploadResource = useUploadResource();
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
  const updateElementSize = useMemoizedFn(
    (widthValue?: number, heightValue?: number) => {
      if (typeof widthValue !== "number" || typeof heightValue !== "number")
        return;

      const path = ReactEditor.findPath(editor, element);

      Transforms.setNodes(
        editor,
        { width: widthValue, height: heightValue },
        { at: path },
      );
    },
  );

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
          containerRef.current?.closest('[data-slate-editor="true"]')
            ?.clientWidth || 0;
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
    minWidth: 50,
    maxWidth,
    minHeight: 30,
    aspectRatio: naturalSize.width / naturalSize.height || 16 / 9,
    onResizeEnd: (newSize) => {
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
          SlateElement.isElement(n) &&
          n.type === "inline-image" &&
          n.uuid === uuid,
      }),
    );

    if (nodeEntries.length > 0) {
      const nodeEntry = nodeEntries[0] as NodeEntry<InlineImageElement>;
      Transforms.setNodes(editor, { url: uploadedUrl }, { at: nodeEntry[1] });
    }
  });

  return (
    <span
      {...attributes}
      className={classnames(styles.inlineImageContainer)}
      contentEditable={false}
      ref={containerRef}
    >
      {url ? (
        // 显示图片内容
        <span
          className={classnames(styles.container, styles.inline, {
            [styles.resizing]: resize.isResizing,
          })}
          style={{
            width: resize.size.width ? `${resize.size.width}px` : "auto",
            height: resize.size.height ? `${resize.size.height}px` : "auto",
          }}
        >
          <LocalImage
            ref={imageRef}
            src={url}
            alt={alt}
            className={classnames(styles.image)}
            onLoad={handleImageLoad}
          />
          {/* 调整大小的边框处理器 */}
          {!readOnly &&
            RESIZE_HANDLES.map(({ direction, cursor }) => (
              <div
                key={direction}
                className={classnames(
                  styles.resizeHandle,
                  styles[`resize-${direction}`],
                )}
                style={{ cursor }}
                onPointerDown={(e) => resize.handleResizeStart(e, direction)}
              />
            ))}

          {/* 仅在调整大小时显示尺寸信息 */}
          {resize.isResizing && (
            <div className={styles.imageInfo}>
              {Math.round(resize.size.width || 0)} ×{" "}
              {Math.round(resize.size.height || 0)}
            </div>
          )}
        </span>
      ) : (
        // 显示上传界面
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

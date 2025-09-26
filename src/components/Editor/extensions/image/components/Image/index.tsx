import React, { useEffect, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { message, Spin } from "antd";
import { Transforms } from "slate";
import {
  ReactEditor,
  RenderElementProps,
  useSlate,
  useReadOnly,
} from "slate-react";
import {
  DeleteOutlined,
  FullscreenOutlined,
  ScissorOutlined,
  CheckOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import ReactCrop, { Crop, PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";
import { useUploadResource } from "@/components/Editor/hooks/useUploadResource";

import AddParagraph from "@/components/Editor/components/AddParagraph";
import { useImagesOverviewStore } from "@/components/Editor/stores";
import { ImageElement } from "@/components/Editor/types";
import LocalImage from "@/components/LocalImage";

import styles from "./index.module.less";
import classnames from "classnames";
import { MdDragIndicator } from "react-icons/md";
import ImageUploader from "@/components/Editor/components/ImageUploader";
import {
  useImageResize,
  ResizeDirection,
} from "@/components/Editor/hooks/useImageResize";

interface IImageProps {
  attributes: RenderElementProps["attributes"];
  element: ImageElement;
}

const Image: React.FC<React.PropsWithChildren<IImageProps>> = (props) => {
  const { attributes, children, element } = props;
  const {
    url,
    alt = "",
    pasteUploading = false,
    crop,
    previewUrl,
    width,
  } = element;

  const uploadResource = useUploadResource();

  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      element,
    });

  const [uploading, setUploading] = useState(false);

  const editor = useSlate();
  const readOnly = useReadOnly();
  const [isSelected, setIsSelected] = useState(false);

  const { showImageOverview } = useImagesOverviewStore((state) => ({
    showImageOverview: state.showImageOverview,
  }));

  const showOverView = () => {
    showImageOverview(element, editor);
  };

  const deleteImage = () => {
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
  };

  const setLink = (url: string) => {
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
  };

  const [isCropping, setIsCropping] = useState(false);
  const [currentCrop, setCurrentCrop] = useState<Crop>(
    crop || {
      unit: "%",
      width: 30,
      height: 30,
      x: 35,
      y: 35,
    },
  );
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const imgRef = useRef<HTMLImageElement>(null); // 兼容旧引用
  const displayImgRef = useRef<HTMLImageElement>(null); // 用于计算自然尺寸
  const cropImgRef = useRef<HTMLImageElement>(null); // 用于内联裁剪
  const containerRef = useRef<HTMLDivElement>(null);
  const preCropWidthRef = useRef<number | null>(null);

  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [maxWidth, setMaxWidth] = useState<number>(Infinity);

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

  const onImageLoad = () => {
    if (!crop) {
      setCurrentCrop({
        unit: "%",
        width: 30,
        height: 30,
        x: 35,
        y: 35,
      });
    }
  };

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

  const cancelCrop = () => {
    setIsCropping(false);
  };

  const confirmCrop = async () => {
    if ((cropImgRef.current || imgRef.current) && completedCrop) {
      const image = cropImgRef.current || imgRef.current!;
      const canvas = document.createElement("canvas");
      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;
      canvas.width = completedCrop.width * scaleX;
      canvas.height = completedCrop.height * scaleY;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(
          image,
          completedCrop.x * scaleX,
          completedCrop.y * scaleY,
          completedCrop.width * scaleX,
          completedCrop.height * scaleY,
          0,
          0,
          canvas.width,
          canvas.height,
        );

        // 防御性检查，触发一次像素读取来暴露跨域错误，便于提示
        try {
          ctx.getImageData(0, 0, 1, 1);
        } catch (e) {
          console.warn(
            "Canvas tainted, attempting to upload anyway via blob",
            e,
          );
        }

        canvas.toBlob(async (blob) => {
          if (blob && uploadResource) {
            setUploading(true);
            try {
              const file = new File([blob], "cropped.jpg", {
                type: "image/jpeg",
              });
              const uploadRes = await uploadResource(file);
              if (uploadRes) {
                const path = ReactEditor.findPath(editor, element);
                Transforms.setNodes(
                  editor,
                  {
                    crop: currentCrop,
                    previewUrl: uploadRes,
                  },
                  {
                    at: path,
                  },
                );
                // 保持裁剪前的显示宽度不变
                if (preCropWidthRef.current) {
                  updateElementWidth(preCropWidthRef.current);
                  resize.setSize({ width: preCropWidthRef.current });
                }
              } else {
                message.warning("裁剪图片上传失败");
              }
            } catch (error) {
              console.error("裁剪图片上传失败:", error);
              message.error("裁剪图片上传失败");
            } finally {
              setUploading(false);
              setIsCropping(false);
            }
          } else {
            if (!uploadResource) {
              message.warning("尚未配置任何图床，无法上传裁剪图片");
            }
            setIsCropping(false);
          }
        }, "image/jpeg");
      }
    } else {
      setIsCropping(false);
    }
  };

  const renderUpload = () => {
    if (readOnly) {
      return null;
    }
    return (
      <div className={styles.imageUploadContainer}>
        <ImageUploader
          loading={uploading || pasteUploading}
          onUploadSuccess={(url) => {
            setLink(url);
          }}
          uploadResource={uploadResource}
        />
      </div>
    );
  };

  const renderPreview = () => {
    const displayUrl = previewUrl || url;

    return (
      <div
        ref={containerRef}
        className={classnames(styles.imageContainer, {
          [styles.resizing as any]: resize.isResizing,
          [styles.selected as any]: isSelected && !isCropping,
        })}
        style={{
          width: isCropping
            ? "auto"
            : resize.size.width
              ? `${resize.size.width}px`
              : width
                ? `${width}px`
                : "auto",
          maxWidth: "100%",
        }}
      >
        {isCropping ? (
          <Spin spinning={uploading} tip="正在上传裁剪图片...">
            <ReactCrop
              crop={currentCrop}
              onChange={(c) => setCurrentCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              disabled={uploading}
            >
              <LocalImage
                ref={cropImgRef}
                url={url}
                alt={alt}
                style={{ maxWidth: "100%" }}
                onLoad={onImageLoad}
                crossOrigin="anonymous"
              />
            </ReactCrop>
          </Spin>
        ) : (
          <LocalImage
            className={classnames(styles.image, {
              [styles.zoomIn as any]: isSelected,
            })}
            url={displayUrl}
            alt={alt}
            ref={displayImgRef}
            onClick={handleSelect}
            onLoad={handleDisplayImageLoad}
            crossOrigin="anonymous"
          />
        )}
        {!readOnly && isSelected && (
          <>
            {!isCropping &&
              RESIZE_HANDLES.map(({ direction, cursor }) => (
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
        <div className={styles.actions}>
          {!isCropping && (
            <>
              <div onClick={showOverView} className={styles.item}>
                <FullscreenOutlined />
              </div>
              <div className={styles.divider}></div>
              <div
                onClick={() => {
                  const containerWidth = containerRef.current?.clientWidth || 0;
                  const currentDisplayWidth =
                    resize.size.width || width || containerWidth;
                  preCropWidthRef.current = currentDisplayWidth || null;
                  setIsCropping(true);
                }}
                className={styles.item}
              >
                <ScissorOutlined />
              </div>
            </>
          )}
          {isCropping && (
            <>
              <div onClick={confirmCrop} className={styles.item}>
                <CheckOutlined />
              </div>
              <div className={styles.divider}></div>
              <div onClick={cancelCrop} className={styles.item}>
                <CloseOutlined />
              </div>
            </>
          )}
          <div className={styles.divider}></div>
          <div onClick={deleteImage} className={styles.item}>
            <DeleteOutlined />
          </div>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (url) {
      return renderPreview();
    } else {
      return renderUpload();
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
      ref={drop}
      contentEditable={false}
      style={{ userSelect: "none" }}
    >
      <div {...attributes}>
        {renderContent()}
        <div
          contentEditable={false}
          ref={drag}
          className={classnames(styles.dragHandler, {
            [styles.canDrag]: canDrag,
          })}
        >
          <MdDragIndicator className={styles.icon} />
        </div>
        {children}
        <AddParagraph element={element} />
      </div>
      {/* inline crop mode, modal removed */}
    </div>
  );
};

export default Image;

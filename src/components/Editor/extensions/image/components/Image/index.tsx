import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { message, Popover, Spin, Modal, Button } from "antd";
import { Transforms } from "slate";
import {
  ReactEditor,
  RenderElementProps,
  useSlate,
  useReadOnly,
} from "slate-react";
import { useClickAway } from "ahooks";
import {
  DeleteOutlined,
  FileImageOutlined,
  FullscreenOutlined,
  ScissorOutlined,
} from "@ant-design/icons";
import ReactCrop, { Crop, PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";

import AddParagraph from "@/components/Editor/components/AddParagraph";
import { useImagesOverviewStore } from "@/components/Editor/stores";
import { ImageElement } from "@/components/Editor/types";
import LocalImage from "@/components/LocalImage";

import styles from "./index.module.less";
import UploadTab from "../UploadTab";
import classnames from "classnames";
import { MdDragIndicator } from "react-icons/md";
import { EditorContext } from "@editor/index.tsx";

interface IImageProps {
  attributes: RenderElementProps["attributes"];
  element: ImageElement;
}

const Image: React.FC<React.PropsWithChildren<IImageProps>> = (props) => {
  const { attributes, children, element } = props;
  const { url, alt = "", pasteUploading = false, crop, previewUrl } = element;

  const { uploadResource } = useContext(EditorContext) || {};

  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      element,
    });

  const [uploading, setUploading] = useState(false);
  const fileUploadRef = useRef<HTMLInputElement>(null);
  const [showUploadTab, setShowUploadTab] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const editor = useSlate();
  const readOnly = useReadOnly();

  const { showImageOverview } = useImagesOverviewStore((state) => ({
    showImageOverview: state.showImageOverview,
  }));

  useClickAway(() => {
    setShowUploadTab(false);
  }, popoverRef);

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

  const upload = useCallback(() => {
    if (fileUploadRef.current) {
      setShowUploadTab(false);
      fileUploadRef.current.click();
    }
  }, []);

  const setLink = (url: string) => {
    setShowUploadTab(false);
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

  const handleUploadFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files) {
      event.target.value = "";
      return;
    }
    if (!uploadResource) {
      message.warning("尚未配置任何图床，无法上传图片");
      return null;
    }
    const path = ReactEditor.findPath(editor, element);
    const file = files[0];
    const uploadRes = await uploadResource(file);
    if (!uploadRes) {
      setUploading(false);
      event.target.value = "";
      return;
    }
    Transforms.setNodes(
      editor,
      {
        url: uploadRes,
        previewUrl: uploadRes, // 设置预览URL为上传后的URL
      },
      {
        at: path,
      },
    );
    setUploading(false);
    event.target.value = "";
  };

  const [showCropModal, setShowCropModal] = useState(false);
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
  const imgRef = useRef<HTMLImageElement>(null);

  // 当url变化时，重置previewUrl
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

  const onImageLoad = () => {
    // 初始时设置裁剪区域为图片中心的30%，如果已有crop则使用已有的
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

  const cancelCrop = () => {
    setShowCropModal(false);
  };

  const confirmCrop = async () => {
    if (imgRef.current && completedCrop) {
      // 创建裁剪后的预览图
      const image = imgRef.current;
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

        // 将裁剪后的图片上传到服务器
        canvas.toBlob(async (blob) => {
          if (blob && uploadResource) {
            setUploading(true);
            try {
              // 创建文件对象
              const file = new File([blob], "cropped.jpg", {
                type: "image/jpeg",
              });
              // 上传裁剪后的图片
              const uploadRes = await uploadResource(file);
              if (uploadRes) {
                const path = ReactEditor.findPath(editor, element);
                Transforms.setNodes(
                  editor,
                  {
                    crop: currentCrop,
                    previewUrl: uploadRes, // 使用上传后的URL而不是blob URL
                  },
                  {
                    at: path,
                  },
                );
              } else {
                message.warning("裁剪图片上传失败");
              }
            } catch (error) {
              console.error("裁剪图片上传失败:", error);
              message.error("裁剪图片上传失败");
            } finally {
              setUploading(false);
              setShowCropModal(false);
            }
          } else {
            if (!uploadResource) {
              message.warning("尚未配置任何图床，无法上传裁剪图片");
            }
            setShowCropModal(false);
          }
        }, "image/jpeg");
      }
    } else {
      setShowCropModal(false);
    }
  };

  const renderUpload = () => {
    return (
      <div ref={popoverRef} className={styles.uploadContainer}>
        <Spin spinning={uploading || pasteUploading}>
          <Popover
            placement={"bottom"}
            open={showUploadTab}
            content={<UploadTab uploadImage={upload} setLink={setLink} />}
            getPopupContainer={(target) => target.parentNode as HTMLElement}
          >
            <div
              className={styles.content}
              onClick={() => {
                setShowUploadTab(true);
              }}
            >
              <div>
                <FileImageOutlined style={{ fontSize: "32px" }} />
              </div>
              <div className={styles.uploadText}>上传图片</div>
              <input
                ref={fileUploadRef}
                type={"file"}
                accept={"image/*"}
                style={{ display: "none" }}
                onChange={handleUploadFileChange}
              />
            </div>
          </Popover>
        </Spin>
        <div className={styles.actions}>
          <div onClick={deleteImage} className={styles.item}>
            <DeleteOutlined />
          </div>
        </div>
      </div>
    );
  };

  const renderPreview = () => {
    // 确定显示的图片URL，优先使用previewUrl
    const displayUrl = previewUrl || url;

    return (
      <div className={styles.imageContainer}>
        <LocalImage
          className={styles.image}
          url={displayUrl}
          alt={alt}
          onClick={showOverView}
        />
        <div className={styles.actions}>
          <div onClick={showOverView} className={styles.item}>
            <FullscreenOutlined />
          </div>
          <div className={styles.divider}></div>
          <div onClick={() => setShowCropModal(true)} className={styles.item}>
            <ScissorOutlined />
          </div>
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
      <Modal
        title="裁剪图片"
        open={showCropModal}
        onCancel={cancelCrop}
        confirmLoading={uploading}
        footer={[
          <Button key="cancel" onClick={cancelCrop} disabled={uploading}>
            取消
          </Button>,
          <Button
            key="confirm"
            type="primary"
            onClick={confirmCrop}
            loading={uploading}
          >
            确认
          </Button>,
        ]}
        width={800}
      >
        {url && (
          <Spin spinning={uploading} tip="正在上传裁剪图片...">
            <ReactCrop
              crop={currentCrop}
              onChange={(c) => setCurrentCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={16 / 9}
              disabled={uploading}
            >
              <LocalImage
                ref={imgRef}
                url={url} // 裁剪时使用原始URL
                alt={alt}
                style={{ maxWidth: "100%" }}
                onLoad={onImageLoad}
              />
            </ReactCrop>
          </Spin>
        )}
      </Modal>
    </div>
  );
};

export default Image;

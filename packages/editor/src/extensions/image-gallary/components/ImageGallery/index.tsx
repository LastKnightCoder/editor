import { useState } from "react";
import { Transforms } from "slate";
import {
  ReactEditor,
  RenderElementProps,
  useReadOnly,
  useSlateStatic,
} from "slate-react";
import classnames from "classnames";
import { SettingOutlined, PlusOutlined } from "@ant-design/icons";
import { CustomModal } from "@tau/shared";

import useDragAndDrop from "../../../../hooks/useDragAndDrop";
import ImageGallerySetting, { ISetting } from "../ImageGallerySetting";
import { If } from "@tau/shared";
import AddParagraph from "../../../../components/AddParagraph";
import SwipeImageGallery from "../SwipeImageGallery";
import HorizontalImageGallery from "../HorizontalImageGallery";
import VerticalImageGallery from "../VerticalImageGallery";
import useIsLastElement from "../../../../hooks/useIsLastElement";
import type { ImageGalleryElement } from "../../../../types";
import { EGalleryMode } from "../../../../constants";

import styles from "./index.module.less";
import { MdDragIndicator } from "react-icons/md";


interface IImageGalleryProps {
  attributes: RenderElementProps["attributes"];
  element: ImageGalleryElement;
  children: RenderElementProps["children"];
}

const ImageGallery = (props: IImageGalleryProps) => {
  const { attributes, element, children } = props;
  const {
    images,
    height = 200,
    mode,
    wider = false,
    columnCount = 3,
  } = element;
  const isLast = useIsLastElement(element);
  const { drag, drop, isDragging, canDrag, canDrop, isBefore, isOverCurrent } =
    useDragAndDrop({
      element,
    });

  const [settingModalOpen, setSettingModalOpen] = useState(false);
  const [setting, setSetting] = useState<ISetting>({
    mode,
    height,
    images,
  });

  const editor = useSlateStatic();
  const readOnly = useReadOnly();

  const onCancel = () => {
    setSetting({
      mode,
      height,
      images,
      wider,
      columnCount,
    });
    setSettingModalOpen(false);
  };

  const onOk = async () => {
    setSettingModalOpen(false);

    // 对比图片变化，更新资源引用计数
    // @ts-ignore
    const contentId = editor.contentId;
    if (contentId) {
      const oldImages = images || [];
      const newImages = setting.images || [];

      // 找出新增的图片
      const addedImages = newImages.filter(
        (newImg) => !oldImages.some((oldImg) => oldImg.url === newImg.url),
      );

      // 找出删除的图片
      const removedImages = oldImages.filter(
        (oldImg) => !newImages.some((newImg) => newImg.url === oldImg.url),
      );

      // 处理新增的图片
      for (const image of addedImages) {
        if (image.url) {
          try {
            await editor.services?.resource.create({
              name: image.url.split("/").pop() || "未命名图片",
              path: image.url,
              type: "image",
              source: { type: "content", id: contentId },
            });
          } catch (e) {
            console.error("创建图片资源失败:", e);
          }
        }
      }

      // 处理删除的图片
      for (const image of removedImages) {
        if (image.url) {
          try {
            await editor.services?.resource.decrementRef(image.url);
          } catch (e) {
            console.error("减少图片资源引用失败:", e);
          }
        }
      }
    }

    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        ...setting,
      },
      {
        at: path,
      },
    );
  };

  return (
    <div
      ref={drop}
      className={classnames(styles.imageGalleryContainer, {
        [styles.wider]: wider,
        [styles.dragging]: isDragging,
        [styles.drop]: isOverCurrent && canDrop,
        [styles.before]: isBefore,
        [styles.after]: !isBefore,
      })}
    >
      <div {...attributes}>
        <If condition={images.length > 0}>
          <div contentEditable={false}>
            <If condition={mode === EGalleryMode.Horizontal}>
              <HorizontalImageGallery items={images} height={height} />
            </If>
            <If condition={mode === EGalleryMode.Vertical}>
              <VerticalImageGallery items={images} columnCount={columnCount} />
            </If>
            <If condition={mode === EGalleryMode.Inline}>
              <SwipeImageGallery items={images} />
            </If>
          </div>
        </If>
        <If condition={images.length === 0}>
          <div
            contentEditable={false}
            className={styles.emptySetting}
            onClick={() => {
              setSettingModalOpen(true);
            }}
          >
            <div className={styles.uploadTips}>
              <PlusOutlined className={styles.icon} />
              <div>上传图片</div>
            </div>
          </div>
        </If>
        <If condition={!readOnly}>
          <div contentEditable={false} className={styles.actions}>
            <div
              className={styles.item}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSettingModalOpen(true);
              }}
            >
              <SettingOutlined />
            </div>
          </div>
        </If>
        {!(readOnly && isLast) && <AddParagraph element={element} />}
        <CustomModal
          width={720}
          open={settingModalOpen}
          onCancel={onCancel}
          onOk={onOk}
        >
          <ImageGallerySetting setting={setting} onSettingChange={setSetting} />
        </CustomModal>
        {children}
      </div>
      <div
        contentEditable={false}
        ref={drag}
        className={classnames(styles.dragHandler, {
          [styles.canDrag]: canDrag,
        })}
      >
        <MdDragIndicator className={styles.icon} />
      </div>
    </div>
  );
};

export default ImageGallery;

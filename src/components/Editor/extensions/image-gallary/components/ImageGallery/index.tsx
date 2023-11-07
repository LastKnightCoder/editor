import { useState } from 'react';
import { Transforms } from "slate";
import { ReactEditor, RenderElementProps, useReadOnly, useSlate } from "slate-react";
import { Modal } from 'antd';
import classnames from 'classnames';
import { SettingOutlined, PlusOutlined } from '@ant-design/icons';

import ImageGallerySetting, { ISetting } from "../ImageGallerySetting";
import If from "@/components/If";
import AddParagraph from "@/components/Editor/components/AddParagraph";
import SwipeImageGallery from "../SwipeImageGallery";
import HorizontalImageGallery from "../HorizontalImageGallery";
import VerticalImageGallery from "../VerticalImageGallery";

import { EGalleryMode, ImageGalleryElement } from "@/components/Editor/types";

import styles from './index.module.less';

interface IImageGalleryProps {
  attributes: RenderElementProps['attributes'];
  element: ImageGalleryElement;
  children: RenderElementProps['children'];
}

const ImageGallery = (props: IImageGalleryProps) => {
  const { attributes, element, children } = props;
  const { images, height, mode, wider, columnCount } = element;

  const [settingModalOpen, setSettingModalOpen] = useState(false);
  const [setting, setSetting] = useState<ISetting>({
    mode,
    height,
    images
  });

  const editor = useSlate();
  const readOnly = useReadOnly();

  const onCancel = () => {
    setSetting({
      mode,
      height,
      images,
      wider,
      columnCount
    });
    setSettingModalOpen(false);
  }

  const onOk = () => {
    setSettingModalOpen(false);
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, {
      ...setting,
    }, {
      at: path
    });
  }

  return (
    <div
      className={classnames(styles.imageGalleryContainer, { [styles.wider]: wider })}
      {...attributes}
    >
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
        <div contentEditable={false} className={styles.emptySetting} onClick={() => { setSettingModalOpen(true) }}>
          <div className={styles.uploadTips}>
            <PlusOutlined className={styles.icon} />
            <div>上传图片</div>
          </div>
        </div>
      </If>
      <If condition={!readOnly}>
        <div contentEditable={false} className={styles.actions}>
          <div className={styles.item} onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setSettingModalOpen(true);
          }}>
            <SettingOutlined />
          </div>
        </div>
      </If>
      <AddParagraph element={element} />
      <Modal
        width={720}
        open={settingModalOpen}
        onCancel={onCancel}
        onOk={onOk}
      >
        <ImageGallerySetting
          setting={setting}
          onSettingChange={setSetting}
        />
      </Modal>
      {children}
    </div>
  )
}

export default ImageGallery;

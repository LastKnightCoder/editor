import { useState } from 'react';
import { Transforms } from "slate";
import { ReactEditor, RenderElementProps, useSlate, useReadOnly } from "slate-react";
import { Button, Modal } from 'antd';
import { SettingOutlined } from '@ant-design/icons';

import HorizontalImageGallery from "../HorizontalImageGallery";
import ImageGallerySetting, { ISetting } from "../ImageGallerySetting";
import If from "@/components/If";
import AddParagraph from "@/components/Editor/components/AddParagraph";

import { ImageGalleryElement } from "@/components/Editor/types";

import styles from './index.module.less';

interface IImageGalleryProps {
  attributes: RenderElementProps['attributes'];
  element: ImageGalleryElement;
  children: RenderElementProps['children'];
}

const ImageGallery = (props: IImageGalleryProps) => {
  const { attributes, element, children } = props;
  const { images, height, mode } = element;

  const [settingModalOpen, setSettingModalOpen] = useState(false);
  const [setting, setSetting] = useState<ISetting>({
    mode,
    height,
    images
  });
  const [showSetting, setShowSetting] = useState(false);

  const editor = useSlate();
  const readOnly = useReadOnly();

  const onCancel = () => {
    setSetting({
      mode,
      height,
      images
    });
    setSettingModalOpen(false);
  }

  const onOk = () => {
    setSettingModalOpen(false);
    console.log('setting', setting);
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, {
      ...setting,
    }, {
      at: path
    });
  }

  return (
    <div
      onMouseEnter={() => { setShowSetting(true) }}
      onMouseLeave={() => { setShowSetting(false) }}
      className={styles.imageGalleryContainer}
      {...attributes}
    >
      <If condition={images.length > 0}>
        <HorizontalImageGallery items={images} height={height} />
      </If>
      <If condition={images.length === 0}>
        <div className={styles.emptySetting} onClick={() => { setSettingModalOpen(true) }}>
          <SettingOutlined />
        </div>
      </If>
      <If condition={showSetting && !readOnly && images.length > 0}>
        <div contentEditable={false} className={styles.settingButton}>
          <Button onClick={() => { setSettingModalOpen(true) }}>设置</Button>
        </div>
      </If>
      <AddParagraph element={element} />
      <Modal
        width={600}
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

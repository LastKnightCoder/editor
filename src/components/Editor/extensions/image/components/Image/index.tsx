import React, { useCallback, useRef, useState } from 'react';
import { Popover, Spin } from "antd";
import { Transforms } from "slate";
import { ReactEditor, RenderElementProps, useSlate, useReadOnly } from "slate-react";
import { useAsyncEffect, useClickAway } from "ahooks";
import { DeleteOutlined, FileImageOutlined, FullscreenOutlined } from '@ant-design/icons';
import { convertFileSrc } from '@tauri-apps/api/tauri';

import useDragAndDrop from "@/components/Editor/hooks/useDragAndDrop.ts";
import { remoteResourceToLocal } from '@/utils';
import { uploadImage } from "@/hooks/useUploadImage.ts";

import AddParagraph from "@/components/Editor/components/AddParagraph";
import { useImagesOverviewStore } from "@/components/Editor/stores";
import { ImageElement } from "@/components/Editor/types";

import styles from './index.module.less';
import UploadTab from "../UploadTab";
import classnames from "classnames";
import { MdDragIndicator } from "react-icons/md";

interface IImageProps {
  attributes: RenderElementProps['attributes'];
  element: ImageElement;
}

const Image: React.FC<React.PropsWithChildren<IImageProps>> = (props) => {
  const { attributes, children, element } = props;
  const { url, alt = '', pasteUploading = false } = element;

  const {
    drag,
    drop,
    isDragging,
    canDrag,
    canDrop,
    isBefore,
    isOverCurrent,
  } = useDragAndDrop({
    element,
  })

  const [uploading, setUploading] = useState(false);
  const fileUploadRef = useRef<HTMLInputElement>(null);
  const [showUploadTab, setShowUploadTab] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isFileLoading, setIsFileLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState(url);

  useAsyncEffect(async () => {
    setIsFileLoading(true);
    try {
      const localUrl = await remoteResourceToLocal(url);
      const filePath = convertFileSrc(localUrl);
      setPreviewUrl(filePath);
    } finally {
      setIsFileLoading(false);
    }
  }, [url]);

  const editor = useSlate();
  const readOnly = useReadOnly();

  const { showImageOverview } = useImagesOverviewStore(state => ({
    showImageOverview: state.showImageOverview,
  }));

  useClickAway(() => {
    setShowUploadTab(false);
  }, popoverRef);

  const showOverView = () => {
    showImageOverview(element, editor);
  }

  const deleteImage = () => {
    if (readOnly) {
      return;
    }
    const path = ReactEditor.findPath(editor, element);
    Transforms.delete(editor, {
      at: path
    });
    Transforms.insertNodes(editor, {
      type: 'paragraph',
      children: [{ type: 'formatted', text: '' }],
    }, {
      at: path,
      select: true
    });
  }

  const upload = useCallback(() => {
    if (fileUploadRef.current) {
      setShowUploadTab(false);
      fileUploadRef.current.click();
    }
  }, []);

  const setLink = (url: string) => {
    setShowUploadTab(false);
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, {
      url,
    }, {
      at: path
    });
  }

  const handleUploadFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) {
      event.target.value = '';
      return;
    }
    const path = ReactEditor.findPath(editor, element);
    const file = files[0];
    const uploadRes = await uploadImage(file);
    console.log('uploadRes', uploadRes);
    if (!uploadRes) {
      setUploading(false);
      event.target.value = '';
      return;
    }
    Transforms.setNodes(editor, {
      url: uploadRes,
    }, {
      at: path
    });
    setUploading(false);
    event.target.value = '';
  }

  const renderUpload = () => {
    return (
      <div ref={popoverRef} className={styles.uploadContainer}>
        <Spin spinning={uploading || pasteUploading}>
          <Popover
            placement={'bottom'}
            open={showUploadTab}
            content={<UploadTab uploadImage={upload} setLink={setLink} />}
            getPopupContainer={target => target.parentNode as HTMLElement}
          >
            <div className={styles.content} onClick={() => { setShowUploadTab(true) }}>
              <div>
                <FileImageOutlined style={{ fontSize: '32px' }} />
              </div>
              <div className={styles.uploadText}>
                上传图片
              </div>
              <input ref={fileUploadRef} type={'file'} accept={'image/*'} style={{ display: 'none' }} onChange={handleUploadFileChange} />
            </div>
          </Popover>
        </Spin>
        <div className={styles.actions}>
          <div onClick={deleteImage} className={styles.item}>
            <DeleteOutlined />
          </div>
        </div>
      </div>
    )
  }

  const renderPreview = () => {
    return (
      <div className={styles.imageContainer}>
        <img className={styles.image} src={previewUrl} alt={alt} onClick={showOverView}/>
        <div className={styles.actions}>
          <div onClick={showOverView} className={styles.item}>
            <FullscreenOutlined />
          </div>
          <div className={styles.divider}></div>
          <div onClick={deleteImage} className={styles.item}>
            <DeleteOutlined />
          </div>
        </div>
      </div>
    )
  }

  const renderContent = () => {
    if (url) {
      return renderPreview();
    } else {
      return renderUpload();
    }
  }

  if (isFileLoading) {
    return null;
  }

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
      style={{ userSelect: 'none' }}
    >
      <div {...attributes}>
        {children}
      </div>
      {renderContent()}
      <div contentEditable={false} ref={drag} className={classnames(styles.dragHandler, { [styles.canDrag]: canDrag })}>
        <MdDragIndicator className={styles.icon}/>
      </div>
      <AddParagraph element={element} />
    </div>
  )
}

export default Image;
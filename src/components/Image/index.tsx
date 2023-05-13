import React, {useRef} from 'react';
import { FullscreenOutlined, DeleteOutlined, FileImageOutlined } from '@ant-design/icons';

import {ReactEditor, RenderElementProps, useSlate} from "slate-react";
import {ImageElement} from "../../custom-types";

import styles from './index.module.less';
import AddParagraph from "../AddParagraph";
import { Transforms } from "slate";

import { useImagesOverviewStore } from "../../stores";

interface IImageProps {
  attributes: RenderElementProps['attributes'];
  element: ImageElement;
}

const Image: React.FC<React.PropsWithChildren<IImageProps>> = (props) => {
  const { attributes, children, element } = props;
  const { url, alt = '' } = element;

  const fileUploadRef = useRef<HTMLInputElement>(null);

  const editor = useSlate();
  const { showImageOverview } = useImagesOverviewStore(state => ({
    showImageOverview: state.showImageOverview,
  }));

  const showOverView = () => {
    showImageOverview(element, editor);
  }

  const deleteImage = () => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.removeNodes(editor, {
      at: path
    });
    ReactEditor.focus(editor);
  }

  const upload = () => {
    if (fileUploadRef.current) {
      fileUploadRef.current.click();
    }
  }

  const handleUploadFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) {
      return;
    }
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target!.result as string;
      Transforms.setNodes(editor, {
        url
      })
    }
    reader.readAsDataURL(file);
  }

  const renderUpload = () => {
    return (
      <div className={styles.uploadContainer} onClick={upload}>
        <div>
          <FileImageOutlined style={{ fontSize: '32px' }} />
        </div>
        <div className={styles.uploadText}>
          上传图片
        </div>
        <input ref={fileUploadRef} type={'file'} accept={'image/*'} style={{ display: 'none' }} onChange={handleUploadFileChange} />
      </div>
    )
  }

  const renderPreview = () => {
    return (
      <div className={styles.imageContainer}>
        <img className={styles.image} src={url} alt={alt} onClick={showOverView}/>
        <div className={styles.actions}>
          <div onClick={showOverView} className={styles.overview}>
            <FullscreenOutlined />
          </div>
          <div className={styles.divider}></div>
          <div onClick={deleteImage} className={styles.delete}>
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

  return (
    <div contentEditable={false} style={{ userSelect: 'none' }} {...attributes}>
      {children}
      {renderContent()}
      <AddParagraph element={element} />
    </div>
  )
}

export default Image;
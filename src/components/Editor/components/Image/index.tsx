import React, { useRef, useState } from 'react';
import { DeleteOutlined, FileImageOutlined, SettingOutlined, FullscreenOutlined } from '@ant-design/icons';
import AddParagraph from "../AddParagraph";

import { Transforms } from "slate";
import { ReactEditor, RenderElementProps, useSlate, useReadOnly } from "slate-react";
import { v4 as uuid } from 'uuid';

import { useImagesOverviewStore } from "../../stores";
import {replaceGithubUrlToCDNUrl, uploadSingleImage} from "../../utils";
import { ImageElement } from "../../types";

import styles from './index.module.less';
import { Spin } from "antd";
import GithubImageUploadSetting from "./GithubImageUploadSetting";


interface IImageProps {
  attributes: RenderElementProps['attributes'];
  element: ImageElement;
}

const Image: React.FC<React.PropsWithChildren<IImageProps>> = (props) => {
  const { attributes, children, element } = props;
  const { url, alt = '', pasteUploading = false } = element;

  const [uploading, setUploading] = useState(false);
  const fileUploadRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  const editor = useSlate();
  const readOnly = useReadOnly();
  const { showImageOverview } = useImagesOverviewStore(state => ({
    showImageOverview: state.showImageOverview,
  }));

  const showOverView = () => {
    showImageOverview(element, editor);
  }

  const deleteImage = () => {
    if (readOnly) {
      return;
    }
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
    const path = ReactEditor.findPath(editor, element);
    const file = files[0];
    const reader = new FileReader();
    reader.onload = async (ev) => {
      if (!ev.target) {
        return;
      }
      const res = ev.target.result as string;
      let fileName = file.name;
      fileName = fileName.split('.')[0] + '_' + uuid() + '.' + fileName.split('.')[1];
      setUploading(true);
      const uploadRes = await uploadSingleImage(res.split(',')[1], fileName);
      if (!uploadRes) {
        setUploading(false);
        return;
      }
      const { content: { download_url } } = uploadRes as any;
      const cdnUrl = replaceGithubUrlToCDNUrl(download_url);
      Transforms.setNodes(editor, {
        url: cdnUrl,
      }, {
        at: path
      });
      setUploading(false);
    }
    reader.readAsDataURL(file);
  }

  const renderUpload = () => {
    return (
      <div className={styles.uploadContainer}>
        <Spin spinning={uploading || pasteUploading}>
          <div className={styles.content} onClick={upload}>
            <div>
              <FileImageOutlined style={{ fontSize: '32px' }} />
            </div>
            <div className={styles.uploadText}>
              上传图片
            </div>
            <input ref={fileUploadRef} type={'file'} accept={'image/*'} style={{ display: 'none' }} onChange={handleUploadFileChange} />
          </div>
        </Spin>
        <div className={styles.actions}>
          <div onClick={deleteImage} className={styles.item}>
            <DeleteOutlined />
          </div>
          <div className={styles.divider}></div>
          <div className={styles.item} onClick={() => {setOpen(true)}}>
            <SettingOutlined />
          </div>
        </div>
        {
          !readOnly &&
          <GithubImageUploadSetting open={open} onClose={() => {setOpen(false)}} />
        }
      </div>
    )
  }

  const renderPreview = () => {
    return (
      <div className={styles.imageContainer}>
        <img className={styles.image} src={url} alt={alt} onClick={showOverView}/>
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

  return (
    <div contentEditable={false} style={{ userSelect: 'none' }} {...attributes}>
      {children}
      {renderContent()}
      <AddParagraph element={element} />
    </div>
  )
}

export default Image;
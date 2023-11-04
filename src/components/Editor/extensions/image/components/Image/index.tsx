import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Popover, Spin } from "antd";
import { Transforms } from "slate";
import { ReactEditor, RenderElementProps, useSlate, useReadOnly } from "slate-react";
import { useClickAway } from "ahooks";
import { DeleteOutlined, FileImageOutlined, FullscreenOutlined } from '@ant-design/icons';

import useSettingStore from "@/stores/useSettingStore.ts";
import { uploadFileFromFile, transformGithubUrlToCDNUrl } from '@/utils';

import AddParagraph from "@/components/Editor/components/AddParagraph";
import { useImagesOverviewStore } from "@/components/Editor/stores";
import { ImageElement } from "@/components/Editor/types";

import styles from './index.module.less';
import UploadTab from "../UploadTab";

interface IImageProps {
  attributes: RenderElementProps['attributes'];
  element: ImageElement;
}

const Image: React.FC<React.PropsWithChildren<IImageProps>> = (props) => {
  const { attributes, children, element } = props;
  const { url, alt = '', pasteUploading = false } = element;

  const [uploading, setUploading] = useState(false);
  const fileUploadRef = useRef<HTMLInputElement>(null);
  const [showUploadTab, setShowUploadTab] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const editor = useSlate();
  const readOnly = useReadOnly();

  const { showImageOverview } = useImagesOverviewStore(state => ({
    showImageOverview: state.showImageOverview,
  }));
  const { github } = useSettingStore(state => ({
    github: state.setting.imageBed.github,
  }));

  const previewUrl = useMemo(() => {
    return url
      .replace('https://cdn.staticaly.com', 'https://jsd.cdn.zzko.cn')
      .replace('https://cdn.jsdelivr.net', 'https://jsd.cdn.zzko.cn');
  }, [url])

  useClickAway(() => {
    setShowUploadTab(false);
  }, popoverRef);

  useEffect(() => {
    // 这个 CDN 地址失效了，需要替换
    if (url.startsWith('https://cdn.staticaly.com') || url.startsWith("https://cdn.jsdelivr.net")) {
      const path = ReactEditor.findPath(editor, element);
      const replacedUrl = url.replace('https://cdn.staticaly.com', 'https://jsd.cdn.zzko.cn').replace('https://cdn.jsdelivr.net', 'https://jsd.cdn.zzko.cn');
      Transforms.setNodes(editor, {
        url: replacedUrl,
      }, {
        at: path
      });
    }
  }, [url, editor, element]);

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
    Transforms.insertNodes(editor, {
      type: 'paragraph',
      children: [{ type: 'formatted', text: '' }],
    }, {
      at: path
    })
    Transforms.select(editor, path);
    ReactEditor.focus(editor);
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
      return;
    }
    const path = ReactEditor.findPath(editor, element);
    const file = files[0];
    const uploadRes = await uploadFileFromFile(file, github) as any;
    if (!uploadRes) {
      setUploading(false);
      return;
    }
    const { content: { download_url } } = uploadRes;
    const cdnUrl = transformGithubUrlToCDNUrl(download_url, github.branch);
    Transforms.setNodes(editor, {
      url: cdnUrl,
    }, {
      at: path
    });
    setUploading(false);
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

  return (
    <div contentEditable={false} style={{ userSelect: 'none' }} {...attributes}>
      {children}
      {renderContent()}
      <AddParagraph element={element} />
    </div>
  )
}

export default Image;
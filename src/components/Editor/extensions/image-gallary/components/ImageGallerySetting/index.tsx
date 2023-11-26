import React, {useRef, useState} from 'react';
import {motion} from "framer-motion";
import {produce} from 'immer';
import {InputNumber, Select, Space, Spin, Switch} from 'antd';
import {PlusOutlined} from '@ant-design/icons';
import {v4 as getUuid} from 'uuid';

import {EGalleryMode, ImageGalleryItem} from "@/components/Editor/types";
import {transformGithubUrlToCDNUrl, uploadFileFromFile} from "@/utils";
import useSettingStore from "@/stores/useSettingStore.ts";

import ImageItem from "./ImageItem";
import styles from './index.module.less';
import If from "@/components/If";

export interface ISetting {
  mode: EGalleryMode;
  wider?: boolean;
  height?: number;
  columnCount?: number;
  images: ImageGalleryItem[];
}

interface IImageGallerySettingProps {
  setting: ISetting;
  onSettingChange: (setting: ISetting) => void;
}

const ImageGallerySetting = (props: IImageGallerySettingProps) => {
  const { setting, onSettingChange } = props;
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { github } = useSettingStore(state => ({
    github: state.setting.imageBed.github,
  }));

  const onHeightChange = (value: number) => {
    onSettingChange(produce(setting, draft => {
      draft.height = value;
    }))
  }

  const onModeChange = (value: EGalleryMode) => {
    onSettingChange(produce(setting, draft => {
      draft.mode = value;
    }))
  }

  const onWiderChange = (value: boolean) => {
    onSettingChange(produce(setting, draft => {
      draft.wider = value;
    }))
  }

  const onColumnCountChange = (value: number) => {
    onSettingChange(produce(setting, draft => {
      draft.columnCount = value;
    }))
  }

  const onAddImage = (values: ImageGalleryItem[]) => {
    onSettingChange(produce(setting, draft => {
      draft.images = draft.images.concat(values);
    }))
  }

  const onDropImage = (dragImageItem: ImageGalleryItem, dropImageItem: ImageGalleryItem) => {
    onSettingChange(produce(setting, draft => {
      const dragIndex = draft.images.findIndex(item => item.id === dragImageItem.id);
      const dropIndex = draft.images.findIndex(item => item.id === dropImageItem.id);
      console.log(dragIndex, dropIndex);
      if (dragIndex === -1 || dropIndex === -1) {
        return;
      }
      draft.images.splice(dragIndex, 1);
      draft.images.splice(dropIndex, 0, dragImageItem);
    }));
  }

  const uploadFile = async (file: File) => {
    const uploadRes = await uploadFileFromFile(file, github) as any;
    if (!uploadRes) {
      return '';
    }
    const { content: { download_url } } = uploadRes;
    return transformGithubUrlToCDNUrl(download_url, github.branch);
  }

  const handleUploadFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) {
      return;
    }
    setUploading(true);
    const promises: Promise<string>[] = [];
    for (const file of files) {
      promises.push(uploadFile(file));
    }
    const urls = (await Promise.all(promises)).filter(url =>!!url);
    onAddImage(urls.map(url => ({
      id: getUuid(),
      url,
    })));
    setUploading(false);
  }

  const onDeleteImage = (item: ImageGalleryItem) => {
    onSettingChange(produce(setting, draft => {
      draft.images = draft.images.filter(i => i.id !== item.id);
    }))
  }

  return (
    <div className={styles.settingContainer}>
      <div>
        <div className={styles.title}>选择模式</div>
        <Space>
          <div>图片模式：</div>
          <Select
            value={setting.mode}
            onChange={onModeChange}
          >
            <Select.Option value={EGalleryMode.Horizontal}>横向</Select.Option>
            <Select.Option value={EGalleryMode.Vertical}>纵向</Select.Option>
            <Select.Option value={EGalleryMode.Inline}>轮播</Select.Option>
          </Select>
        </Space>
      </div>
      <div className={styles.subContainer}>
        <div className={styles.title}>基础设置</div>
        <If condition={setting.mode === EGalleryMode.Horizontal}>
          <div>
            <Space>
              <div>图片高度：</div>
              <InputNumber
                min={100}
                max={400}
                value={setting.height || 200}
                onChange={value => {
                  if (value) {
                    onHeightChange(value);
                  }
                }}
              />
            </Space>
          </div>
        </If>
        <If condition={setting.mode === EGalleryMode.Vertical}>
          <div>
            <Space>
              <div>列数：</div>
              <InputNumber
                min={2}
                max={5}
                value={setting.columnCount || 3}
                onChange={value => {
                  if(value) {
                    onColumnCountChange(value);
                  }
                }}
              />
            </Space>
          </div>
        </If>
        <div>
          <Space>
            <div>更宽：</div>
            <Switch checked={setting.wider} onChange={onWiderChange} />
          </Space>
        </div>
      </div>
      <div>
        <input ref={uploadRef} type={'file'} multiple accept={'image/*'} style={{ display: 'none' }} onChange={handleUploadFileChange} />
        <div className={styles.title}>图片设置</div>
        <div className={styles.imageListContainer}>
          <div className={styles.uploadImage} onClick={() => {
            if (uploadRef.current) {
              uploadRef.current.click();
            }
          }}>
            <Spin spinning={uploading}>
              <div className={styles.content}>
                <PlusOutlined />
              </div>
            </Spin>
          </div>
          <motion.div className={styles.imageList}>
            {
              setting.images.map(item => (
                <ImageItem
                  imageItem={item}
                  onDelete={onDeleteImage}
                  key={item.id}
                  onDrop={onDropImage}
                />
              ))
            }
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export default ImageGallerySetting;
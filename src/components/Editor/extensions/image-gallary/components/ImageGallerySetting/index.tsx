import React, { useRef, useState, useContext } from "react";
import { motion } from "framer-motion";
import { produce } from "immer";
import {
  InputNumber,
  message,
  Popover,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { v4 as getUuid } from "uuid";

import { ImageGalleryItem } from "@editor/types";
import { EGalleryMode } from "@editor/constants";
import If from "@/components/If";
import { EditorContext } from "@/components/Editor";
import UploadTab from "../../../image/components/UploadTab";
import ImageItem from "./ImageItem";

import styles from "./index.module.less";

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

const timeoutPromise = (ms: number): Promise<never> =>
  new Promise((_resolve, reject) => setTimeout(reject, ms));

const ImageGallerySetting = (props: IImageGallerySettingProps) => {
  const { setting, onSettingChange } = props;
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showUploadTab, setShowUploadTab] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  const { uploadResource } = useContext(EditorContext) || {};

  const onHeightChange = (value: number) => {
    onSettingChange(
      produce(setting, (draft) => {
        draft.height = value;
      }),
    );
  };

  const onModeChange = (value: EGalleryMode) => {
    onSettingChange(
      produce(setting, (draft) => {
        draft.mode = value;
      }),
    );
  };

  const onWiderChange = (value: boolean) => {
    onSettingChange(
      produce(setting, (draft) => {
        draft.wider = value;
      }),
    );
  };

  const onColumnCountChange = (value: number) => {
    onSettingChange(
      produce(setting, (draft) => {
        draft.columnCount = value;
      }),
    );
  };

  const onAddImage = (values: ImageGalleryItem[]) => {
    onSettingChange(
      produce(setting, (draft) => {
        draft.images = draft.images.concat(values);
      }),
    );
  };

  const onDropImage = (
    dragImageItem: ImageGalleryItem,
    dropImageItem: ImageGalleryItem,
  ) => {
    onSettingChange(
      produce(setting, (draft) => {
        const dragIndex = draft.images.findIndex(
          (item) => item.id === dragImageItem.id,
        );
        const dropIndex = draft.images.findIndex(
          (item) => item.id === dropImageItem.id,
        );
        if (dragIndex === -1 || dropIndex === -1) {
          return;
        }
        draft.images.splice(dragIndex, 1);
        draft.images.splice(dropIndex, 0, dragImageItem);
      }),
    );
  };

  const uploadFile = async (file: File) => {
    if (!uploadResource) {
      message.warning("尚未配置任何图床，无法上传图片");
      return null;
    }
    try {
      return await Promise.race([uploadResource(file), timeoutPromise(10000)]);
    } catch (e) {
      return null;
    }
  };

  const handleUploadFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files) {
      return;
    }
    setShowUploadTab(false);
    setUploading(true);
    setTotalCount(files.length);
    setSuccessCount(0);
    setErrorCount(0);

    const promises: Promise<string | null>[] = [];
    for (const file of files) {
      promises.push(uploadFile(file));
    }
    const successUrls: string[] = [];
    for (const promise of promises) {
      promise
        .then((url) => {
          if (url) {
            successUrls.push(url);
            setSuccessCount((successCount) => {
              return successCount + 1;
            });
          } else {
            setErrorCount((errorCount) => {
              return errorCount + 1;
            });
          }
        })
        .catch(() => {
          setErrorCount((errorCount) => {
            return errorCount + 1;
          });
        })
        .finally(() => {
          if (successCount + errorCount === totalCount) {
            if (errorCount > 0) {
              message.error("有部分图片上传失败");
            }
            onAddImage(
              successUrls.map((url) => ({
                id: getUuid(),
                url,
              })),
            );
            setUploading(false);
          }
          event.target.value = "";
        });
    }
  };

  const onDeleteImage = (item: ImageGalleryItem) => {
    onSettingChange(
      produce(setting, (draft) => {
        draft.images = draft.images.filter((i) => i.id !== item.id);
      }),
    );
  };

  return (
    <div className={styles.settingContainer}>
      <div>
        <div className={styles.title}>选择模式</div>
        <Space>
          <div>图片模式：</div>
          <Select value={setting.mode} onChange={onModeChange}>
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
                onChange={(value) => {
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
                onChange={(value) => {
                  if (value) {
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
        <input
          ref={uploadRef}
          type={"file"}
          multiple
          accept={"image/*"}
          style={{ display: "none" }}
          onChange={handleUploadFileChange}
        />
        <div className={styles.title}>
          图片设置：
          {uploading && (
            <>
              <Tag color={"cyan"}>上传中</Tag>
              <Tag color={"success"}>成功：{successCount}</Tag>
              <Tag color={"error"}>失败：{errorCount}</Tag>
              <Tag color={"default"}>总数：{totalCount}</Tag>
            </>
          )}
        </div>
        <div className={styles.imageListContainer}>
          <Popover
            open={showUploadTab}
            onOpenChange={setShowUploadTab}
            trigger={"click"}
            content={
              <UploadTab
                uploadImage={() => {
                  if (uploadRef.current) {
                    uploadRef.current.click();
                  }
                }}
                setLink={(url) => {
                  onAddImage([
                    {
                      id: getUuid(),
                      url,
                    },
                  ]);
                  setShowUploadTab(false);
                }}
              />
            }
          >
            <div
              className={styles.uploadImage}
              onClick={() => setShowUploadTab(true)}
            >
              <Spin spinning={uploading}>
                <div className={styles.content}>
                  <PlusOutlined />
                </div>
              </Spin>
            </div>
          </Popover>
          <motion.div className={styles.imageList}>
            {setting.images.map((item) => (
              <ImageItem
                imageItem={item}
                onDelete={onDeleteImage}
                key={item.id}
                onDrop={onDropImage}
              />
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default ImageGallerySetting;

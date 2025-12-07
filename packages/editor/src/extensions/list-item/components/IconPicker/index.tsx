import React, { useState, useEffect, useRef } from "react";
import { Tabs, Upload, message } from "antd";
import { DeleteOutlined, InboxOutlined } from "@ant-design/icons";
import type { UploadProps } from "antd";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";
import useTheme from "../../../../hooks/useTheme";
import styles from "./index.module.less";

export interface IconPickerProps {
  onEmojiSelect: (emoji: string) => void;
  onImageSelect: (url: string) => void;
  onRemoveIcon?: () => void;
  uploadResource?: (file: File) => Promise<string | undefined>;
  hasIcon?: boolean;
}

const IconPicker: React.FC<IconPickerProps> = ({
  onEmojiSelect,
  onImageSelect,
  onRemoveIcon,
  uploadResource,
  hasIcon = false,
}) => {
  const { isDark } = useTheme();
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState("emoji");
  const uploadTabRef = useRef<HTMLDivElement>(null);

  const handleEmojiSelect = (emojiData: any) => {
    onEmojiSelect(emojiData.native);
  };

  const handleUploadImage = async (file: File) => {
    if (!uploadResource) {
      message.error("上传功能未配置");
      return;
    }

    setUploading(true);
    try {
      const url = await uploadResource(file);
      if (url) {
        onImageSelect(url);
        message.success("上传成功");
      } else {
        message.error("上传失败");
      }
    } catch (error) {
      console.error("上传图片时出错:", error);
      message.error("上传出错");
    } finally {
      setUploading(false);
    }
  };

  const uploadProps: UploadProps = {
    name: "file",
    multiple: false,
    accept: "image/*",
    showUploadList: false,
    beforeUpload: async (file) => {
      // 检查是否为图片文件
      if (!file.type.startsWith("image/")) {
        message.error("请上传图片文件");
        return false;
      }

      await handleUploadImage(file);
      return false; // 阻止默认上传行为
    },
  };

  // 监听粘贴事件
  useEffect(() => {
    if (activeTab !== "upload") return;

    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      // 遍历剪贴板项，查找图片
      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // 检查是否为图片类型
        if (item.type.indexOf("image") !== -1) {
          e.preventDefault();
          const file = item.getAsFile();

          if (file) {
            await handleUploadImage(file);
          }
          break;
        }
      }
    };

    // 添加事件监听
    document.addEventListener("paste", handlePaste);

    // 清理函数
    return () => {
      document.removeEventListener("paste", handlePaste);
    };
  }, [activeTab, uploadResource, onImageSelect]);

  const tabItems = [
    {
      key: "emoji",
      label: "表情",
      children: (
        <div className={styles.emojiTab}>
          <Picker
            data={data}
            theme={isDark ? "dark" : "light"}
            onEmojiSelect={handleEmojiSelect}
            locale="zh"
            previewPosition="none"
            skinTonePosition="none"
            set="native"
          />
        </div>
      ),
    },
    {
      key: "upload",
      label: "上传图片",
      children: (
        <div className={styles.uploadTab} ref={uploadTabRef}>
          <Upload.Dragger {...uploadProps} className={styles.uploadDragger}>
            <p className={styles.uploadIcon}>
              <InboxOutlined />
            </p>
            <p className={styles.uploadText}>
              {uploading ? "上传中..." : "点击或拖拽图片到此处"}
            </p>
            <p className={styles.uploadHint}>
              支持 JPG、PNG、GIF 等格式，也可直接粘贴
            </p>
          </Upload.Dragger>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.iconPicker}>
      <Tabs
        defaultActiveKey="emoji"
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        centered
      />
      {hasIcon && onRemoveIcon && (
        <div className={styles.removeButtonContainer}>
          <button className={styles.removeButton} onClick={onRemoveIcon}>
            <DeleteOutlined className={styles.removeIcon} />
            <span>移除图标</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default IconPicker;

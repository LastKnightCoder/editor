import React, { useCallback, useRef, useState } from "react";
import {
  InboxOutlined,
  UploadOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import { message, Button, Spin, Tabs, TabsProps, Input, Popover } from "antd";
import classnames from "classnames";

import styles from "./index.module.less";
import useTheme from "../../hooks/useTheme";

interface ImageUploaderProps {
  /**
   * 是否为行内图片模式
   */
  inline?: boolean;
  /**
   * 图片加载中状态
   */
  loading?: boolean;
  /**
   * 上传成功回调
   */
  onUploadSuccess: (url: string) => void;
  /**
   * 上传失败回调
   */
  onUploadFailed?: () => void;
  /**
   * 图片上传函数，外部提供
   */
  uploadResource?: (file: File) => Promise<string | null>;
}

/**
 * 图片上传组件，只处理上传功能，不包含显示逻辑
 */
const ImageUploader: React.FC<ImageUploaderProps> = ({
  inline = false,
  loading = false,
  onUploadSuccess,
  onUploadFailed,
  uploadResource,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [popoverVisible, setPopoverVisible] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const { isDark } = useTheme();

  // 处理文件选择
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0 || !uploadResource) return;

      const file = files[0];
      // 检查是否为图片文件
      if (!file.type.startsWith("image/")) {
        message.error("请上传图片文件");
        return;
      }

      try {
        const uploadedUrl = await uploadResource(file);
        if (uploadedUrl) {
          onUploadSuccess(uploadedUrl);
          setPopoverVisible(false);
        } else {
          message.error("图片上传失败");
          onUploadFailed?.();
        }
      } catch (error) {
        console.error("上传图片时出错:", error);
        message.error("图片上传出错");
        onUploadFailed?.();
      }

      // 清空input，允许再次选择同一文件
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [onUploadSuccess, onUploadFailed, uploadResource],
  );

  // 处理文件上传逻辑
  const handleUploadFile = useCallback(
    async (file: File) => {
      if (!uploadResource) return;

      if (!file.type.startsWith("image/")) {
        message.error("请上传图片文件");
        return;
      }

      try {
        const uploadedUrl = await uploadResource(file);
        if (uploadedUrl) {
          onUploadSuccess(uploadedUrl);
          setPopoverVisible(false);
        } else {
          message.error("图片上传失败");
          onUploadFailed?.();
        }
      } catch (error) {
        console.error("上传图片时出错:", error);
        message.error("图片上传出错");
        onUploadFailed?.();
      }
    },
    [onUploadSuccess, onUploadFailed, uploadResource],
  );

  // 触发文件选择对话框
  const triggerFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // 处理网络图片链接
  const handleLinkConfirm = useCallback(() => {
    if (linkValue.trim()) {
      onUploadSuccess(linkValue.trim());
      setLinkValue("");
      setPopoverVisible(false);
    } else {
      message.error("请输入有效的图片链接");
    }
  }, [linkValue, onUploadSuccess]);

  // 处理拖拽相关事件
  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleUploadFile(files[0]);
      }
    },
    [handleUploadFile],
  );

  // 通用标签页配置
  const tabItems: TabsProps["items"] = [
    {
      key: "upload",
      label: "本地上传",
      children: (
        <div className={styles.uploadTabContent}>
          <div
            className={classnames(styles.uploadArea, {
              [styles.dragging]: isDragging,
              [styles.dark]: isDark,
            })}
            onClick={triggerFileSelect}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <InboxOutlined className={styles.uploadIcon} />
            <p className={styles.uploadText}>点击或拖拽图片到此处上传</p>
          </div>
        </div>
      ),
    },
    {
      key: "link",
      label: "网络图片",
      children: (
        <div className={styles.linkTabContent}>
          <Input
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            placeholder="请输入网络图片地址"
          />
          <Button className={styles.confirmButton} onClick={handleLinkConfirm}>
            确定
          </Button>
        </div>
      ),
    },
  ];

  // 内联模式的标签页配置
  const inlineTabItems: TabsProps["items"] = [
    {
      key: "upload",
      label: "本地上传",
      children: (
        <div className={styles.uploadTabContent}>
          <div
            className={classnames(styles.inlineUploadArea, {
              [styles.dragging]: isDragging,
              [styles.dark]: isDark,
            })}
            onClick={triggerFileSelect}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <InboxOutlined className={styles.inlineUploadIcon} />
            <p className={styles.inlineUploadText}>点击或拖拽图片</p>
          </div>
        </div>
      ),
    },
    {
      key: "link",
      label: "网络图片",
      children: (
        <div className={styles.linkTabContent}>
          <Input
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            placeholder="请输入网络图片地址"
          />
          <Button className={styles.confirmButton} onClick={handleLinkConfirm}>
            确定
          </Button>
        </div>
      ),
    },
  ];

  // 显示上传界面或加载中状态
  if (inline) {
    // 行内模式简化界面
    const inlinePopoverContent = (
      <div className={styles.inlinePopoverContent}>
        <Tabs
          defaultActiveKey="upload"
          items={inlineTabItems}
          className={styles.inlineTabs}
        />
      </div>
    );

    return (
      <div
        className={classnames(
          styles.container,
          styles.uploaderContainer,
          styles.inline,
          {
            [styles.dark]: isDark,
          },
        )}
      >
        {loading ? (
          <LoadingOutlined spin />
        ) : (
          <div className={styles.inlineActions}>
            <Popover
              content={inlinePopoverContent}
              title="上传图片"
              trigger="click"
              open={popoverVisible}
              onOpenChange={setPopoverVisible}
              overlayClassName={classnames(styles.inlinePopover, {
                [styles.darkPopover]: isDark,
              })}
            >
              <Button
                type="text"
                icon={<UploadOutlined />}
                size="small"
                className={styles.inlineButton}
              >
                上传图片
              </Button>
            </Popover>
          </div>
        )}
      </div>
    );
  }

  // 块级图片上传界面
  return (
    <div
      className={classnames(styles.container, styles.uploaderContainer, {
        [styles.dark]: isDark,
      })}
    >
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      {loading ? (
        <Spin tip="上传中..." />
      ) : (
        <Tabs
          defaultActiveKey="upload"
          items={tabItems}
          className={styles.tabs}
        />
      )}
    </div>
  );
};

export default ImageUploader;

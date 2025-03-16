import React, { useState, useRef, useEffect } from "react";
import { message, Tooltip } from "antd";
import {
  PictureOutlined,
  DragOutlined,
  CheckOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import LocalImage from "@/components/LocalImage";
import { selectFile, readBinaryFile } from "@/commands";
import { uploadResource } from "@/hooks/useUploadResource";
import styles from "./index.module.less";

interface CoverEditorProps {
  coverUrl: string;
  coverPosition: string;
  onCoverChange: (url: string, position: string) => void;
}

const CoverEditor: React.FC<CoverEditorProps> = ({
  coverUrl,
  coverPosition,
  onCoverChange,
}) => {
  const [isDragMode, setIsDragMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialMouseYRef = useRef<number>(0);
  const initialPositionRef = useRef<number>(0);

  // 初始化时和coverPosition变化时更新dragPosition
  useEffect(() => {
    // 解析当前位置
    if (coverPosition === "top") {
      setDragPosition(0);
    } else if (coverPosition === "bottom") {
      setDragPosition(100);
    } else if (coverPosition === "center") {
      setDragPosition(50);
    } else {
      // 解析当前位置，如果是百分比值
      const match = coverPosition.match(/(\d+)%/);
      if (match) {
        setDragPosition(parseInt(match[1], 10));
      } else {
        setDragPosition(50);
      }
    }
  }, [coverPosition]);

  // 处理上传图片
  const handleUploadClick = useMemoizedFn(async () => {
    try {
      const filePaths = await selectFile({
        properties: ["openFile"],
        filters: [
          { name: "图片", extensions: ["jpg", "jpeg", "png", "gif", "webp"] },
        ],
      });

      // 用户取消选择文件，直接返回，不显示错误
      if (!filePaths || filePaths.length === 0) return;

      const filePath = filePaths[0];
      const fileData = await readBinaryFile(filePath);
      const file = new File(
        [fileData],
        filePath.split("/").pop() || "image.png",
        {
          type: "image/png",
        },
      );

      // 创建一个loading消息，并获取其唯一key
      const loadingKey = "uploadCoverLoading";
      message.loading({ content: "正在上传图片...", key: loadingKey });

      try {
        const url = await uploadResource(file);
        if (url) {
          // 上传成功，关闭loading并显示成功消息
          message.success({
            content: "上传成功",
            key: loadingKey,
            duration: 2,
          });
          onCoverChange(url, coverPosition);
        } else {
          // 上传失败，关闭loading并显示错误消息
          message.error({ content: "上传失败", key: loadingKey, duration: 2 });
        }
      } catch (uploadError) {
        // 上传过程中出错，关闭loading并显示错误消息
        message.error({ content: "上传失败", key: loadingKey, duration: 2 });
        console.error("上传图片失败:", uploadError);
      }
    } catch (error) {
      // 只有在读取文件等操作出错时才显示错误
      console.error("处理图片失败:", error);
    }
  });

  // 切换拖动模式
  const handleToggleDragMode = useMemoizedFn(() => {
    if (isDragMode) {
      return;
    }

    // 进入拖动模式
    setIsDragMode(true);
    // 不需要重置dragPosition，使用当前的值
  });

  // 开始拖动
  const handleDragStart = useMemoizedFn((e: React.MouseEvent) => {
    if (!isDragMode || !containerRef.current) return;

    e.preventDefault();
    setIsDragging(true);

    // 记录初始鼠标位置和初始拖拽位置
    initialMouseYRef.current = e.clientY;
    initialPositionRef.current = dragPosition;
  });

  // 拖动中
  const handleDragMove = useMemoizedFn((e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    e.preventDefault();
    const containerRect = containerRef.current.getBoundingClientRect();
    const containerHeight = containerRect.height;

    // 计算鼠标移动的距离（相对于初始位置）
    const deltaY = initialMouseYRef.current - e.clientY;

    // 将移动距离转换为百分比变化
    const deltaPercent = (deltaY / containerHeight) * 100;

    // 基于初始位置计算新位置
    let newPosition = initialPositionRef.current + deltaPercent;

    // 限制在0-100之间
    newPosition = Math.max(0, Math.min(100, newPosition));
    setDragPosition(newPosition);
  });

  // 结束拖动
  const handleDragEnd = useMemoizedFn(() => {
    if (!isDragging) return;
    setIsDragging(false);
  });

  // 确认拖动结果
  const handleConfirm = useMemoizedFn(() => {
    if (!isDragMode) return;

    // 将百分比位置转换为position值
    let newPosition;
    if (dragPosition <= 20) {
      newPosition = "top";
    } else if (dragPosition >= 80) {
      newPosition = "bottom";
    } else {
      newPosition = `${Math.round(dragPosition)}%`;
    }

    onCoverChange(coverUrl, newPosition);
    setIsDragMode(false);
  });

  // 取消拖动
  const handleCancel = useMemoizedFn(() => {
    setIsDragMode(false);
  });

  return (
    <div
      ref={containerRef}
      className={styles.coverEditorContainer}
      onMouseMove={handleDragMove}
      onMouseUp={handleDragEnd}
      onMouseLeave={handleDragEnd}
      style={{ cursor: isDragging ? "grabbing" : "default" }}
    >
      {isDragMode && (
        <div className={styles.dragOverlay} onMouseDown={handleDragStart}>
          <div className={styles.dragPreview}>
            <LocalImage
              url={
                coverUrl ||
                "https://cdn.jsdelivr.net/gh/LastKnightCoder/ImgHosting2/20210402153806.png"
              }
              className={styles.previewImg}
              style={{ objectPosition: `center ${dragPosition}%` }}
            />
          </div>
          <div className={styles.dragActions}>
            <div className={styles.actionButton} onClick={handleConfirm}>
              <CheckOutlined />
            </div>
            <div className={styles.actionButton} onClick={handleCancel}>
              <CloseOutlined />
            </div>
          </div>
        </div>
      )}

      <div className={styles.coverEditIcons}>
        <Tooltip title="更换封面">
          <div className={styles.coverEditIcon} onClick={handleUploadClick}>
            <PictureOutlined />
          </div>
        </Tooltip>
        <Tooltip title="调整位置">
          <div
            className={`${styles.coverEditIcon} ${isDragMode ? styles.active : ""}`}
            onClick={handleToggleDragMode}
          >
            <DragOutlined />
          </div>
        </Tooltip>
      </div>
    </div>
  );
};

export default CoverEditor;

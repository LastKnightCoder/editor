import React, {
  useState,
  useCallback,
  memo,
  useMemo,
  useRef,
  useEffect,
} from "react";
import PortalToBody from "../PortalToBody";
import LocalImage from "../LocalImage";
import { IoClose } from "react-icons/io5";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";

import styles from "./index.module.less";

export interface ImageGalleryProps {
  // 图片数组
  images: string[];
  // 是否显示
  open: boolean;
  // 关闭回调
  onClose: () => void;
  // 默认显示的图片索引
  defaultIndex?: number;
  // 主题，可选 'light' 或 'dark'
  theme?: "light" | "dark";
}

const ImageGallery = memo(
  ({ images, open, onClose, defaultIndex = 0, theme }: ImageGalleryProps) => {
    // 当前显示的图片索引
    const [currentIndex, setCurrentIndex] = useState(defaultIndex);
    // 缩略图容器引用
    const thumbnailWrapperRef = useRef<HTMLDivElement>(null);
    // 计算每个缩略图的尺寸（包含间距）
    const thumbnailSize = 90; // 缩略图宽度(80px) + 间距(10px)
    // 可显示的缩略图数量
    const [visibleThumbnailCount, setVisibleThumbnailCount] = useState(7);

    // 重置当前索引当组件重新打开时
    useEffect(() => {
      if (open) {
        setCurrentIndex(defaultIndex);
      }
    }, [open, defaultIndex]);

    // 计算可见的缩略图数量，根据容器宽度
    useEffect(() => {
      if (!thumbnailWrapperRef.current || !open) return;

      const calculateVisibleCount = () => {
        const containerWidth = thumbnailWrapperRef.current?.clientWidth || 0;
        const count = Math.floor(containerWidth / thumbnailSize);
        setVisibleThumbnailCount(Math.max(count, 3)); // 至少显示3个
      };

      calculateVisibleCount();

      // 监听窗口大小变化
      const handleResize = () => {
        calculateVisibleCount();
      };

      window.addEventListener("resize", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }, [open]);

    // 禁止滚动背景页面
    useEffect(() => {
      if (open) {
        // 禁用背景滚动
        document.body.style.overflow = "hidden";
      } else {
        // 恢复背景滚动
        document.body.style.overflow = "";
      }

      return () => {
        // 组件卸载时恢复滚动
        document.body.style.overflow = "";
      };
    }, [open]);

    // 选择图片的回调函数
    const handleSelectImage = useCallback(
      (index: number, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setCurrentIndex(index);
      },
      [],
    );

    // 关闭的回调函数
    const handleClose = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      },
      [onClose],
    );

    // 背景点击关闭
    const handleOverlayClick = useCallback(
      (e: React.MouseEvent) => {
        // 只有当点击的是背景层时才关闭
        if (e.target === e.currentTarget) {
          onClose();
        }
      },
      [onClose],
    );

    // 切换到下一张图片
    const handleNext = useCallback(
      (e?: React.MouseEvent) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
      },
      [images.length],
    );

    // 切换到上一张图片
    const handlePrev = useCallback(
      (e?: React.MouseEvent) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        setCurrentIndex(
          (prevIndex) => (prevIndex - 1 + images.length) % images.length,
        );
      },
      [images.length],
    );

    // 键盘导航事件处理
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "ArrowRight") {
          handleNext();
        } else if (e.key === "ArrowLeft") {
          handlePrev();
        } else if (e.key === "Escape") {
          onClose();
        }
      },
      [handleNext, handlePrev, onClose],
    );

    // 计算显示的缩略图索引，优化性能
    const thumbnailIndices = useMemo(() => {
      if (images.length <= visibleThumbnailCount) {
        // 如果图片总数小于等于最大显示数，则显示所有图片
        return Array.from({ length: images.length }, (_, i) => i);
      }

      // 确保当前图片在缩略图中间位置
      const mid = Math.floor(visibleThumbnailCount / 2);

      if (currentIndex <= mid) {
        // 当前图片靠近开始位置
        return Array.from({ length: visibleThumbnailCount }, (_, i) => i);
      } else if (currentIndex >= images.length - mid - 1) {
        // 当前图片靠近结束位置
        return Array.from(
          { length: visibleThumbnailCount },
          (_, i) => images.length - visibleThumbnailCount + i,
        );
      } else {
        // 当前图片在中间
        return Array.from(
          { length: visibleThumbnailCount },
          (_, i) => currentIndex - mid + i,
        );
      }
    }, [currentIndex, images.length, visibleThumbnailCount]);

    if (!open || images.length === 0) {
      return null;
    }

    // 应用主题类
    const themeClass = theme ? styles[theme] : "";

    return (
      <PortalToBody>
        <div
          className={`${styles.galleryOverlay} ${themeClass}`}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onClick={handleOverlayClick}
        >
          <div className={styles.galleryContainer}>
            <button className={styles.closeButton} onClick={handleClose}>
              <IoClose />
            </button>

            <div className={styles.mainImageContainer}>
              <div className={styles.mainImage}>
                <LocalImage
                  url={images[currentIndex]}
                  alt={`Gallery image ${currentIndex + 1}`}
                />
              </div>
            </div>

            <button
              className={`${styles.navButton} ${styles.prevButton}`}
              onClick={handlePrev}
            >
              <LeftOutlined />
            </button>

            <button
              className={`${styles.navButton} ${styles.nextButton}`}
              onClick={handleNext}
            >
              <RightOutlined />
            </button>

            <div className={styles.thumbnailContainer}>
              <div
                className={styles.thumbnailWrapper}
                ref={thumbnailWrapperRef}
              >
                {thumbnailIndices.map((index) => (
                  <div
                    key={index}
                    className={`${styles.thumbnail} ${currentIndex === index ? styles.active : ""}`}
                    onClick={(e) => handleSelectImage(index, e)}
                  >
                    <LocalImage
                      url={images[index]}
                      alt={`Thumbnail ${index + 1}`}
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </PortalToBody>
    );
  },
);

// 提供显示名称便于调试
ImageGallery.displayName = "ImageGallery";

export default ImageGallery;

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageGallery } from "@tau/shared";
import useTheme from "../../../../hooks/useTheme";
import type {
  ImageBorderRadiusPreset,
  ImageGalleryItem,
  LastRowMode,
  ImageShadowPreset,
} from "../../../../types";
import {
  calculateLayout,
  toImageDimension,
  DEFAULT_CONFIG,
  type ImageDimension,
} from "./layoutCalculator";
import { getImageAppearanceStyle } from "../../../image/utils/appearance";
import { useEditorSlots } from "../../../../services";

interface IHorizontalImageGalleryProps {
  items: ImageGalleryItem[];
  height?: number;
  margins?: number;
  lastRow?: LastRowMode;
  borderRadius?: ImageBorderRadiusPreset;
  shadow?: ImageShadowPreset | boolean;
  onUpdateDimensions?: (items: ImageGalleryItem[]) => void;
}

const HorizontalImageGallery = (props: IHorizontalImageGalleryProps) => {
  const {
    items,
    height = DEFAULT_CONFIG.rowHeight,
    margins = DEFAULT_CONFIG.margins,
    lastRow = DEFAULT_CONFIG.lastRow,
    borderRadius = "none",
    shadow = false,
    onUpdateDimensions,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [showGallery, setShowGallery] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [dimensions, setDimensions] = useState<Map<string, ImageDimension>>(new Map());

  const { theme } = useTheme();
  const { Image: CustomImage } = useEditorSlots();

  // 监听容器宽度变化
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(containerRef.current);
    setContainerWidth(containerRef.current.offsetWidth);

    return () => observer.disconnect();
  }, []);

  // 加载图片尺寸
  useEffect(() => {
    const newDimensions = new Map<string, ImageDimension>();
    const needsUpdate: ImageGalleryItem[] = [];

    items.forEach(item => {
      // 优先使用已存储的尺寸
      if (item.width && item.height) {
        newDimensions.set(item.id, toImageDimension(item, true));
        return;
      }

      // 检查是否已经加载过
      const existing = dimensions.get(item.id);
      if (existing?.loaded) {
        newDimensions.set(item.id, existing);
        return;
      }

      // 需要动态加载
      newDimensions.set(item.id, toImageDimension(item, false));

      const img = new Image();
      img.onload = () => {
        setDimensions(prev => {
          const next = new Map(prev);
          const dimension: ImageDimension = {
            id: item.id,
            url: item.url,
            desc: item.desc,
            width: img.naturalWidth,
            height: img.naturalHeight,
            aspectRatio: img.naturalWidth / img.naturalHeight,
            loaded: true,
          };
          next.set(item.id, dimension);
          return next;
        });

        // 收集需要更新的项目
        needsUpdate.push({
          ...item,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });

        // 延迟调用回调，避免频繁更新
        if (onUpdateDimensions && needsUpdate.length > 0) {
          requestAnimationFrame(() => {
            const updatedItems = items.map(i => {
              const updated = needsUpdate.find(u => u.id === i.id);
              return updated || i;
            });
            onUpdateDimensions(updatedItems);
          });
        }
      };

      img.onerror = () => {
        setDimensions(prev => {
          const next = new Map(prev);
          next.set(item.id, {
            ...toImageDimension(item, false),
            loaded: false,
          });
          return next;
        });
      };

      img.src = item.url;
    });

    setDimensions(newDimensions);
  }, [items]);

  // 获取尺寸数组
  const dimensionsArray = useMemo(() => {
    return items.map(item => {
      const dim = dimensions.get(item.id);
      if (dim) return dim;
      return toImageDimension(item, false);
    });
  }, [items, dimensions]);

  // 计算布局
  const layout = useMemo(() => {
    if (containerWidth <= 0) {
      return { items: [], totalHeight: 0 };
    }
    return calculateLayout(dimensionsArray, containerWidth, {
      rowHeight: height,
      margins,
      lastRow,
      justifyThreshold: DEFAULT_CONFIG.justifyThreshold,
    });
  }, [dimensionsArray, containerWidth, height, margins, lastRow]);

  // 全屏浏览的图片列表
  const galleryImages = useMemo(() => items.map(item => item.url), [items]);

  // 点击图片处理
  const handleImageClick = useCallback((index: number) => {
    setGalleryIndex(index);
    setShowGallery(true);
  }, []);

  // 检查是否所有图片都已加载
  const allLoaded = dimensionsArray.every(d => d.loaded);
  const itemAppearanceStyle = useMemo(
    () => getImageAppearanceStyle({ borderRadius, shadow }),
    [borderRadius, shadow]
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ height: layout.totalHeight > 0 ? layout.totalHeight : "auto" }}
    >
      {layout.items.map((item, index) => (
        <div
          key={item.id}
          className="absolute cursor-pointer overflow-hidden"
          style={{
            width: item.width,
            height: item.height,
            top: item.top,
            left: item.left,
            ...itemAppearanceStyle,
          }}
          onClick={() => handleImageClick(index)}
        >
          {CustomImage ? (
            <CustomImage
              url={item.url}
              alt={item.desc || ""}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center",
              }}
            />
          ) : (
            <img
              src={item.url}
              alt={item.desc || ""}
              className="h-full w-full object-cover object-center"
              loading="lazy"
            />
          )}
        </div>
      ))}

      {/* 加载占位符 */}
      {!allLoaded && layout.items.length === 0 && (
        <div className="flex h-48 items-center justify-center text-gray-400">Loading images...</div>
      )}

      {/* 全屏浏览 */}
      <ImageGallery
        images={galleryImages}
        open={showGallery}
        onClose={() => setShowGallery(false)}
        defaultIndex={galleryIndex}
        theme={theme}
      />
    </div>
  );
};

export default HorizontalImageGallery;

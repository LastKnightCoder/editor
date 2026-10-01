import { useEffect, useMemo, useRef, useState } from "react";
import { ImageGallery } from "@tau/shared";
import { useEditorTheme as useTheme } from "@tau/editor/api";
import {
  ImageBorderRadiusPreset,
  ImageGalleryItem,
  ImageShadowPreset,
} from "../../../../types/index";
import {
  calculateMasonryLayout,
  toImageDimension,
  ImageDimension,
  DEFAULT_MASONRY_CONFIG,
} from "./masonryCalculator";
import { getImageAppearanceStyle } from "../../../image/utils/appearance";
import { useEditorSlots } from "../../../../services/hooks";

interface IVerticalImageGalleryProps {
  items: ImageGalleryItem[];
  columnCount?: number;
  gap?: number;
  borderRadius?: ImageBorderRadiusPreset;
  shadow?: ImageShadowPreset | boolean;
  onUpdateDimensions?: (items: ImageGalleryItem[]) => void;
}

const VerticalImageGallery = (props: IVerticalImageGalleryProps) => {
  const {
    items,
    columnCount = DEFAULT_MASONRY_CONFIG.columnCount,
    gap = DEFAULT_MASONRY_CONFIG.gap,
    borderRadius = "none",
    shadow = false,
    onUpdateDimensions,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [imageDimensions, setImageDimensions] = useState<Map<string, ImageDimension>>(new Map());
  const [showGallery, setShowGallery] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const { mode: theme } = useTheme();
  const { Image } = useEditorSlots();

  // 监听容器宽度
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // 加载图片尺寸
  useEffect(() => {
    const loadImageDimensions = async () => {
      const newDimensions = new Map(imageDimensions);
      let hasChanges = false;

      for (const item of items) {
        // 优先使用已存储的尺寸
        if (item.width && item.height) {
          if (!newDimensions.has(item.id)) {
            newDimensions.set(item.id, toImageDimension(item, true));
            hasChanges = true;
          }
          continue;
        }

        // 跳过已加载的
        if (newDimensions.get(item.id)?.loaded) continue;

        // 动态加载图片尺寸
        try {
          const img = new window.Image();
          img.src = item.url;
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject();
          });

          const dimension: ImageDimension = {
            id: item.id,
            url: item.url,
            desc: item.desc,
            width: img.naturalWidth,
            height: img.naturalHeight,
            aspectRatio: img.naturalWidth / img.naturalHeight,
            loaded: true,
          };
          newDimensions.set(item.id, dimension);
          hasChanges = true;
        } catch {
          // 加载失败，使用默认纵横比
          newDimensions.set(item.id, {
            id: item.id,
            url: item.url,
            desc: item.desc,
            width: 100,
            height: 100,
            aspectRatio: 1,
            loaded: true,
          });
          hasChanges = true;
        }
      }

      if (hasChanges) {
        setImageDimensions(newDimensions);

        // 回调通知父组件保存尺寸
        if (onUpdateDimensions) {
          const updatedItems = items.map(item => {
            const dim = newDimensions.get(item.id);
            if (dim && !item.width && !item.height) {
              return { ...item, width: dim.width, height: dim.height };
            }
            return item;
          });
          onUpdateDimensions(updatedItems);
        }
      }
    };

    loadImageDimensions();
  }, [items]);

  // 计算布局
  const layout = useMemo(() => {
    const dimensions = items
      .map(item => imageDimensions.get(item.id))
      .filter((d): d is ImageDimension => d !== undefined && d.loaded);

    return calculateMasonryLayout(dimensions, containerWidth, {
      columnCount,
      gap,
    });
  }, [items, imageDimensions, containerWidth, columnCount, gap]);

  // 全屏浏览用的图片列表
  const galleryImages = useMemo(() => items.map(item => item.url), [items]);

  const handleImageClick = (index: number) => {
    setGalleryIndex(index);
    setShowGallery(true);
  };
  const itemAppearanceStyle = useMemo(
    () => getImageAppearanceStyle({ borderRadius, shadow }),
    [borderRadius, shadow]
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ height: layout.totalHeight || "auto" }}
    >
      {layout.items.map((item, index) => (
        <div
          key={item.id}
          className="absolute cursor-pointer overflow-hidden"
          style={{
            left: item.left,
            top: item.top,
            width: item.width,
            height: item.height,
            ...itemAppearanceStyle,
          }}
          onClick={() => handleImageClick(index)}
        >
          {Image ? (
            <Image url={item.url} alt={item.desc || ""} className="h-full w-full object-cover" />
          ) : (
            <img src={item.url} alt={item.desc || ""} className="h-full w-full object-cover" />
          )}
        </div>
      ))}
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

export default VerticalImageGallery;

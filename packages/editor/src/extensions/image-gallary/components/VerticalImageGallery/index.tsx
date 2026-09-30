import { useEffect, useMemo, useRef, useState } from "react";
import { ImageBorderRadiusPreset, ImageGalleryItem, ImageShadowPreset } from "../../../../types";
import {
  calculateMasonryLayout,
  toImageDimension,
  ImageDimension,
  DEFAULT_MASONRY_CONFIG,
} from "./masonryCalculator";
import { getImageAppearanceStyle } from "../../../image/utils/appearance";
import { useEditorSlots } from "../../../../services";

interface IVerticalImageGalleryProps {
  items: ImageGalleryItem[];
  columnCount?: number;
  gap?: number;
  borderRadius?: ImageBorderRadiusPreset;
  shadow?: ImageShadowPreset | boolean;
  onUpdateDimensions?: (items: ImageGalleryItem[]) => void;
  /** 单击 / 双击某张图，参数为该图在 items 中的序号 */
  onItemClick?: (index: number) => void;
  onItemDoubleClick?: (index: number) => void;
}

const VerticalImageGallery = (props: IVerticalImageGalleryProps) => {
  const {
    items,
    columnCount = DEFAULT_MASONRY_CONFIG.columnCount,
    gap = DEFAULT_MASONRY_CONFIG.gap,
    borderRadius = "none",
    shadow = false,
    onUpdateDimensions,
    onItemClick,
    onItemDoubleClick,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [imageDimensions, setImageDimensions] = useState<Map<string, ImageDimension>>(new Map());
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

  // 排版只含已加载尺寸的图，序号按 id 回到原列表
  const indexOf = (id: string) => items.findIndex(item => item.id === id);
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
      {layout.items.map(item => (
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
          onClick={() => onItemClick?.(indexOf(item.id))}
          onDoubleClick={() => onItemDoubleClick?.(indexOf(item.id))}
        >
          {Image ? (
            <Image url={item.url} alt={item.desc || ""} className="h-full w-full object-cover" />
          ) : (
            <img src={item.url} alt={item.desc || ""} className="h-full w-full object-cover" />
          )}
        </div>
      ))}
    </div>
  );
};

export default VerticalImageGallery;

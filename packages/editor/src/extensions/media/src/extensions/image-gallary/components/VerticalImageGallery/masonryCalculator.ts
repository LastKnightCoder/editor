import type { ImageGalleryItem } from "../../../../types/element/gallery";

export interface ImageDimension {
  id: string;
  url: string;
  desc?: string;
  width: number;
  height: number;
  aspectRatio: number;
  loaded: boolean;
}

export interface MasonryConfig {
  columnCount: number;
  gap: number;
}

export interface MasonryLayoutItem {
  id: string;
  url: string;
  desc?: string;
  width: number;
  height: number;
  top: number;
  left: number;
  column: number;
}

export interface MasonryLayoutResult {
  items: MasonryLayoutItem[];
  totalHeight: number;
  columnHeights: number[];
}

export const DEFAULT_MASONRY_CONFIG: MasonryConfig = {
  columnCount: 3,
  gap: 8,
};

/**
 * 将 ImageGalleryItem 转换为带有尺寸信息的 ImageDimension
 */
export function toImageDimension(item: ImageGalleryItem, loaded = false): ImageDimension {
  const width = item.width || 0;
  const height = item.height || 0;
  const aspectRatio = height > 0 ? width / height : 1;

  return {
    id: item.id,
    url: item.url,
    desc: item.desc,
    width,
    height,
    aspectRatio,
    loaded: loaded || (width > 0 && height > 0),
  };
}

/**
 * 瀑布流布局计算 - 最短列优先算法
 *
 * 算法核心：
 * 1. 计算列宽 = (容器宽度 - 间隙总宽度) / 列数
 * 2. 初始化每列高度数组
 * 3. 遍历每张图片，放入当前高度最小的列
 * 4. 更新该列的累计高度
 */
export function calculateMasonryLayout(
  images: ImageDimension[],
  containerWidth: number,
  userConfig?: Partial<MasonryConfig>
): MasonryLayoutResult {
  const config: MasonryConfig = {
    ...DEFAULT_MASONRY_CONFIG,
    ...userConfig,
  };

  const validImages = images.filter(img => img.loaded);

  if (validImages.length === 0 || containerWidth <= 0) {
    return { items: [], totalHeight: 0, columnHeights: [] };
  }

  const { columnCount, gap } = config;

  // 计算列宽：(容器宽度 - 间隙总宽度) / 列数
  const totalGapWidth = gap * (columnCount - 1);
  const columnWidth = (containerWidth - totalGapWidth) / columnCount;

  // 初始化每列高度
  const columnHeights = new Array(columnCount).fill(0);

  // 遍历每张图片，放入最短的列
  const items: MasonryLayoutItem[] = validImages.map(img => {
    // 找到最短列的索引
    const minHeight = Math.min(...columnHeights);
    const shortestColumn = columnHeights.indexOf(minHeight);

    // 计算图片高度（保持纵横比）
    const imgHeight = columnWidth / img.aspectRatio;

    // 计算位置
    const item: MasonryLayoutItem = {
      id: img.id,
      url: img.url,
      desc: img.desc,
      width: Math.round(columnWidth),
      height: Math.round(imgHeight),
      left: Math.round(shortestColumn * (columnWidth + gap)),
      top: Math.round(columnHeights[shortestColumn]),
      column: shortestColumn,
    };

    // 更新该列的高度
    columnHeights[shortestColumn] += imgHeight + gap;

    return item;
  });

  // 计算总高度（取最高列的高度，减去最后一个 gap）
  const maxHeight = Math.max(...columnHeights);
  const totalHeight = maxHeight > 0 ? maxHeight - gap : 0;

  return {
    items,
    totalHeight: Math.round(totalHeight),
    columnHeights: columnHeights.map(h => Math.round(Math.max(0, h - gap))),
  };
}

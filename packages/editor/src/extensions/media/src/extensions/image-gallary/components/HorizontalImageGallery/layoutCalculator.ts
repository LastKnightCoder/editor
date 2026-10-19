import type { ImageGalleryItem, LastRowMode } from "../../../../types/element/gallery";

export interface LayoutConfig {
  rowHeight: number;
  margins: number;
  lastRow: LastRowMode;
  justifyThreshold: number;
}

export interface ImageDimension {
  id: string;
  url: string;
  desc?: string;
  width: number;
  height: number;
  aspectRatio: number;
  loaded: boolean;
}

export interface LayoutItem {
  id: string;
  url: string;
  desc?: string;
  width: number;
  height: number;
  top: number;
  left: number;
}

export interface LayoutResult {
  items: LayoutItem[];
  totalHeight: number;
}

export const DEFAULT_CONFIG: LayoutConfig = {
  rowHeight: 200,
  margins: 8,
  lastRow: "nojustify",
  justifyThreshold: 0.9,
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
 * 判断行是否应该被 justify
 */
function shouldJustifyRow(rowWidth: number, availableWidth: number, threshold: number): boolean {
  return rowWidth / availableWidth > threshold;
}

/**
 * 计算单行的布局
 */
function calculateRowLayout(
  images: ImageDimension[],
  availableWidth: number,
  config: LayoutConfig,
  isLastRow: boolean,
  previousRowsAvgHeight?: number
): { items: LayoutItem[]; rowHeight: number; justified: boolean } {
  if (images.length === 0) {
    return { items: [], rowHeight: 0, justified: false };
  }

  // 计算行的累计纵横比
  const totalAspectRatio = images.reduce((sum, img) => sum + img.aspectRatio, 0);

  // 计算理想行高: rowHeight = availableWidth / totalAspectRatio
  const rowHeight = availableWidth / totalAspectRatio;

  // 判断是否需要 justify
  const rowWidth = totalAspectRatio * config.rowHeight;
  const justifiable = shouldJustifyRow(rowWidth, availableWidth, config.justifyThreshold);

  let shouldJustify = true;
  let finalRowHeight = rowHeight;

  // 最后一行特殊处理
  if (isLastRow && !justifiable && config.lastRow !== "justify" && config.lastRow !== "hide") {
    shouldJustify = false;
    // 使用目标行高或之前行的平均高度
    finalRowHeight = previousRowsAvgHeight || config.rowHeight;

    // 如果使用平均高度后仍可 justify，则 justify
    if (previousRowsAvgHeight) {
      const testWidth = totalAspectRatio * previousRowsAvgHeight;
      if (shouldJustifyRow(testWidth, availableWidth, config.justifyThreshold)) {
        shouldJustify = true;
        finalRowHeight = rowHeight;
      }
    }
  }

  // 计算每张图片的尺寸
  let offsetX = 0;
  const items: LayoutItem[] = images.map((img, index) => {
    let imgWidth: number;
    let imgHeight: number;

    if (shouldJustify) {
      // 最后一张图片填充剩余空间（避免浮点误差）
      if (index === images.length - 1) {
        imgWidth = availableWidth - offsetX;
      } else {
        imgWidth = finalRowHeight * img.aspectRatio;
      }
      imgHeight = finalRowHeight;
    } else {
      imgWidth = config.rowHeight * img.aspectRatio;
      imgHeight = config.rowHeight;
    }

    const item: LayoutItem = {
      id: img.id,
      url: img.url,
      desc: img.desc,
      width: Math.round(imgWidth),
      height: Math.ceil(imgHeight),
      top: 0, // 将在主函数中设置
      left: Math.round(offsetX),
    };

    offsetX += imgWidth + config.margins;
    return item;
  });

  // 处理最后一行对齐
  if (isLastRow && !shouldJustify) {
    const usedWidth =
      items.reduce((sum, item) => sum + item.width, 0) + (items.length - 1) * config.margins;
    const extraSpace = availableWidth - usedWidth;

    let alignmentOffset = 0;
    if (config.lastRow === "center") {
      alignmentOffset = Math.round(extraSpace / 2);
    } else if (config.lastRow === "right") {
      alignmentOffset = extraSpace;
    }

    if (alignmentOffset > 0) {
      items.forEach(item => {
        item.left += alignmentOffset;
      });
    }
  }

  return {
    items,
    rowHeight: Math.ceil(finalRowHeight),
    justified: shouldJustify,
  };
}

/**
 * 主布局计算函数
 *
 * 算法核心：
 * 1. 逐个累加图片纵横比到当前行
 * 2. 当 availableWidth / aspectRatioSum < targetRowHeight 时冲刷当前行
 * 3. 最后一行根据配置决定是否 justify
 */
export function calculateLayout(
  images: ImageDimension[],
  containerWidth: number,
  userConfig?: Partial<LayoutConfig>
): LayoutResult {
  // 合并配置
  const config: LayoutConfig = {
    ...DEFAULT_CONFIG,
    ...userConfig,
  };

  // 过滤掉未加载的图片
  const validImages = images.filter(img => img.loaded);

  if (validImages.length === 0 || containerWidth <= 0) {
    return { items: [], totalHeight: 0 };
  }

  const allItems: LayoutItem[] = [];
  const rowHeights: number[] = [];
  let currentRowImages: ImageDimension[] = [];
  let currentAspectRatioSum = 0;
  let currentOffsetY = 0;

  for (let i = 0; i < validImages.length; i++) {
    const img = validImages[i];
    const itemCount = currentRowImages.length + 1;
    const availableWidth = containerWidth - Math.max(0, itemCount - 1) * config.margins;
    const newAspectRatioSum = currentAspectRatioSum + img.aspectRatio;

    // 检查是否需要冲刷当前行
    // 当 availableWidth / newAspectRatioSum < targetRowHeight 时，说明行满了
    const potentialRowHeight = availableWidth / newAspectRatioSum;
    const shouldFlush = potentialRowHeight < config.rowHeight && currentRowImages.length > 0;

    if (shouldFlush) {
      // 冲刷当前行（不包含当前图片）
      const rowAvailableWidth =
        containerWidth - Math.max(0, currentRowImages.length - 1) * config.margins;
      const avgHeight =
        rowHeights.length > 0
          ? rowHeights.reduce((a, b) => a + b, 0) / rowHeights.length
          : undefined;

      const rowResult = calculateRowLayout(
        currentRowImages,
        rowAvailableWidth,
        config,
        false,
        avgHeight
      );

      // 设置 top 偏移
      rowResult.items.forEach(item => {
        item.top = currentOffsetY;
      });

      allItems.push(...rowResult.items);
      rowHeights.push(rowResult.rowHeight);
      currentOffsetY += rowResult.rowHeight + config.margins;

      // 重置当前行，添加当前图片
      currentRowImages = [img];
      currentAspectRatioSum = img.aspectRatio;
    } else {
      // 将图片添加到当前行
      currentRowImages.push(img);
      currentAspectRatioSum = newAspectRatioSum;
    }
  }

  // 处理最后一行
  if (currentRowImages.length > 0) {
    const rowAvailableWidth =
      containerWidth - Math.max(0, currentRowImages.length - 1) * config.margins;
    const rowWidth = currentAspectRatioSum * config.rowHeight;
    const justifiable = shouldJustifyRow(rowWidth, rowAvailableWidth, config.justifyThreshold);

    // 检查是否应该隐藏最后一行
    const shouldHide = config.lastRow === "hide" && !justifiable;

    if (!shouldHide) {
      const avgHeight =
        rowHeights.length > 0
          ? rowHeights.reduce((a, b) => a + b, 0) / rowHeights.length
          : undefined;

      const rowResult = calculateRowLayout(
        currentRowImages,
        rowAvailableWidth,
        config,
        true,
        avgHeight
      );

      // 设置 top 偏移
      rowResult.items.forEach(item => {
        item.top = currentOffsetY;
      });

      allItems.push(...rowResult.items);
      currentOffsetY += rowResult.rowHeight;
    }
  } else if (rowHeights.length > 0) {
    // 如果最后一行为空，减去多余的 margin
    currentOffsetY -= config.margins;
  }

  return {
    items: allItems,
    totalHeight: currentOffsetY,
  };
}

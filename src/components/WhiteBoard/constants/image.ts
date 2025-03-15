// 图片描述相关常量
export enum EDescriptionPosition {
  TOP = "top",
  BOTTOM = "bottom",
}

export enum EDescriptionAlignment {
  LEFT = "left",
  CENTER = "center",
  RIGHT = "right",
}

// 描述区域最小高度
export const IMAGE_DESCRIPTION_HEIGHT = 24;

// 描述区域内边距
export const IMAGE_DESCRIPTION_PADDING = "4px 0px";

// 描述区域与图片的间距
export const IMAGE_DESCRIPTION_MARGIN = 8;

// 描述文字颜色（亮色主题）
export const IMAGE_DESCRIPTION_LIGHT_COLOR = "#666666";

// 描述文字颜色（暗色主题）
export const IMAGE_DESCRIPTION_DARK_COLOR = "#aaaaaa";

// 描述文字占位符
export const IMAGE_DESCRIPTION_PLACEHOLDER = "添加描述...";

// 默认描述文字
export const DEFAULT_DESCRIPTION = "";

// 默认描述位置
export const DEFAULT_DESCRIPTION_POSITION = EDescriptionPosition.BOTTOM;

// 默认描述对齐方式
export const DEFAULT_DESCRIPTION_ALIGNMENT = EDescriptionAlignment.CENTER;

// 默认描述字体大小
export const DEFAULT_DESCRIPTION_FONT_SIZE = 12;

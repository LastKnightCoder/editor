import type { CSSProperties } from "react";
import type { ImageBorderRadiusPreset, ImageShadowPreset } from "../../../types";

export interface ImageAppearanceConfig {
  borderRadius?: ImageBorderRadiusPreset;
  shadow?: ImageShadowPreset | boolean;
}

export const IMAGE_BORDER_RADIUS_OPTIONS: Array<{
  value: ImageBorderRadiusPreset;
  label: string;
}> = [
  { value: "none", label: "直角" },
  { value: "sm", label: "圆角 8" },
  { value: "md", label: "圆角 12" },
  { value: "lg", label: "圆角 16" },
];

export const IMAGE_SHADOW_OPTIONS: Array<{
  value: ImageShadowPreset;
  label: string;
}> = [
  { value: "none", label: "无阴影" },
  { value: "sm", label: "卡片" },
  { value: "md", label: "轻抬" },
  { value: "lg", label: "浮起" },
];

/** 圆角对齐主题尺度（rounded-tau-sm / md / lg） */
const IMAGE_BORDER_RADIUS_MAP: Record<ImageBorderRadiusPreset, string> = {
  none: "0",
  sm: "var(--tau-radius-sm)",
  md: "var(--tau-radius-md)",
  lg: "var(--tau-radius-lg)",
};

/** 阴影对齐主题三档（card / lift / float），跟随主题明暗 */
const IMAGE_SHADOW_MAP: Record<ImageShadowPreset, string | undefined> = {
  none: undefined,
  sm: "var(--ed-shadow-card)",
  md: "var(--ed-shadow-lift)",
  lg: "var(--ed-shadow-float)",
};

export const getImageBorderRadiusValue = (borderRadius?: ImageBorderRadiusPreset) =>
  IMAGE_BORDER_RADIUS_MAP[borderRadius || "none"];

export const normalizeImageShadowPreset = (
  shadow?: ImageShadowPreset | boolean
): ImageShadowPreset => {
  if (shadow === true) {
    return "md";
  }
  if (shadow === false || !shadow) {
    return "none";
  }
  return shadow;
};

export const getImageShadowValue = (shadow?: ImageShadowPreset | boolean) =>
  IMAGE_SHADOW_MAP[normalizeImageShadowPreset(shadow)];

export const getImageAppearanceStyle = ({
  borderRadius,
  shadow,
}: ImageAppearanceConfig): CSSProperties => ({
  borderRadius: getImageBorderRadiusValue(borderRadius),
  boxShadow: getImageShadowValue(shadow),
});

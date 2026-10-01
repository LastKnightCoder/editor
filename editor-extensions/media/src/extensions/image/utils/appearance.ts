import type { CSSProperties } from "react";
import { type ImageBorderRadiusPreset, type ImageShadowPreset } from "../../../types/index";

export interface ImageAppearanceConfig {
  borderRadius?: ImageBorderRadiusPreset;
  shadow?: ImageShadowPreset | boolean;
}

export const IMAGE_BORDER_RADIUS_OPTIONS: Array<{
  value: ImageBorderRadiusPreset;
  label: string;
}> = [
  { value: "none", label: "无圆角" },
  { value: "sm", label: "小圆角" },
  { value: "md", label: "中圆角" },
  { value: "lg", label: "大圆角" },
];

export const IMAGE_SHADOW_OPTIONS: Array<{
  value: ImageShadowPreset;
  label: string;
}> = [
  { value: "none", label: "无阴影" },
  { value: "sm", label: "小阴影" },
  { value: "md", label: "中阴影" },
  { value: "lg", label: "大阴影" },
];

const IMAGE_BORDER_RADIUS_MAP: Record<ImageBorderRadiusPreset, string> = {
  none: "0",
  sm: "0.25em",
  md: "0.5em",
  lg: "1em",
};

const IMAGE_SHADOW_MAP: Record<ImageShadowPreset, string | undefined> = {
  none: undefined,
  sm: "0 2px 8px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(15, 23, 42, 0.05)",
  md: "0 6px 18px rgba(15, 23, 42, 0.11), 0 2px 8px rgba(15, 23, 42, 0.06)",
  lg: "0 10px 26px rgba(15, 23, 42, 0.14), 0 4px 12px rgba(15, 23, 42, 0.08)",
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

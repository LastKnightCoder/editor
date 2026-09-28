import { useMemo, useSyncExternalStore } from "react";

import type { ImageAppearanceConfig } from "./utils/appearance";

/**
 * 可订阅的外观来源：宿主设置能在运行时修改时用它，编辑器随之刷新，不必重建扩展。
 * `get` 必须在值未变时返回同一个引用（useSyncExternalStore 的约定）。
 */
export interface ImageAppearanceSource {
  get: () => ImageAppearanceConfig | undefined;
  subscribe: (listener: () => void) => () => void;
}

/** image / image-gallery 扩展的外观参数：固定值，或可订阅的来源 */
export type ImageAppearanceOption = ImageAppearanceConfig | ImageAppearanceSource;

export interface ImageExtensionOptions {
  /** 元素未单独设置时的默认圆角 / 阴影；缺省为无圆角、无阴影 */
  appearance?: ImageAppearanceOption;
}

const isSource = (option: ImageAppearanceOption): option is ImageAppearanceSource =>
  typeof (option as ImageAppearanceSource).subscribe === "function";

const noopSubscribe = () => () => {};

/** 读取外观默认值；来源变化时触发重渲染 */
export function useImageAppearance(
  option: ImageAppearanceOption | undefined
): ImageAppearanceConfig | undefined {
  const [subscribe, getSnapshot] = useMemo(() => {
    if (option && isSource(option)) return [option.subscribe, option.get] as const;
    return [noopSubscribe, () => option as ImageAppearanceConfig | undefined] as const;
  }, [option]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

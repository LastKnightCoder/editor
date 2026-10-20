import type { ComponentType, SVGProps } from "react";

/**
 * 插件提供的图标：线性单色 SVG 组件（如 lucide-react 图标或自绘组件），用 currentColor 跟随主题。
 * 侧边栏条目与内容类型共用这一协议；宿主统一传入 size、strokeWidth、className 与 aria-hidden。
 */
export type PluginIconProps = SVGProps<SVGSVGElement> & { size?: number | string };
export type PluginIcon = ComponentType<PluginIconProps>;

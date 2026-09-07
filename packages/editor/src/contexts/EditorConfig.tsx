import type { ThemeColors } from "../types/services";
import { useEditorEnvironment } from "./EditorProvider";
import type { ImageBorderRadiusPreset, ImageShadowPreset } from "../types/element/image-appearance";
import type { MermaidRenderStyle, MermaidThemeName } from "@tau/shared";

/**
 * 编辑器全局配置：内核规定规范（本文件中的类型），宿主在外层通过
 * <EditorProvider config={...}> 提供取值。
 *
 * 经 EditorProvider 传播：作用域随组件树（嵌套 Provider 取最近一层）、
 * 首帧即可读取、卸载自动恢复外层。所有消费一律走 useEditorConfig()；
 * 事件回调等闭包场景应在 render 期取值后经闭包引用，不要另设全局
 * 镜像 store——嵌套 Provider 写镜像会污染外层订阅造成回写循环。
 */

export interface EditorThemeConfig {
  mode: "light" | "dark";
  /** 颜色规范（Tailwind 类名）由内核定义，宿主按规范提供取值 */
  colors: ThemeColors;
}

export interface EditorAppearanceConfig {
  image?: {
    borderRadius?: ImageBorderRadiusPreset;
    shadow?: ImageShadowPreset | boolean;
  };
}

export interface EditorMermaidConfig {
  style?: MermaidRenderStyle;
  lightTheme?: MermaidThemeName;
  darkTheme?: MermaidThemeName;
  useBeautifulMermaid?: boolean;
}

export interface EditorConfig {
  theme: EditorThemeConfig;
  /** 元素外观默认值（未配置时使用内核默认） */
  appearance?: EditorAppearanceConfig;
  /** Mermaid 渲染设置 */
  mermaid?: EditorMermaidConfig;
  /** 打开外部链接（Electron shell / window.open 等） */
  openUrl?: (url: string) => void | Promise<void>;
  /** PlantUML 渲染服务器地址，默认 https://www.plantuml.com/plantuml */
  plantumlServer?: string;
  /** PlantUML 暗色主题（暗色时注入 !theme，置空串禁用），默认 cyborg-outline */
  plantumlDarkTheme?: string;
  /** 日期格式化（如批注时间），默认 dayjs "YYYY-MM-DD HH:mm:ss" */
  formatDate?: (date: Date | string | number, format?: string) => string;
}

/** React 消费：Provider 内读取配置，未配置时返回 null。 */
export const useEditorConfig = (): EditorConfig | null => {
  return useEditorEnvironment().config;
};

/** 未挂载 Provider 时的兜底色板（全部为空类名，样式退化为无主题态） */
const FALLBACK_THEME_COLORS: ThemeColors = {
  hoverClass: "",
  activeClass: "",
  hoverTextClass: "",
  borderClass: "",
  hoverBorderClass: "",
  focusBorderClass: "",
  textClass: "",
  secondaryTextClass: "",
  activeTextClass: "",
};

export const createFallbackThemeColors = (): ThemeColors => FALLBACK_THEME_COLORS;

/** 内核默认外观 */
export const DEFAULT_IMAGE_APPEARANCE = {
  borderRadius: "none" as ImageBorderRadiusPreset,
  shadow: "none" as ImageShadowPreset,
};

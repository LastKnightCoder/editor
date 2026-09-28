/**
 * 主题契约根入口：token 词汇表、defineTheme 协议与注册表、内置主题、偏好解析与首帧脚本生成。
 * 纯数据 + 纯函数，不依赖 DOM / React，可在 Node（vite 配置、主进程、测试）中直接使用。
 * DOM 应用见 `@tau/themes/dom`，React 运行时见 `@tau/themes/react`。
 */
import "./register";

export * from "./tokenContract";
export { THEME_MODES, defineTheme, getTheme, getThemeRegistry, listThemes } from "./defineTheme";
export type {
  ThemeDefinition,
  ThemeDefinitionArgs,
  ThemeMode,
  ThemePalette,
  ThemeVariant,
  ThemeVariantArgs,
} from "./defineTheme";
export {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  DEFAULT_THEME_KEY,
  THEME_STORAGE_KEY,
  createThemeBootstrapScript,
  resolveThemePreference,
  themeRuntimeConfig,
  type Appearance,
  type ResolvedThemePreference,
  type ThemeRuntimeConfig,
} from "./bootstrap";

/**
 * defineTheme 协议 —— 一个文件声明一个主题族的全部。
 *
 * 与 definePage 同构的声明式协议（设计见 docs/redesign/02-UI设计系统规范.md §2.2）：
 *  - 一个主题族 = key/名字 + 浅色、深色两套 palette/tokens 映射函数；深浅都是必填，
 *    不存在「只有浅色的主题」，明暗是与主题族正交的维度（用户偏好 light/dark/system）；
 *  - tokens() 返回值被约束为全键 SemanticTokens，漏键 = 编译错误（杜绝补丁式主题）；
 *  - 派生逻辑（accent hover/soft 等）写在映射函数里，显式可读，不藏在 CSS calc 中；
 *  - 注册进纯数据注册表；运行时由 theme.ts 切换 data-theme / data-mode。
 *
 * 运行时：tokens.css 的 [data-theme][data-mode] 数据块级联取值（index.html 内联脚本首帧
 * 预置，theme.ts 只切属性 + 持久化），数据块与 tokens() 产物由 theme-parity 测试守护；
 * 后续优化为构建期 codegen（`pnpm ui:themes` 生成数据块），协议不变。
 */

import type { SemanticTokens } from "./tokenContract";

export type ThemeMode = "light" | "dark";

export const THEME_MODES: readonly ThemeMode[] = ["light", "dark"];

/** 原始色板输入（主题作者自由组织，不进组件；数值型输入用于派生计算） */
export type ThemePalette = Record<string, string | number>;

/** 主题族的一套明暗配色 */
export interface ThemeVariant {
  palette: ThemePalette;
  /** 色板 → 语义 token 的纯函数映射产物（全键强制） */
  tokens: SemanticTokens;
}

export interface ThemeDefinition extends Record<ThemeMode, ThemeVariant> {
  key: string;
  name: string;
}

export interface ThemeVariantArgs {
  palette: ThemePalette;
  tokens: (p: ThemePalette) => SemanticTokens;
}

export interface ThemeDefinitionArgs extends Record<ThemeMode, ThemeVariantArgs> {
  key: string;
  name: string;
}

const themeRegistry = new Map<string, ThemeDefinition>();

function buildVariant({ palette, tokens }: ThemeVariantArgs): ThemeVariant {
  return { palette, tokens: tokens(palette) };
}

export function defineTheme(args: ThemeDefinitionArgs): ThemeDefinition {
  if (themeRegistry.has(args.key)) {
    // dev 下 Vite HMR 会重新执行主题文件，重复注册按覆盖处理；真冲突留给 prod 抛错兜底
    if (import.meta.env.DEV) {
      console.warn(`[theme] 重复注册主题（HMR 重载？）覆盖：${args.key}`);
    } else {
      throw new Error(`[theme] 重复注册主题：${args.key}`);
    }
  }
  const definition: ThemeDefinition = {
    key: args.key,
    name: args.name,
    light: buildVariant(args.light),
    dark: buildVariant(args.dark),
  };
  themeRegistry.set(args.key, definition);
  return definition;
}

export function getThemeRegistry(): ReadonlyMap<string, ThemeDefinition> {
  return themeRegistry;
}

export function getTheme(key: string): ThemeDefinition | undefined {
  return themeRegistry.get(key);
}

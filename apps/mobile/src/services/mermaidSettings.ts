import {
  MERMAID_THEME_NAMES,
  type MermaidRenderStyle,
  type MermaidThemeName,
} from "@tau/shared";
import type { SettingCompat } from "../types";

export interface MermaidSettingValue {
  style: MermaidRenderStyle;
  lightTheme: MermaidThemeName;
  darkTheme: MermaidThemeName;
  useBeautifulMermaid: boolean;
}

export const DEFAULT_MERMAID_STYLE: MermaidRenderStyle = "svg";
export const DEFAULT_MERMAID_LIGHT_THEME: MermaidThemeName = "github-light";
export const DEFAULT_MERMAID_DARK_THEME: MermaidThemeName = "github-dark";
export const DEFAULT_USE_BEAUTIFUL_MERMAID = true;

const MERMAID_THEME_NAME_SET = new Set<string>(MERMAID_THEME_NAMES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeMermaidStyle(value: unknown): MermaidRenderStyle {
  return value === "ascii-unicode" ? "ascii-unicode" : DEFAULT_MERMAID_STYLE;
}

function normalizeMermaidTheme(
  value: unknown,
  fallback: MermaidThemeName,
): MermaidThemeName {
  if (typeof value === "string" && MERMAID_THEME_NAME_SET.has(value)) {
    return value as MermaidThemeName;
  }
  return fallback;
}

function normalizeUseBeautifulMermaid(value: unknown): boolean {
  return typeof value === "boolean" ? value : DEFAULT_USE_BEAUTIFUL_MERMAID;
}

function readRawMermaidSetting(setting?: SettingCompat | null) {
  if (!isRecord(setting)) {
    return {};
  }
  const misc = isRecord(setting.misc) ? setting.misc : {};
  return isRecord(misc.mermaid) ? misc.mermaid : {};
}

export function getNormalizedMermaidSetting(
  setting?: SettingCompat | null,
): MermaidSettingValue {
  const rawMermaid = readRawMermaidSetting(setting);
  return {
    style: normalizeMermaidStyle(rawMermaid.style),
    lightTheme: normalizeMermaidTheme(
      rawMermaid.lightTheme,
      DEFAULT_MERMAID_LIGHT_THEME,
    ),
    darkTheme: normalizeMermaidTheme(
      rawMermaid.darkTheme,
      DEFAULT_MERMAID_DARK_THEME,
    ),
    useBeautifulMermaid: normalizeUseBeautifulMermaid(
      rawMermaid.useBeautifulMermaid,
    ),
  };
}

export function withNormalizedMermaidSetting(
  setting: SettingCompat,
): SettingCompat {
  const misc = isRecord(setting.misc) ? setting.misc : {};
  return {
    ...setting,
    misc: {
      ...misc,
      mermaid: getNormalizedMermaidSetting(setting),
    },
  } as SettingCompat;
}

export function patchMermaidSetting(
  setting: SettingCompat,
  patch: Partial<MermaidSettingValue>,
): SettingCompat {
  const current = getNormalizedMermaidSetting(setting);
  const nextStyle =
    patch.style === undefined
      ? current.style
      : normalizeMermaidStyle(patch.style);
  const nextLightTheme =
    patch.lightTheme === undefined
      ? current.lightTheme
      : normalizeMermaidTheme(patch.lightTheme, DEFAULT_MERMAID_LIGHT_THEME);
  const nextDarkTheme =
    patch.darkTheme === undefined
      ? current.darkTheme
      : normalizeMermaidTheme(patch.darkTheme, DEFAULT_MERMAID_DARK_THEME);
  const nextUseBeautifulMermaid =
    patch.useBeautifulMermaid === undefined
      ? current.useBeautifulMermaid
      : normalizeUseBeautifulMermaid(patch.useBeautifulMermaid);

  const misc = isRecord(setting.misc) ? setting.misc : {};
  return {
    ...setting,
    misc: {
      ...misc,
      mermaid: {
        style: nextStyle,
        lightTheme: nextLightTheme,
        darkTheme: nextDarkTheme,
        useBeautifulMermaid: nextUseBeautifulMermaid,
      },
    },
  } as SettingCompat;
}

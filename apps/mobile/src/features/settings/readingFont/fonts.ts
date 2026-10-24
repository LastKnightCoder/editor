// 正文字体选项：客户端只认识这里登记的字体，线上清单里多出的 id 忽略。
// 选择写入 setting.json 的 appearance.readingFont（本机设置，字体文件按设备下载）。

import type { SettingCompat } from "../../../types";

export type ReadingFontId = "system" | "lxgw-wenkai" | "noto-serif-sc";

export type ReadingFontOption = {
  id: ReadingFontId;
  label: string;
  description: string;
  /** 只有常规体的字体：粗体靠系统合成，否则根上 font-synthesis: none 会让粗体不显示 */
  synthesizeBold?: boolean;
};

export const READING_FONT_OPTIONS: ReadingFontOption[] = [
  { id: "system", label: "系统默认", description: "与界面文字一致的黑体" },
  {
    id: "lxgw-wenkai",
    label: "霞鹜文楷",
    description: "温和的楷体，适合日记与随笔",
    synthesizeBold: true,
  },
  { id: "noto-serif-sc", label: "思源宋体", description: "书卷气的宋体，适合文章与长文" },
];

export const READING_FONT_SAMPLE = "今天把这本书看完了，书里写的小镇生活让人羡慕。";

export function normalizeReadingFontId(value: unknown): ReadingFontId {
  return READING_FONT_OPTIONS.some(option => option.id === value)
    ? (value as ReadingFontId)
    : "system";
}

export function readingFontOption(id: ReadingFontId): ReadingFontOption {
  return READING_FONT_OPTIONS.find(option => option.id === id) ?? READING_FONT_OPTIONS[0];
}

export function withReadingFont(prev: SettingCompat, id: ReadingFontId): SettingCompat {
  return { ...prev, appearance: { ...prev.appearance, readingFont: id } };
}

/** 注册 FontFace 用的 family 名：加前缀避免与系统里同名字体冲突 */
export function readingFontFamily(id: ReadingFontId): string {
  return `Tau Reading ${id}`;
}

export function formatFontSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

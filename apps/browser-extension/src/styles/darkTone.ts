import { listThemes, type ThemeDefinition } from "@tau/themes";

/**
 * 插件深色调亮（只作用于插件，桌面不变）：纸面按主题自己的墨色（ink-1）往亮处混，
 * 色相跟着主题走；卡片变亮后次文字（ink-2）跟着提一点，保住 AA。
 * 取值由 dark-tone.css 静态落地（同元素上的变量不能引用自身），本文件是唯一口径。
 */
export const DARK_TONE_MIX: Record<string, number> = {
  "bg-page": 0.06,
  "bg-surface": 0.07,
  "bg-surface-hover": 0.07,
  "line-1": 0.07,
  "ink-2": 0.18,
};

const toRgb = (hex: string): [number, number, number] => {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new Error(`深色调亮只支持 #rrggbb：${hex}`);
  const value = parseInt(match[1]!, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const toHex = (rgb: number[]) =>
  "#" + rgb.map(channel => Math.round(channel).toString(16).padStart(2, "0")).join("");

/** 与 CSS color-mix(in srgb, base, mix p) 一致：按 sRGB 通道线性混合 */
export const mixSrgb = (base: string, mix: string, ratio: number) => {
  const a = toRgb(base);
  const b = toRgb(mix);
  return toHex(a.map((channel, index) => channel * (1 - ratio) + b[index]! * ratio));
};

/** 某主题深色的调亮取值（token 名 → #rrggbb） */
export function darkToneTokens(theme: ThemeDefinition): Record<string, string> {
  const tokens = theme.dark.tokens as Record<string, string>;
  const ink = tokens["ink-1"]!;
  return Object.fromEntries(
    Object.entries(DARK_TONE_MIX).map(([name, ratio]) => [name, mixSrgb(tokens[name]!, ink, ratio)])
  );
}

/** dark-tone.css 的完整内容（测试比对；主题取值变化后用它重写该文件） */
export function renderDarkToneCss(themes: ThemeDefinition[] = listThemes()): string {
  const blocks = themes.map(theme => {
    const lines = Object.entries(darkToneTokens(theme)).map(
      ([name, value]) => `  --tau-${name}: ${value};`
    );
    return `/* ${theme.name} */\n[data-theme="${theme.key}"][data-mode="dark"] {\n${lines.join("\n")}\n}`;
  });
  return `${HEADER}\n${blocks.join("\n\n")}\n`;
}

const HEADER = `/*
 * 插件深色调亮：覆盖 @tau/themes 的深色纸面（底色 / 卡片 / 描边）与次文字，只作用于插件。
 * 由 src/styles/darkTone.ts 计算，__tests__/darkTone.test.ts 守护与主题定义一致——不要手改。
 * 必须在 tokens.css 之后引入（同优先级，后者覆盖）。
 */`;

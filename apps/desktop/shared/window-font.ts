import type { PluginWindowAppearance } from "@tau/plugins";

export type WindowFont = PluginWindowAppearance["font"];

export const DEFAULT_WINDOW_FONT: WindowFont = Object.freeze({
  chineseFont: "华文楷体",
  englishFont: "American TypeWriter",
  codeFont: "JetBrains Mono",
  fontSize: 16,
});

export function readWindowFont(value: Partial<WindowFont> | undefined): WindowFont {
  return {
    chineseFont:
      typeof value?.chineseFont === "string" ? value.chineseFont : DEFAULT_WINDOW_FONT.chineseFont,
    englishFont:
      typeof value?.englishFont === "string" ? value.englishFont : DEFAULT_WINDOW_FONT.englishFont,
    codeFont: typeof value?.codeFont === "string" ? value.codeFont : DEFAULT_WINDOW_FONT.codeFont,
    fontSize:
      typeof value?.fontSize === "number" && Number.isFinite(value.fontSize) && value.fontSize > 0
        ? value.fontSize
        : DEFAULT_WINDOW_FONT.fontSize,
  };
}

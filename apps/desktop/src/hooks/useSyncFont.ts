import { useEffect } from "react";
import useSettingStore from "@/stores/useSettingStore.ts";

/**
 * tau 字号档位默认值——与 packages/ui tokens.css 的 :root 字面值层（--tau-text-*）
 * 同源，改档位/增删档位时两处同步（token 契约双写惯例）。
 */
const TAU_TEXT_STEPS: Record<string, number> = {
  "--tau-text-hero": 25,
  "--tau-text-title-lg": 20,
  "--tau-text-title": 14.5,
  "--tau-text-body-lg": 13.5,
  "--tau-text-body": 13,
  "--tau-text-meta": 12.5,
  "--tau-text-sm": 12,
  "--tau-text-micro": 11.5,
  "--tau-text-tiny": 11,
};

/** 排版基准 = --text-tau-body 的定义值，用户字号以它为缩放基准 */
const BASE_FONT_SIZE = 13;

/**
 * 壳层 UI 阻尼系数（2026-09-23 用户裁决）：字号相对基准的偏移只按半速率传导到
 * --tau-text-*（壳层界面）；编辑器内容仍经 --font-size 1:1 跟随。
 * 例：字号 16 → 壳层 body 14.5px，字号 24 → 壳层 body 18.5px。
 */
const SHELL_UI_DAMPING = 0.5;

const useSyncFont = () => {
  const fontSetting = useSettingStore(state => state.setting.fontSetting);

  useEffect(() => {
    const { chineseFont, englishFont, fontSize, codeFont } = fontSetting;
    const font = `${englishFont}, ${chineseFont}`;
    const root = document.documentElement;
    const scale = 1 + (fontSize / BASE_FONT_SIZE - 1) * SHELL_UI_DAMPING;

    // 用户字体/字号 = 应用级默认（root 覆盖，2026-09-21 用户裁决全局生效）：
    // 覆盖 --tau-font / --tau-font-mono 让 font-tau 全部消费者（壳层 UI）即时换字体；
    // 字号按基准阻尼缩放 --text-tau-* 档位（排版层级保持，间距圆角不动）。
    // --font / --font-size / --mono-font 是 legacy 样式与编辑器包的既有变量，一并写 root
    root.style.setProperty("--font", font);
    root.style.setProperty("--font-size", `${fontSize}px`);
    root.style.setProperty("--mono-font", `${codeFont}, ${font}, monospace`);
    root.style.setProperty("--tau-font", font);
    root.style.setProperty(
      "--tau-font-mono",
      `${codeFont}, ui-monospace, "Cascadia Mono", Consolas, Menlo, monospace`
    );
    for (const [token, base] of Object.entries(TAU_TEXT_STEPS)) {
      root.style.setProperty(token, `${(base * scale).toFixed(2)}px`);
    }
  }, [fontSetting]);
};

export default useSyncFont;

import { continueRender, delayRender } from "remotion";
import { fonts } from "./tokens";

/** 白板手绘字体的字族（hand-font.css 按 unicode-range 拆成 Latin + 43 个中文子集） */
const HAND_FACES = ['"Tau Hand Latin"', ...Array.from({ length: 43 }, (_, i) => `"Tau Hand CJK ${String(i).padStart(3, "0")}"`)].join(", ");

/**
 * Fontsource 中文字体按 unicode-range 切成上百个子集，浏览器按需懒加载，
 * 渲染时可能某帧字形未就绪。这里按片中实际出现的文字，在首帧前预载对应子集。
 * glyphs 传入所有用到展示字体 / 字幕字体的文案；handGlyphs 是白板手绘模式下出现的文字，按手绘字体预载。
 */
export function preloadFonts(glyphs: string, handGlyphs = "") {
  if (typeof document === "undefined") return;
  const handle = delayRender("加载字体子集", { timeoutInMilliseconds: 60_000 });
  const text = [...new Set(glyphs)].join("");
  const specs = [`400 32px ${fonts.display}`, `600 32px ${fonts.display}`, `400 32px ${fonts.caption}`, `500 32px ${fonts.caption}`, `400 32px ${fonts.label}`];
  const loads = specs.map(spec => document.fonts.load(spec, text).catch(() => []));
  if (handGlyphs) loads.push(document.fonts.load(`400 32px ${HAND_FACES}`, [...new Set(handGlyphs)].join("")).catch(() => []));
  Promise.all(loads)
    .then(() => continueRender(handle))
    .catch(() => continueRender(handle));
}

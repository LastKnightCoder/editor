import { DEFAULT_THEME_ID, DEFAULT_THEME_STYLE, getPaletteById, isMindThemeStyle, type MindHue, type MindPalette, type MindThemeStyle } from "./mind-themes";
import { contrast, fitTone, hexTone, oklch, type Tone } from "@tau/shared/color-utils";

export type MindMode = "light" | "dark";

export interface MindNodeVisual {
  background: string;
  textColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  /** 富文本编辑器的明暗（决定链接、代码块等内嵌元素的配色） */
  editorTheme: MindMode;
  /** 指向该节点的连线 */
  lineColor: string;
  lineWidth: number;
  /** 折叠指示器 / 笔记点等小部件的底色与前景 */
  accent: string;
  accentText: string;
}

/** 文字对比度下限（WCAG AA 正文） */
export const MIN_TEXT_CONTRAST = 4.5;
/** 连线、描边等非文字元素的对比度下限（WCAG 1.4.11） */
export const MIN_LINE_CONTRAST = 3;

/**
 * 画布参考底色：取各应用主题里对比度最差的一档
 * （浅色取偏暗的 page 底，深色取偏亮的 surface 底），保证在所有应用主题下都达标。
 */
export const CANVAS_TONE: Record<MindMode, Tone> = {
  light: hexTone("#e6e1d6"),
  dark: hexTone("#39332b"),
};

const WHITE = hexTone("#ffffff");

const inkOn = (mode: MindMode, hue: MindHue) => (mode === "light" ? oklch(0.99, 0.004, hue.h) : oklch(0.18, Math.min(hue.c, 0.03), hue.h));

/** 在底色上取同色相的可读文字：浅底往暗调，深底往亮调 */
const textOn = (bg: Tone, hue: MindHue, darkText: boolean) =>
  darkText ? fitTone(0.4, hue.c * 0.9, hue.h, bg, MIN_TEXT_CONTRAST, "darker") : fitTone(0.9, hue.c * 0.5, hue.h, bg, MIN_TEXT_CONTRAST, "lighter");

const pickAccentText = (fill: Tone) => (contrast(fill, WHITE) >= contrast(fill, hexTone("#1a1a1a")) ? "#ffffff" : "#1a1a1a");

const LINE_WIDTH = [3, 2, 1.5] as const;

function lineOf(mode: MindMode, hue: MindHue, level: number) {
  const canvas = CANVAS_TONE[mode];
  const tone = mode === "light" ? fitTone(0.66, hue.c, hue.h, canvas, MIN_LINE_CONTRAST, "darker") : fitTone(0.7, hue.c, hue.h, canvas, MIN_LINE_CONTRAST, "lighter");
  return { color: tone, width: LINE_WIDTH[Math.min(level - 2, 2)] };
}

function rootVisual(palette: MindPalette, mode: MindMode): MindNodeVisual {
  const hue = palette.root;
  const darkFill = mode === "light" || palette.rootAlwaysDark;
  const fill = darkFill ? oklch(mode === "light" ? 0.3 : 0.2, hue.c, hue.h) : oklch(0.92, hue.c * 0.6, hue.h);
  const text = inkOn(darkFill ? "light" : "dark", hue);
  // 深色画布上的深色根节点需要一圈亮边，否则和画布融在一起
  const needRing = mode === "dark" && darkFill;
  const ring = needRing ? fitTone(0.6, palette.hues[0].c, palette.hues[0].h, CANVAS_TONE.dark, MIN_LINE_CONTRAST, "lighter") : null;
  return {
    background: fill.hex,
    textColor: text.hex,
    borderColor: ring?.hex ?? "transparent",
    borderWidth: ring ? 2 : 0,
    borderRadius: 10,
    editorTheme: darkFill ? "dark" : "light",
    lineColor: fill.hex,
    lineWidth: LINE_WIDTH[0],
    accent: ring?.hex ?? fill.hex,
    accentText: pickAccentText(ring ?? fill),
  };
}

function branchVisual(hue: MindHue, level: number, style: MindThemeStyle, mode: MindMode): MindNodeVisual {
  const light = mode === "light";
  const canvas = CANVAS_TONE[mode];
  const line = lineOf(mode, hue, level);
  const main = level === 2;
  const base = {
    borderRadius: main ? 8 : 6,
    lineColor: line.color.hex,
    lineWidth: line.width,
    accent: line.color.hex,
    accentText: pickAccentText(line.color),
  };

  // 透明底：文字直接落在画布上
  const onCanvas = (borderColor: string, borderWidth: number): MindNodeVisual => ({
    ...base,
    background: "transparent",
    textColor: textOn(canvas, hue, light).hex,
    borderColor,
    borderWidth,
    editorTheme: mode,
  });

  const filled = (fill: Tone, border?: Tone, borderWidth = 0): MindNodeVisual => {
    const darkText = contrast(fill, WHITE) < MIN_TEXT_CONTRAST;
    return {
      ...base,
      background: fill.hex,
      textColor: textOn(fill, hue, darkText).hex,
      borderColor: border?.hex ?? "transparent",
      borderWidth: border ? borderWidth : 0,
      editorTheme: darkText ? "light" : "dark",
    };
  };

  if (style === "solid") {
    if (main) {
      // 二级：分支色实心，白字（浅色）/ 深字（深色），调 L 直到对比度达标
      if (light) {
        const fill = fitTone(0.6, hue.c, hue.h, WHITE, MIN_TEXT_CONTRAST, "darker");
        return { ...filled(fill), textColor: WHITE.hex, editorTheme: "dark" };
      }
      const ink = inkOn("dark", hue);
      const fill = fitTone(0.74, hue.c, hue.h, ink, MIN_TEXT_CONTRAST, "lighter");
      return { ...filled(fill), textColor: ink.hex, editorTheme: "light" };
    }
    // 三级及以下是浅底，和画布底色很接近（画布是 bg-surface，近白 / 近黑），
    // 加一圈分支色描边，节点边界才不会在任意画布底色下消失
    return filled(light ? oklch(0.95, hue.c * 0.3, hue.h) : oklch(0.31, hue.c * 0.4, hue.h), line.color, 1);
  }

  if (style === "soft") {
    if (main) {
      const fill = light ? oklch(0.94, hue.c * 0.35, hue.h) : oklch(0.33, hue.c * 0.45, hue.h);
      return filled(fill, line.color, 1.5);
    }
    return onCanvas("transparent", 0);
  }

  // outline
  if (main) return onCanvas(line.color.hex, 2);
  const border = light ? oklch(0.82, hue.c * 0.6, hue.h) : oklch(0.45, hue.c * 0.6, hue.h);
  return onCanvas(border.hex, 1);
}

const cache = new Map<string, MindNodeVisual>();

export interface MindThemeRef {
  themeId?: string;
  themeStyle?: string;
}

interface TreeNode {
  id: string;
  children?: TreeNode[];
}

const branchCache = new WeakMap<object, Map<string, number>>();

export class MindThemeUtil {
  private static STORAGE_KEY = "whiteboard-mind-theme";
  private static STYLE_STORAGE_KEY = "whiteboard-mind-theme-style";

  static resolveStyle(style: string | undefined): MindThemeStyle {
    return isMindThemeStyle(style) ? style : DEFAULT_THEME_STYLE;
  }

  /**
   * 节点视觉。branchIndex 为所属二级分支在根节点 children 中的序号（根节点传 -1）。
   * 结果按参数缓存，渲染时可以放心调用。
   */
  static getNodeVisual(theme: MindThemeRef, level: number, branchIndex: number, mode: MindMode): MindNodeVisual {
    const palette = getPaletteById(theme.themeId);
    const style = this.resolveStyle(theme.themeStyle);
    const hueIndex = level <= 1 ? -1 : Math.max(0, branchIndex) % palette.hues.length;
    const key = `${palette.id}|${style}|${mode}|${Math.min(level, 3)}|${hueIndex}`;
    let visual = cache.get(key);
    if (!visual) {
      visual = level <= 1 ? rootVisual(palette, mode) : branchVisual(palette.hues[hueIndex], Math.min(level, 4), style, mode);
      cache.set(key, visual);
    }
    return visual;
  }

  /** 节点 id → 所属二级分支序号；按根对象缓存（immer 下树不变则对象不变） */
  static getBranchIndexMap(root: TreeNode): Map<string, number> {
    let map = branchCache.get(root);
    if (map) return map;
    map = new Map();
    const target = map;
    const walk = (node: TreeNode, index: number) => {
      target.set(node.id, index);
      node.children?.forEach(child => walk(child, index));
    };
    target.set(root.id, -1);
    root.children?.forEach((child, i) => walk(child, i));
    branchCache.set(root, map);
    return map;
  }

  static getBranchIndex(root: TreeNode | null | undefined, nodeId: string): number {
    if (!root) return 0;
    return this.getBranchIndexMap(root).get(nodeId) ?? 0;
  }

  static getDefaultThemeId(): string {
    return localStorage.getItem(this.STORAGE_KEY) || DEFAULT_THEME_ID;
  }

  static getDefaultThemeStyle(): MindThemeStyle {
    return this.resolveStyle(localStorage.getItem(this.STYLE_STORAGE_KEY) ?? undefined);
  }

  static saveDefault(themeId: string, themeStyle: MindThemeStyle): void {
    localStorage.setItem(this.STORAGE_KEY, themeId);
    localStorage.setItem(this.STYLE_STORAGE_KEY, themeStyle);
  }

  /** 根节点上的主题；缺省时回落到用户默认 */
  static getThemeOf(root: MindThemeRef | null | undefined): Required<MindThemeRef> {
    return {
      themeId: root?.themeId || this.getDefaultThemeId(),
      themeStyle: this.resolveStyle(root?.themeStyle ?? this.getDefaultThemeStyle()),
    };
  }
}

export default MindThemeUtil;

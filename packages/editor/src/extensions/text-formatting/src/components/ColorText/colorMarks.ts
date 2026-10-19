import { Editor } from "slate";
import {
  findInlineColorByInk,
  getInlinePaletteEntry,
  isTextGradientPresetId,
  type InlinePaletteColor,
  type TextGradientPresetId,
} from "../../../palette.ts";

/** 选区上的着色取值：字色色相 / 渐变 / 高亮色相（各自互不依赖） */
export interface ColorValue {
  /** 色板外的历史字色（旧色值）记为 "custom"，面板上不标选中 */
  text: InlinePaletteColor | "custom" | null;
  gradient: TextGradientPresetId | null;
  highlight: InlinePaletteColor | null;
}

export const EMPTY_COLOR_VALUE: ColorValue = { text: null, gradient: null, highlight: null };

export const readColorValue = (editor: Editor): ColorValue => {
  const marks = Editor.marks(editor) as Record<string, unknown> | null;
  if (!marks) return EMPTY_COLOR_VALUE;
  const gradient = isTextGradientPresetId(marks.textGradient) ? marks.textGradient : null;
  const rawInk = marks.color ?? marks.darkColor;
  const text = gradient || !rawInk ? null : (findInlineColorByInk(rawInk)?.id ?? "custom");
  // 早期数据 highlight 为 true，按黄色处理
  const highlight =
    marks.highlight === true ? "yellow" : (getInlinePaletteEntry(marks.highlight)?.id ?? null);
  return { text, gradient, highlight };
};

export const setTextColor = (editor: Editor, id: InlinePaletteColor | null) => {
  Editor.removeMark(editor, "textGradient");
  const entry = getInlinePaletteEntry(id);
  if (entry) {
    Editor.addMark(editor, "color", entry.light);
    Editor.addMark(editor, "darkColor", entry.dark);
  } else {
    Editor.removeMark(editor, "color");
    Editor.removeMark(editor, "darkColor");
  }
};

export const setTextGradient = (editor: Editor, id: TextGradientPresetId) => {
  Editor.removeMark(editor, "color");
  Editor.removeMark(editor, "darkColor");
  Editor.addMark(editor, "textGradient", id);
};

export const setHighlight = (editor: Editor, id: InlinePaletteColor | null) => {
  if (id) Editor.addMark(editor, "highlight", id);
  else Editor.removeMark(editor, "highlight");
};

export const clearColors = (editor: Editor) => {
  setTextColor(editor, null);
  setHighlight(editor, null);
};

/** 按取值套用：字色 / 渐变二选一，高亮独立 */
export const applyColorValue = (editor: Editor, value: ColorValue) => {
  if (value.gradient) setTextGradient(editor, value.gradient);
  else if (value.text && value.text !== "custom") setTextColor(editor, value.text);
  if (value.highlight) setHighlight(editor, value.highlight);
};

const LAST_COLOR_KEY = "editor-last-inline-color";
const DEFAULT_LAST_COLOR: ColorValue = { text: null, gradient: null, highlight: "yellow" };

/** 触发器左半「一键套用」的组合：最近一次在面板里挑过的字色 / 渐变 + 高亮 */
export const readLastColor = (): ColorValue => {
  try {
    const raw = localStorage.getItem(LAST_COLOR_KEY);
    if (!raw) return DEFAULT_LAST_COLOR;
    const parsed = JSON.parse(raw) as Partial<ColorValue>;
    const value: ColorValue = {
      text: getInlinePaletteEntry(parsed.text)?.id ?? null,
      gradient: isTextGradientPresetId(parsed.gradient) ? parsed.gradient : null,
      highlight: getInlinePaletteEntry(parsed.highlight)?.id ?? null,
    };
    return value.text || value.gradient || value.highlight ? value : DEFAULT_LAST_COLOR;
  } catch {
    return DEFAULT_LAST_COLOR;
  }
};

export const writeLastColor = (value: ColorValue) => {
  try {
    localStorage.setItem(LAST_COLOR_KEY, JSON.stringify(value));
  } catch {
    // 存储不可用时只是失去记忆，不影响着色
  }
};

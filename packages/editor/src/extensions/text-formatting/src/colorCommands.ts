import { Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { type EditorCommand } from "@tau/editor/api";
import {
  getInlinePaletteEntry,
  isTextGradientPresetId,
  type InlinePaletteColor,
} from "../palette.ts";
import {
  applyColorValue,
  clearColors,
  setHighlight,
  setTextColor,
  setTextGradient,
  type ColorValue,
} from "./components/ColorText/colorMarks.ts";

const isColor = (value: unknown): value is InlinePaletteColor | null =>
  value === null || Boolean(getInlinePaletteEntry(value));

const parseColorValue = (value: unknown): ColorValue | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ColorValue>;
  return (candidate.text === "custom" || isColor(candidate.text)) &&
    (candidate.gradient === null || isTextGradientPresetId(candidate.gradient)) &&
    isColor(candidate.highlight)
    ? (candidate as ColorValue)
    : null;
};

const colorActions: EditorCommand[] = [
  {
    id: "tau.mark.set-text-color",
    run: (editor, { payload }) => {
      if (isColor(payload)) setTextColor(editor, payload);
    },
  },
  {
    id: "tau.mark.set-gradient",
    run: (editor, { payload }) => {
      if (isTextGradientPresetId(payload)) setTextGradient(editor, payload);
    },
  },
  {
    id: "tau.mark.set-highlight",
    run: (editor, { payload }) => {
      if (isColor(payload)) setHighlight(editor, payload);
    },
  },
  { id: "tau.mark.clear-colors", run: editor => clearColors(editor) },
  {
    id: "tau.mark.apply-colors",
    run: (editor, { payload }) => {
      const value = parseColorValue(payload);
      if (!value) return;
      applyColorValue(editor, value);
      ReactEditor.focus(editor);
      if (editor.selection) Transforms.collapse(editor, { edge: "end" });
    },
  },
];

export const colorCommands: EditorCommand[] = colorActions.map(command => ({
  ...command,
  when: editor => !ReactEditor.isReadOnly(editor),
}));

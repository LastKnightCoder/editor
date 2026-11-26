import {
  createI18nRuntime,
  createLocaleStore,
  type I18nRuntime,
  type TranslationValues,
} from "@tau/i18n";
import { whiteboardMessages, type WhiteboardMessageKey } from "./messages.ts";
import type Board from "./Board";

export const standaloneWhiteboardI18n = createI18nRuntime({
  localeSource: createLocaleStore("zh-CN"),
});
const boardRuntimes = new WeakMap<Board, I18nRuntime>();
export function bindWhiteboardI18n(board: Board, runtime: I18nRuntime): void {
  boardRuntimes.set(board, runtime);
}
export function whiteboardRuntime(board: Board): I18nRuntime {
  return boardRuntimes.get(board) ?? standaloneWhiteboardI18n;
}
export function whiteboardT(
  board: Board,
  key: WhiteboardMessageKey,
  values?: TranslationValues
): string {
  return whiteboardRuntime(board).get(whiteboardMessages).t(key, values);
}

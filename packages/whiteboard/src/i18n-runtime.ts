import { standaloneWhiteboardI18n } from "./locale-runtime.ts";
export { standaloneWhiteboardI18n } from "./locale-runtime.ts";
import type Board from "./Board";
import { type I18nRuntime, type TranslationValues } from "@tau/i18n";
import { whiteboardMessages, type WhiteboardMessageKey } from "./messages.ts";

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

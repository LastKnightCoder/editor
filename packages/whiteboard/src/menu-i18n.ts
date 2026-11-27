import type { TranslationValues } from "@tau/i18n";
import type Board from "./Board";
import type { PluginContextMenuItem } from "./types";
import type { WhiteboardMessageKey } from "./messages";
import { whiteboardT } from "./i18n-runtime";

/** 导出以便声明生成可命名携带标记的返回类型（TS4058）。 */
export const MENU_MESSAGE = Symbol("whiteboard.menu.message");
export interface MenuMessage {
  key: WhiteboardMessageKey;
  values?: TranslationValues;
}
type MessageItem = PluginContextMenuItem & { [MENU_MESSAGE]?: MenuMessage };

/** The enumerable marker survives extension menu registration without changing its action identity. */
export function menuText(board: Board, key: WhiteboardMessageKey, values?: TranslationValues) {
  const message = { key, values: values && Object.freeze({ ...values }) };
  return { label: whiteboardT(board, key, message.values), [MENU_MESSAGE]: message };
}
/** 命名返回类型：声明生成需要可命名的类型（TS4058）。 */
export type MenuText = ReturnType<typeof menuText>;
export function menuLabelReader(board: Board, item: PluginContextMenuItem): () => string {
  const message = (item as MessageItem)[MENU_MESSAGE];
  if (message) return () => whiteboardT(board, message.key, message.values);
  const label = item.label;
  return () => label;
}

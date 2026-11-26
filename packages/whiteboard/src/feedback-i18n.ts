import type { TranslationValues } from "@tau/i18n";
import type Board from "./Board";
import { whiteboardRuntime } from "./i18n-runtime.ts";
import { whiteboardMessages, type WhiteboardMessageKey } from "./messages.ts";

/** Keep the same toast and timer while its owner locale changes. */
export function whiteboardFeedback(
  board: Board,
  key: WhiteboardMessageKey,
  values?: TranslationValues
) {
  const translator = whiteboardRuntime(board).get(whiteboardMessages);
  const parameters = values && Object.freeze({ ...values });
  const getMessage = () => translator.t(key, parameters);
  return [getMessage(), { getMessage }] as const;
}

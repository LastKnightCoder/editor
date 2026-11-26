import type { TranslationValues } from "@tau/i18n";
import type { EditorMenuContext, MenuValue } from "./core/api/menu";
import { editorT, type EditorMessageKey } from "./i18n-runtime";

type MessageValue<T> = T | ((context: EditorMenuContext) => T);
type MenuMessage = {
  key: MessageValue<EditorMessageKey>;
  values?: MessageValue<TranslationValues>;
};
const messages = new WeakMap<(context: EditorMenuContext) => string, MenuMessage>();
const evaluate = <T>(value: MessageValue<T>, context: EditorMenuContext): T =>
  typeof value === "function" ? (value as (context: EditorMenuContext) => T)(context) : value;

export function menuText(
  key: MessageValue<EditorMessageKey>,
  values?: MessageValue<TranslationValues>
) {
  const title = (context: EditorMenuContext) =>
    editorT(context.editor, evaluate(key, context), values && evaluate(values, context));
  messages.set(title, { key, values });
  return title;
}

export function menuLabelReader(
  title: MenuValue<string>,
  context: EditorMenuContext
): () => string {
  const message = typeof title === "function" ? messages.get(title) : undefined;
  if (!message) {
    const label = typeof title === "function" ? title(context) : title;
    return () => label;
  }
  // 状态与参数仍在打开时求值；之后只重新解析语言。
  const key = evaluate(message.key, context);
  const values = message.values && evaluate(message.values, context);
  editorT(context.editor, key, values);
  return () => editorT(context.editor, key, values);
}

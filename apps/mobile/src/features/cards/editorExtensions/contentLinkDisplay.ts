import type { MobileEditorMessageKey } from "../editorToolbar/i18n";
import { mobileEditorTranslator } from "../editorToolbar/i18n";
import { getContentLinkKindMeta } from "./contentLinkModel";

const LABEL_KEYS: Record<string, MobileEditorMessageKey> = {
  card: "kind.card",
  article: "kind.article",
  "project-item": "kind.project-item",
  "plugin-entity": "kind.plugin-entity",
};
export function getContentLinkDisplayMeta(contentType: string) {
  const meta = getContentLinkKindMeta(contentType);
  return {
    ...meta,
    label: LABEL_KEYS[contentType] ? mobileEditorTranslator.t(LABEL_KEYS[contentType]) : meta.label,
  };
}

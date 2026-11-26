import { contextKindLabel, contextTranslator } from "../../context/i18n";
import { ENTITY_KIND_META } from "../../context/model";
import { mobileEditorTranslator } from "../editorToolbar/i18n";
import { getContentLinkKindMeta } from "./contentLinkModel";

export function getContentLinkDisplayMeta(contentType: string) {
  const meta = getContentLinkKindMeta(contentType);
  return {
    ...meta,
    label: Object.hasOwn(ENTITY_KIND_META, contentType)
      ? contextKindLabel(contentType, contextTranslator)
      : mobileEditorTranslator.t("kind.content"),
  };
}

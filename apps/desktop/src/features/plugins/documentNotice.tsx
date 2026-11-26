import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor/api";
import {
  PLUGIN_DOCUMENT_NOTICE_TYPES,
  type PluginDocumentNoticeElement,
} from "@tau/plugins/document";
import { DocumentMediaNotice } from "@tau/shared/document-media-notice";
function Notice({
  attributes,
  children,
  element,
}: ElementRenderProps<PluginDocumentNoticeElement>) {
  const inline = element.type === PLUGIN_DOCUMENT_NOTICE_TYPES.inline;
  const Tag = inline ? "span" : "div";
  return (
    <Tag {...attributes}>
      <DocumentMediaNotice kind={element.mediaKind} alt={element.alt} inline={inline} />
      {children}
    </Tag>
  );
}
export const pluginDocumentNoticeExtension = defineExtension({
  id: "host.plugin-document-notice",
  elements: [
    defineElement<PluginDocumentNoticeElement>({
      type: PLUGIN_DOCUMENT_NOTICE_TYPES.block,
      dataVersion: 1,
      kind: "block",
      isVoid: true,
      isEmpty: () => false,
      render: Notice,
    }),
    defineElement<PluginDocumentNoticeElement>({
      type: PLUGIN_DOCUMENT_NOTICE_TYPES.inline,
      dataVersion: 1,
      kind: "inline",
      isVoid: true,
      isEmpty: () => false,
      render: Notice,
    }),
  ],
});

declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    "plugin-document-media": Extract<
      PluginDocumentNoticeElement,
      { type: "plugin-document-media" }
    >;
    "plugin-document-inline-media": Extract<
      PluginDocumentNoticeElement,
      { type: "plugin-document-inline-media" }
    >;
  }
  interface ExtensionInlineElementMap {
    "plugin-document-inline-media": Extract<
      PluginDocumentNoticeElement,
      { type: "plugin-document-inline-media" }
    >;
  }
}

/** 移动端插件资料（README / CHANGELOG）文档化：清洗规则见 @tau/plugins/document。 */

import { createMarkdownProcessor } from "@tau/markdown";
import { createPluginDocumentReader } from "@tau/plugins/document";
import { textFormattingCodec } from "@tau/editor/extensions/text-formatting/markdown";
import { BUILTIN_CONTENT_RESOURCES, mergeContentResources } from "@tau/db-schema/content-resources";
import { mobileContentPlugins } from "../app/plugins/content";
import { mobileCodecComposition } from "./editorMarkdown";

const documentMarkdown = createMarkdownProcessor({
  codecs: mobileCodecComposition.filter(codec => !codec.fence),
  textCodecs: [textFormattingCodec],
});

export const toPluginDocument = createPluginDocumentReader({
  importFromMarkdown: (markdown, ignoreTypes) =>
    documentMarkdown.importFromMarkdown(markdown, ignoreTypes),
  resources: () => mergeContentResources(mobileContentPlugins.resources, BUILTIN_CONTENT_RESOURCES),
});

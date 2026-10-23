/** 桌面端插件资料（README / CHANGELOG）文档化：清洗规则见 @tau/plugins/document。 */

import { createMarkdownProcessor } from "@tau/markdown";
import { createPluginDocumentReader } from "@tau/plugins/document";
import { textFormattingCodec } from "@tau/editor/extensions/text-formatting/markdown";
import { contentResourceDeclarations } from "@/services/content-resources";
import { desktopCodecComposition } from "@/utils/markdown-composition";

const documentMarkdown = createMarkdownProcessor({
  codecs: desktopCodecComposition.filter(codec => !codec.fence),
  textCodecs: [textFormattingCodec],
});

export const toPluginDocument = createPluginDocumentReader({
  importFromMarkdown: (markdown, ignoreTypes) =>
    documentMarkdown.importFromMarkdown(markdown, ignoreTypes),
  resources: contentResourceDeclarations,
});

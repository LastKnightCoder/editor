import { createMarkdownProcessor } from "@tau/markdown";
import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { customBlockCodec } from "@tau/editor-custom-block/markdown";
import { diagramMarkdownCodecs } from "@tau/editor-diagram/markdown";
import { webviewCodec } from "@tau/editor-webview/markdown";
import { markdownCustomDirectives } from "@tau/shared/markdown-directives";

export const extensionCodecComposition = [
  ...editorMarkdownCodecs,
  ...diagramMarkdownCodecs,
  customBlockCodec,
  webviewCodec,
];
export const extensionMarkdown = createMarkdownProcessor({ codecs: extensionCodecComposition });

export const extensionImportFromMarkdown = (
  markdown: string,
  ignoreTypes?: string[],
  options?: Parameters<typeof extensionMarkdown.importFromMarkdown>[2]
) =>
  extensionMarkdown.importFromMarkdown(markdown, ignoreTypes, {
    customDirectives: { ...markdownCustomDirectives, ...options?.customDirectives },
  });

import { createMarkdownProcessor } from "@tau/markdown";
import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { customBlockCodec } from "@tau/editor-custom-block/markdown";
import { diagramMarkdownCodecs } from "@tau/editor-diagram/markdown";
import { webviewCodec } from "@tau/editor-webview/markdown";
import { markdownCustomDirectives } from "@tau/shared/markdown-directives";

export const mobileCodecComposition = [
  ...editorMarkdownCodecs,
  ...diagramMarkdownCodecs,
  customBlockCodec,
  webviewCodec,
];
export const mobileMarkdown = createMarkdownProcessor({ codecs: mobileCodecComposition });

export const mobileImportFromMarkdown = (
  markdown: string,
  ignoreTypes?: string[],
  options?: Parameters<typeof mobileMarkdown.importFromMarkdown>[2]
) =>
  mobileMarkdown.importFromMarkdown(markdown, ignoreTypes, {
    customDirectives: { ...markdownCustomDirectives, ...options?.customDirectives },
  });

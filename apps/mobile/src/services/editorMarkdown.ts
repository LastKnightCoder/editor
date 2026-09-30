import { createMarkdownProcessor } from "@tau/markdown";
import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { customBlockCodec } from "@tau/editor-custom-block/markdown";
import { diagramMarkdownCodecs } from "@tau/editor-diagram/markdown";
import { htmlMarkdownCodecs } from "@tau/editor-html/markdown";
import { codeBlockCodec } from "@tau/editor-code-block/markdown";
import { mathMarkdownCodecs } from "@tau/editor-math/markdown";
import { webviewCodec } from "@tau/editor-webview/markdown";
import { markdownCustomDirectives } from "@tau/shared/markdown-directives";

export const mobileCodecComposition = [
  ...editorMarkdownCodecs,
  codeBlockCodec,
  ...mathMarkdownCodecs,
  ...htmlMarkdownCodecs,
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

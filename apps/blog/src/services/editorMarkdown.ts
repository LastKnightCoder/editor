import { createMarkdownProcessor } from "@tau/markdown";
import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { customBlockCodec } from "@tau/editor-custom-block/markdown";
import { diagramMarkdownCodecs } from "@tau/editor-diagram/markdown";
import { webviewCodec } from "@tau/editor-webview/markdown";

/** 发布预览的 codec 组合；与 blog 场景 kit 的元素覆盖一起检查。 */
export const blogCodecComposition = [
  ...editorMarkdownCodecs,
  ...diagramMarkdownCodecs,
  customBlockCodec,
  webviewCodec,
];
export const blogMarkdown = createMarkdownProcessor({ codecs: blogCodecComposition });

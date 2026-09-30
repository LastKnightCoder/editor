/**
 * Desktop 的 Markdown 处理器：内置扩展（@tau/editor/markdown）+ webview + desktop 业务元素
 * （markdown-codecs.ts）的 codec 合成一次（01 §8.2）。渲染进程与 Electron 主进程都从这里取，
 * 保证两边解析规则一致。
 */
import { createMarkdownProcessor } from "@tau/markdown";
import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { customBlockCodec } from "@tau/editor-custom-block/markdown";
import { diagramMarkdownCodecs } from "@tau/editor-diagram/markdown";
import { htmlMarkdownCodecs } from "@tau/editor-html/markdown";
import { codeBlockCodec } from "@tau/editor-code-block/markdown";
import { mathMarkdownCodecs } from "@tau/editor-math/markdown";
import { webviewCodec } from "@tau/editor-webview/markdown";
import { desktopMarkdownCodecs } from "./markdown-codecs.ts";

export const desktopCodecComposition = [
  ...editorMarkdownCodecs,
  codeBlockCodec,
  ...mathMarkdownCodecs,
  ...htmlMarkdownCodecs,
  ...diagramMarkdownCodecs,
  customBlockCodec,
  webviewCodec,
  ...desktopMarkdownCodecs,
];
export const desktopMarkdown = createMarkdownProcessor({ codecs: desktopCodecComposition });

export const importFromMarkdown = desktopMarkdown.importFromMarkdown;
export const importFromMarkdownWithPositions = desktopMarkdown.importFromMarkdownWithPositions;
export const getMarkdown = desktopMarkdown.getMarkdown;
export const getMarkdownWithPositions = desktopMarkdown.getMarkdownWithPositions;
export const elementToMarkdown = desktopMarkdown.elementToMarkdown;

export {
  leafToMarkdown,
  leafToMarkdownStructured,
  type SlateWithPositions,
  type MarkdownWithPositions,
} from "@tau/markdown";

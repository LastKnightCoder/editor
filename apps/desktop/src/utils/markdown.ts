/**
 * Desktop 的 Markdown 处理器：内置扩展（@tau/editor/markdown）+ webview + desktop 业务元素
 * （markdown-codecs.ts）的 codec 合成一次（01 §8.2）。渲染进程与 Electron 主进程都从这里取，
 * 保证两边解析规则一致。
 */
import { createPluginMarkdownProcessor } from "@tau/plugins/content";
import { textFormattingCodec } from "@tau/editor/extensions/text-formatting/markdown";
import { desktopContentPlugins } from "../../shared/content-plugins.ts";
import { desktopCodecComposition } from "./markdown-composition.ts";
export { desktopCodecComposition } from "./markdown-composition.ts";

export const desktopMarkdown = createPluginMarkdownProcessor(
  {
    codecs: desktopCodecComposition,
    textCodecs: [textFormattingCodec],
  },
  desktopContentPlugins
);

export const importFromMarkdown = desktopMarkdown.importFromMarkdown;
export const importFromMarkdownWithPositions = desktopMarkdown.importFromMarkdownWithPositions;
export const getMarkdown = desktopMarkdown.getMarkdown;
export const getMarkdownWithPositions = desktopMarkdown.getMarkdownWithPositions;
export const elementToMarkdown = desktopMarkdown.elementToMarkdown;

export const leafToMarkdown = desktopMarkdown.leafToMarkdown;
export const leafToMarkdownStructured = desktopMarkdown.leafToMarkdownStructured;
export { type SlateWithPositions, type MarkdownWithPositions } from "@tau/markdown";

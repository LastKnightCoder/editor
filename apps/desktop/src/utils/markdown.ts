/**
 * Desktop 的 Markdown 处理器：@tau/markdown 内置元素 + desktop 业务元素（markdown-codecs.ts）。
 * 渲染进程与 Electron 主进程都从这里取，保证两边解析规则一致。
 */
import { createMarkdownProcessor } from "@tau/markdown";
import { desktopMarkdownCodecs } from "./markdown-codecs";

export const desktopMarkdown = createMarkdownProcessor({ codecs: desktopMarkdownCodecs });

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

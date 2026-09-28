// 导出端入口：与 ./markdown 共用同一个 desktop 处理器
import { desktopMarkdown } from "./markdown";

export { getMarkdown, elementToMarkdown } from "./markdown";
export const getMarkdownWithPositions = desktopMarkdown.getMarkdownWithPositions;
export {
  leafToMarkdown,
  leafToMarkdownStructured,
  type MarkdownWithPositions,
} from "@tau/markdown";

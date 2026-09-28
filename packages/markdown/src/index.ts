/**
 * @tau/markdown：Markdown ↔ Slate 的 headless 实现（01 §8）。
 * 不依赖 DOM，Electron 主进程、脚本、浏览器共用；源码 ↔ 富文本双向位置映射是框架能力。
 */
export {
  importFromMarkdown,
  importFromMarkdownWithPositions,
  isMarkdownLikeText,
  type ImportFromMarkdownOptions,
  type CustomDirectiveHandler,
  type SlateWithPositions,
} from "./markdown.ts";
export {
  getMarkdown,
  getMarkdownWithPositions,
  elementToMarkdown,
  leafToMarkdown,
  leafToMarkdownStructured,
  type MarkdownWithPositions,
} from "./markdown-helper.ts";
export {
  markdownSerializerRegistry,
  MarkdownSerializerRegistry,
  type MarkdownSerializer,
  type SerializerOutput,
} from "./markdownSerializerRegistry.ts";
export {
  PositionMapper,
  type MarkdownPosition,
  type SlatePosition,
  type TextMapping,
  type ElementMapping,
  type PositionMapping,
} from "./positionMapper.ts";

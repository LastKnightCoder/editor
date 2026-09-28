/**
 * @tau/markdown：Markdown ↔ Slate 的 headless 实现（01 §8）。
 * 不依赖 DOM，Electron 主进程、脚本、浏览器共用；源码 ↔ 富文本双向位置映射是框架能力。
 *
 * 只认内置元素类型。宿主有自己的元素类型（desktop 的附件、内容链接等）时，
 * 用 createMarkdownProcessor({ codecs }) 建一个处理器，渲染进程与主进程共用。
 */
import { createMarkdownProcessor } from "./processor.ts";

export {
  createMarkdownProcessor,
  type MarkdownProcessor,
  type MarkdownProcessorOptions,
} from "./processor.ts";
export type { MarkdownCodec, CustomDirectiveHandler } from "./codec.ts";

/** 只含内置类型的默认处理器 */
const builtinProcessor = createMarkdownProcessor();

export const importFromMarkdown = builtinProcessor.importFromMarkdown;
export const importFromMarkdownWithPositions = builtinProcessor.importFromMarkdownWithPositions;
export const getMarkdown = builtinProcessor.getMarkdown;
export const getMarkdownWithPositions = builtinProcessor.getMarkdownWithPositions;
export const elementToMarkdown = builtinProcessor.elementToMarkdown;

export {
  isMarkdownLikeText,
  type ImportFromMarkdownOptions,
  type SlateWithPositions,
} from "./markdown.ts";
export {
  leafToMarkdown,
  leafToMarkdownStructured,
  type MarkdownWithPositions,
} from "./markdown-helper.ts";
export {
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

/**
 * @tau/markdown：Markdown ↔ Slate 的 headless 框架（01 §8）。
 * 不依赖 DOM，Electron 主进程、脚本、浏览器共用；源码 ↔ 富文本双向位置映射是框架能力。
 *
 * 框架不自带任何元素类型：标准 Markdown 语法（标题、列表、表格、代码围栏…）的解析在
 * 导入端 walker 里，directive / 序列化器 / void 表 / 行内包裹全部由扩展的 codec 注入
 * （内置扩展见 @tau/editor/markdown，图表类见 P9 的 @tau/editor-diagram/markdown）。
 * 宿主把 codec 列表合成一次建处理器，渲染进程与主进程共用。
 */
import type {} from "./slate-types.d.ts";

export {
  createMarkdownProcessor,
  type MarkdownProcessor,
  type MarkdownProcessorOptions,
} from "./processor.ts";
export type { MarkdownTextCodec, MarkdownTextRule, LeafSerializationResult } from "./textCodec.ts";
export type {
  MarkdownCodec,
  CustomDirectiveHandler,
  MarkdownImportNode,
  MarkdownImportContext,
} from "./codec.ts";

export {
  isMarkdownLikeText,
  type ImportFromMarkdownOptions,
  type SlateWithPositions,
} from "./markdown.ts";
export { addExportFootnote, type MarkdownWithPositions } from "./markdown-helper.ts";
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

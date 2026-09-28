// 过渡壳：实现已迁到 @tau/markdown（docs/editor-refactor 02 P5），使用方切换完成后删除
export {
  importFromMarkdown,
  importFromMarkdownWithPositions,
  type SlateWithPositions,
  markdownSerializerRegistry,
  type MarkdownSerializer,
  getMarkdown,
  elementToMarkdown,
  leafToMarkdown,
} from "@tau/markdown";

# 样式文本扩展

`@tau/editor-styled-text` 的默认导出是 styledTextExtension，拥有 styled-text 行内元素、选色弹层、工具条、颜色数据及 codec。

- 根入口导出扩展、StyledTextElement、wrapStyledText/unwrapStyledText。
- `/colors` 导出 EStyledColor 和 StyledTextColorStyle，保留存量色值。
- `/markdown` 导出 styledTextCodec；`/types` 是纯元素模型，渲染根入口负责公共元素映射登记。

选色面板通过格式包的公开 panels 子入口复用，不自动安装其 marks；弹层接核心返回仲裁。包裹/解包保留展开选区的内容和标记，没有展开选区或只读时不写入。原 localStorage 选择键、节点字段与 Markdown 指令保持。

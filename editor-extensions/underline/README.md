# 彩色下划线扩展

`@tau/editor-underline` 的默认导出是 underlineExtension，提供存量 underline 行内元素及颜色/线型工具条。它与文本格式扩展的布尔 underline mark 是不同的数据形态，不互相替代。

- 根入口导出扩展、UnderlineElement、wrapUnderline/unwrapUnderline。
- `/markdown` 导出 underlineCodec；`/types` 是纯元素模型，渲染根入口负责公共元素映射登记。
- `/styles.css` 引用文本格式包的共享色板。宿主已导入格式样式时无需重复导入。

色板和面板通过格式包的公开子入口复用，不自动安装其 marks。包裹/解包保留展开选区的文本与叶子标记；没有展开选区或只读时不写入。段落仍由核心提供。

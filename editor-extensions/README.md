# 编辑器功能扩展

跨端功能扩展统一在本目录，按完整功能拆包。核心仅内建 paragraph/text；宿主显式装配扩展，生产源码经 @tau/editor/api 使用核心能力，禁止深引内部文件。

standard.ts 是仓库内既有基础能力的产品组合，不是独立包，也不会由核心自动安装。其他功能仍由各宿主场景显式选择。包名、扩展/命令 id 与文档字段不随目录迁移改名。

| 目录                                              | 包名                        | 领域               |
| ------------------------------------------------- | --------------------------- | ------------------ |
| [annotation](./annotation/package.json)           | @tau/editor-annotation      | 行内注释           |
| [blockquote](./blockquote/package.json)           | @tau/editor-blockquote      | 引用块             |
| [callout](./callout/package.json)                 | @tau/editor-callout         | Callout            |
| [code-block](./code-block/package.json)           | @tau/editor-code-block      | 代码块及高亮运行时 |
| [comment](./comment/package.json)                 | @tau/editor-comment         | 批注               |
| [detail](./detail/package.json)                   | @tau/editor-detail          | 详情折叠           |
| [diagram](./diagram/package.json)                 | @tau/editor-diagram         | 五类图表           |
| [divide-line](./divide-line/package.json)         | @tau/editor-divide-line     | 分割线             |
| [emoji](./emoji/package.json)                     | @tau/editor-emoji           | 表情               |
| [front-matter](./front-matter/package.json)       | @tau/editor-front-matter    | 文档元数据         |
| [header](./header/package.json)                   | @tau/editor-header          | 标题               |
| [highlight-block](./highlight-block/package.json) | @tau/editor-highlight-block | 高亮容器           |
| [kbd](./kbd/package.json)                         | @tau/editor-kbd             | 键盘标签           |
| [link](./link/package.json)                       | @tau/editor-link            | 链接               |
| [list](./list/package.json)                       | @tau/editor-list            | 列表系             |
| [math](./math/package.json)                       | @tau/editor-math            | 块级与行内公式     |
| [media](./media/package.json)                     | @tau/editor-media           | 五类媒体           |
| [styled-text](./styled-text/package.json)         | @tau/editor-styled-text     | 样式文本           |
| [table](./table/package.json)                     | @tau/editor-table           | 表格、行和单元格   |
| [tabs](./tabs/package.json)                       | @tau/editor-tabs            | 多面板容器         |
| [text-formatting](./text-formatting/package.json) | @tau/editor-text-formatting | 文本格式           |
| [underline](./underline/package.json)             | @tau/editor-underline       | 彩色下划线         |
| [webview](./webview/package.json)                 | @tau/editor-webview         | 网页嵌入           |

源码预览支撑 @tau/editor-source-view、协作适配 @tau/editor-collab、核心、Markdown 框架、UI 与主题保留在 packages。聊天治理不在本次范围内；宿主专有数据库、白板等扩展仍留对应应用。

编解码使用各包已声明的 /markdown 入口，不能从 UI 根入口取得；没有专用语法的批注和 Tabs 使用通用 tau-node 保真。宿主须扫描所选包的 src，并按包说明显式导入 CSS。具体公开入口以 package.json 的 exports 为准。

[边界与推进约定](../docs/editor-refactor/07-核心与扩展边界及推进约定.md)和[决策记录](../docs/editor-refactor/03-决策记录.md)描述协议；[完成审计](../docs/editor-refactor/11-完成审计与验证矩阵.md)记录当前证据与限制。目录归一、公开入口收回和[外部扩展示例](../examples/editor-reminder/README.md)均已完成。

# HTML

在 Tau 文档中插入并编辑 HTML 片段，行内与块级两种形式由同一个插件提供。

- 块级 HTML：源码预览、全屏编辑与拖拽。
- 行内 HTML：点击片段打开输入框，Enter、Esc 或点击外部确认，空白内容删除片段。
- 支持完整写出的 Tailwind 类名，以及博客发布和 HTML/EPUB 静态导出。
- 保留既有 html-block/html-inline 节点、源码和 children，不需要转换文档。

## 开始使用

需要包含本次 HTML 插件接线的 Tau 0.59.0 或更高版本。从插件中心安装并启用 HTML，完整退出并重启后，在插入菜单选择「HTML → 块级HTML / 行内HTML」。

Markdown 导入使用原生 HTML 标签。独立 div 等块级标签生成 HTML 块，段落内 b/span 等标签生成行内片段；html 代码围栏仍按普通代码处理。

只读页面只显示内容，不会打开行内编辑或写回文档。停用或缺少插件时，原节点按未知节点规则保留；静态导出显示转义源码。移动端与浏览器扩展不加载插件。

## 开发

使用 pnpm 冻结安装后执行 pnpm test、pnpm check、pnpm build。插件只依赖公开 SDK 与 UI，不打包 Slate、编辑器实例或宿主源码。开发安装和发布流程见 DEVELOPMENT.md。

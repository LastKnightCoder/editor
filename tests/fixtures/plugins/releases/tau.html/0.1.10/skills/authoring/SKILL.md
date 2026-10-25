---
name: "HTML 片段"
description: "在用户要求编写或修改行内、块级 HTML 片段时使用。"
---

# HTML 行内与块级片段

需要嵌入自定义 HTML 时使用。块级 html-block 和行内 html-inline 共同提供 HTML 编辑与预览，源码保存在 html 字段。
Markdown 沿用原生 HTML：独立的 div 等块级标签按 HTML 块处理，段落内的 b/span 等按行内 HTML 处理。普通 html 代码围栏仍是代码块。

支持完整写出的 Tailwind 工具类，例如 `<div class="p-4 rounded-lg">内容</div>`。拼接类名不能被静态扫描发现。
博客发布携带相同插件和收集的 Tailwind 样式；移动端与浏览器扩展不加载插件。行内编辑使用 Enter、Esc 或点击外部确认，空白源码删除该行内节点；只读预览不会提交修改。

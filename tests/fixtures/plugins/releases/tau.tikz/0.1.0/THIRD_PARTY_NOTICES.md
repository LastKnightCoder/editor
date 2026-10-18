# 第三方资源说明

本插件的原创 TypeScript 与构建接线使用仓库 LICENSE 中的 MIT 许可证。内嵌编译器、TeX/LaTeX 宏包和字体分别保留其原有许可证，不因插件的 MIT 声明改变。

## TikZJax 与内嵌 TeX 资源

- 原项目：https://github.com/kisonecat/tikzjax
- 浏览器 Worker/WASM 分支：https://github.com/drgrice1/tikzjax
- 参考包装：https://github.com/artisticat1/obsidian-tikzjax
- TikZJax 的 LPPL 1.3c 全文随包提供于 LICENSE-LPPL.md。
- TeX 引擎、LaTeX、PGF/TikZ 及预装宏包的源码与原许可证由上述上游仓库及 https://ctan.org 提供。原引擎和宏包编译数据未修改。

本次迁出的精确输入来自 Tau 主仓库提交 1e8ee22baf8388cc187c729eda1ba03f3a74106e：

- editor-extensions/diagram/src/renderers/TikZ/tikzjax.js，原 SHA-256：cfb59a4fc80b943965a5d4230c9ba8d357f90539f9410a7d607b1e2fe584b96c。
- editor-extensions/diagram/src/renderers/TikZ/tikz.vendor.css，原 SHA-256：dd6b5826607731df282fb7e63b57892f699c8a0c753c98cb2f6b51eb5db283c5。
- 原文件：https://github.com/LastKnightCoder/editor/tree/1e8ee22baf8388cc187c729eda1ba03f3a74106e/editor-extensions/diagram/src/renderers/TikZ

与输入相比，vendor JS 仅把失败时的远程图片占位改为本地 data-tau-tikz-error 标记，避免错误输入触发外部请求；字体 CSS 仅移除 Obsidian 页面布局选择器。该版本由 LastKnightCoder 维护，上游作者不承担本插件的维护责任。Git 历史保留资源与变更，后续更新须同步来源和许可证。

## BaKoMa 字体

字体内原版权归 Basil K. Malyshev。BaKoMa Fonts Licence 全文随包提供于 LICENSE-BAKOMA.txt；字体数据保持原样，仅改变 CSS 的承载位置。

字体源与许可：https://ctan.org/pkg/bakoma-fonts

## Obsidian TikZJax 包装许可

MIT License

Copyright (c) 2022 artisticat1

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

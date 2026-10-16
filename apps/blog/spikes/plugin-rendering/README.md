# 预编译博客加载未知插件：spike

本文保留早期可行性实验的过程与结论，后续正式实现和当前验收入口见 [C23 编辑器扩展与博客发布](../../../../docs/plugin-system/40-C23编辑器扩展与博客发布.md)。维护时使用 `node apps/desktop/scripts/verify-editor-publish.mjs` 验证正式链路；下述限制描述的是实验当时的范围。

仅验证技术可行性，不修改正式 SDK、博客入口或发布协议。不做截图或视觉验收。

## 任务

- COMPLETE：Investigate/Triage/Understand the problem。真实 ArticlePage 经 getBlogKit 获取 EditorKit，既有 extend 可以装配运行时扩展。
- COMPLETE：独立构建预编译壳、单入口插件及发布夹具，真实 Chromium 中的交互与失败行为通过。
- COMPLETE：类型检查通过，结论、限制及正式接入所需改动如下。

## 要验证的命题

先编译不知道样本插件的博客壳；后构建一个插件 main.js。发布阶段只复制预编译壳和插件产物、注入 JSON 数据与依赖清单，不重新编译壳。浏览器加载清单里的插件并装配真实 EditorKit，实际 ArticlePage 显示新增节点并支持交互。

## 结论

技术可行。预编译的是调用逻辑，EditorKit 的扩展数组可以在运行时决定。作者仅维护一份扩展和一个 main.js，没有第二份 render.js；发布器复制产物，博客加载扩展后再挂载真实 ArticlePage。

## 如何复验

在仓库根目录运行：

```sh
node apps/blog/spikes/plugin-rendering/run.mjs
pnpm --filter blog exec tsc --noEmit -p spikes/plugin-rendering/tsconfig.json
```

脚本输出独立的 `output/plugin-render-spike/<本次ID>/` 目录，包含预编译模板、可访问的站点、完整 report.json 和 browser-report.json。浏览器通过本机 HTTP 访问站点；Electron 窗口隐藏、nodeIntegration 关闭、不提供 preload，只做 DOM 行为断言。

## 已验证的证据

| 检查                                            | 结果                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| 先构建壳，再生成插件版本与唯一标签              | 通过，壳依赖图不含 author.tsx，壳 JS 不含插件节点类型或唯一标签                |
| 发布前后模板 JS SHA-256 完全相同                | 通过，发布阶段没有再调用壳构建                                                 |
| 同一个 CJS main.js 在可编辑 Editor 和博客中运行 | 通过，没有生成额外渲染入口                                                     |
| 实际博客 ArticlePage + getBlogKit.extend        | 通过，构建 alias 只在 spike 接入扩展，不修改正式页面                           |
| React 单例共享                                  | 通过，插件 useState 与宿主引用相同，Hooks 和 UI Button 正常工作                |
| 读写两种模式的内容 DOM 和插件 CSS               | 通过，内容组件 outerHTML 相同、padding 均为 12px；不是截图或完整视觉一致性证明 |
| 只读博客中的交互                                | 通过，按钮把计数 7 改为 8，原文节点数据未修改                                  |
| 博客不执行桌面 activate                         | 通过，桌面式夹具执行一次，博客执行零次                                         |
| 插件升级不重编模板，旧页面固定旧版本            | 通过，同一壳加载 1.0.0 / 1.1.0，旧页面仍使用旧标签                             |
| 发布后删除作者构建目录                          | 通过，网站只请求已复制的站点资源，支持嵌套文章路径                             |
| 发布时缺少节点所属插件                          | 明确拒绝，不写出缺失扩展的页面                                                 |
| 浏览器遇到插件资源缺失、摘要不匹配              | 明确显示错误，未挂载残缺编辑器                                                 |

## 文件职责

- `author.tsx`：唯一作者实现，导出 editorExtensions 和普通插件定义，外部依赖 React / @tau/plugins / @tau/ui。
- `shell.tsx`：预编译的通用加载与启动逻辑；不引用作者实现或节点名称。
- `blog-kit.ts`：将动态扩展追加到现有博客 kit；只在 spike 构建中替换 getBlogKit 的调用入口。
- `publish.ts`：最小发布器，按节点归属收集插件、固定版本与摘要、复制资源并注入数据。
- `verify.ts`：隐藏 Electron 行为验证。
- `run.mjs`：构建、发布、启动 HTTP 服务和 Electron、收集报告的编排。

## 未证明或未实施的部分

1. 使用真实 ArticlePage、EditorKit、PluginHost 与公开 SDK，但博客壳通过 esbuild 独立构建。没有修改或重新发布线上 Vite 模板；正式接入还需改博客启动流程。
2. “桌面”测试页是可编辑 Editor + PluginHost 的最小夹具，不是完整桌面 AppShell。未验证协作、撤销、打开中编辑器的动态替换。
3. `editorExtensions` 静态导出和清单是实验协议，尚未加入正式 SDK、包校验和真实发布器。发布夹具的内置节点只包含段落与文本，真实发布器应从宿主注册表取得完整节点归属。
4. 样本是交互计数块，不是 custom-block 的完整迁移。Babel、动态 Tailwind、源码编辑器、Skill、完整主题和媒体资源仍需下一步验证。
5. CJS 在浏览器通过显式共享模块表执行，复用现有插件产物形式；正式版本需要明确执行策略与 CSP 契约。不能宣称任意含 Electron/Node 顶层依赖的插件都能在浏览器运行。
6. 未做截图或视觉验收；本轮证明相同组件、DOM、指定 CSS 和交互行为一致，不宣称所有复杂内容像素一致。

## 建议的下一步

先把静态扩展贡献、节点归属、共享运行时与版本匹配收敛为最小正式协议，再在真实发布器和博客启动入口接线。随后用 custom-block 验证同一渲染实现与发布时样式准备，不先重写完整插件平台或移动端。

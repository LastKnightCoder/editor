# 模板自己渲染与路由：Vite SPA spike

验证 64 号方案的数据、搜索与 C23 产物协议。正式发布器、SDK、应用页面及旧 spike 均不修改；生成物只写入仓库忽略的 output 目录，不改锁文件、不安装新依赖。

## 复验

在仓库根目录运行：

```sh
node apps/blog/node_modules/typescript/bin/tsc --noEmit -p apps/blog/spikes/template-owned-spa/tsconfig.json
node apps/blog/spikes/template-owned-spa/run.mjs
```

运行器复用已有 Vite、React、React Router、esbuild、Fuse 与 Electron。先构建冻结模板，再独立构建数据工具和真实 C23 计数插件夹具，导出数据并复制静态资产，最后执行无 DOM 协议检查与隐藏 Electron 行为检查。没有截图或视觉走查。

结果写入 `output/template-owned-spa-spike/<ID>/report.json` 与 browser-report.json。报告记录逐项结果、依赖图、实际网络请求、增量数据变化和适用边界。检查失败时进程返回非零并保留报告。

要自行访问已生成站点：

```sh
node apps/blog/spikes/template-owned-spa/serve.mjs output/template-owned-spa-spike/<ID>
```

该命令打印各站点的本机 HTTP 地址，结束时按 Ctrl+C。History fallback 由模板部署夹具声明，实验服务器按该要求提供；正式静态托管需自行配置，协议不自动生成内容 HTML。

## 分工

| 目录/文件                  | 职责                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------ |
| protocol/                  | 无 UI 类型与可选数据工具；显式 manifestUrl、惰性取数、摘要校验、取消和公开索引查询   |
| fixtures.mjs / publish.mjs | 六类结构夹具与机械数据打包；输出 key/数据清单、内容引用、纯摘要 CSS 和插件文件       |
| template/                  | 作者自己的 Vite SPA、渲染方式、依赖适配、插件求值、样式和预览；使用真实 React Router |
| protocol-checks.mjs        | 无 DOM 的正例、错误、取消和初始化检查                                                |
| verify.cjs                 | 沙箱 Electron 中的真实网络和 DOM 行为断言                                            |
| run.mjs / server.mjs       | 构建与发布证据、结构检查、静态服务器及报告                                           |

模板 path 变体使用 BrowserRouter，自行选择 journal/work 等 URL，调用可选数据工具并渲染插件和预览。hash 变体用 HashRouter 和不同 URL，直接 fetch，按 documents 自行检索，只展示摘要，不下载数据工具或插件产物。两者共用同一数据包，业务 URL 不写入清单、搜索索引或引用映射。

## 本次实测结论

2026-10-18 实测通过：类型检查、Vite 生产构建、6 项产物/结构检查、14 项纯数据协议检查和 12 项 Chromium 行为检查。报告位于 [report.json](../../../../output/template-owned-spa-spike/395a52a8-0af3-4443-977c-713342ad500f/report.json)，逐项浏览器证据见 [browser-report.json](../../../../output/template-owned-spa-spike/395a52a8-0af3-4443-977c-713342ad500f/browser-report.json)。这些本地生成物不入库，重新复验会生成新的 ID。

已证明当前边界下可以用独立 Vite SPA 消费数据，并由模板自行完成路由、渲染、内容插件接入和预览；宿主无需提供 UI。换成直接 fetch、只展示摘要的模板，同样可以搜索和按 key 取数。修改一篇文章只改变对应内容、搜索索引与清单，无关正文文件保持原字节和路径。

这一结论限于下述夹具、适配及部署条件，不等同于正式发布器/全部插件已迁移完成。

## 验证范围

- 无前置 readManifest 的读取/搜索、空查询零请求、固定返回字段和命中范围。
- 六类数据、引用到目标 key、原始 documents 自研搜索；资源以数据文件为基准。
- 协议版本、无效 JSON、未知 key、404、身份和摘要错误；初始化失败重试、并发调用取消互不干扰。
- 真实 `scripts/plugins/fixtures/published-editor.tsx` 独立编译，模板构建时不知道插件；CJS 共享依赖由模板自己提供。
- 模板正文与自己的预览中插件状态独立、关闭预览不影响正文、搜索跳转和 Router 前进后退、快速导航取消、深链刷新。
- 根路径与子路径、图片/样式/分包网络加载、资产字节冻结、作者临时目录删除后独立运行。
- 换模板不改数据包；单条内容变化不改无关 JSON；宿主不生成逐内容 HTML。

## 限制

这是新建的独立 Vite 实验，两个模板是同一实验源码的两种作者构建配置，不是两份产品模板。六类数据采用精简夹具，未连接正式数据库、发布 worker、插件中心和上传服务。

模板的正文实现只覆盖夹具所需基础节点；modules.tsx 中的 SDK/UI 适配仅覆盖计数样本用到的 API。它演示模板可以自行提供可执行依赖，不代表类型包已具有完整运行实现，也不证明任意内容插件都已兼容。站点未引用官方模板、应用私有渲染模块或宿主渲染服务。

数据工具只校验实验涉及的协议外形，不替代首版完整 schema；辅助工具的取消退出当前等待，不为零消费者主动终止底层共享请求。直接 fetch 变体验证开放数据消费，不作为完整生产校验器。CSS 是预先给定的资源，未验证 Tailwind 编译或其退役迁移。预览数量、DOM 和样式清理全部属于实验模板选择，不是新增宿主要求。

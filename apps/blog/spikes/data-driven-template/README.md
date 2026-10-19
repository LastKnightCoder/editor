# 数据驱动博客模板：spike

评估「模板即插件能力」的可行性：宿主不再把数据注入模板 HTML，只定义数据与模板的打包协议（数据全部输出为 `data/` 下的文件），模板壳运行时 fetch 数据动态渲染；插件（编辑器扩展）导出沿用 C23 协议。仅验证技术可行性，不修改正式发布器、博客模板或 SDK。

## 命题

1. 预编译一个不知道任何站点数据的模板壳（复用真实 `ArticlePage` 与正式 `plugin-runtime` 服务）；发布阶段不重编、不改一字节模板。
2. 发布器只做三件事：把内容序列化为 `data/` 下的 JSON 文件（含站点清单 `site.json`）、复制插件资产、按清单机械展开入口 HTML（模板作者提供的 `entry.html`，仅两个占位符）。
3. 浏览器 fetch 数据后渲染真实页面；同一份数据「内联注入」与「网络 fetch」两种来源渲染 DOM 完全一致（现有模板可平滑迁移）。
4. 插件链路不变：数据文件携带 `pluginRenderers`（`PublishedPluginRender` 形状），资源路径相对数据文件解析，复用正式加载协议（完整性摘要 + 共享模块求值）。

## 结论

技术可行，且现有架构离目标形态不远：

- 最难的「浏览器加载未知插件」C23 已解决，本 spike 的壳直接 import 正式 `plugin-runtime` / `plugin-registry` / `editorKit` 服务，零改动复用。
- 搜索索引本来就是网络 fetch（`search-index.json`），fetch 数据无新障碍。
- 唯一强耦合点是 `PublishSiteGenerator.injectData`（内联 initData）与 `TEMPLATE_ENTRY_MAP`（URL 展开），两者都集中在 `publish-site-generator.ts`，改造面收敛。
- 「数据来源切换不改变模板行为」已被证明：同一 ArticlePage、同一壳 JS，内联与 fetch 渲染 DOM 一致。现有模板迁移只需在 bootstrap 前加一段 fetch 逻辑（本壳即兼容两种来源）。

## 如何复验

在仓库根目录运行：

```sh
node apps/blog/spikes/data-driven-template/run.mjs
pnpm --filter blog exec tsc --noEmit -p spikes/data-driven-template/tsconfig.json
```

脚本输出独立的 `output/data-driven-template-spike/<本次ID>/` 目录：`template/`（冻结的模板包：壳 JS + entry.html）、`site/`（可经本地 HTTP 访问的站点）、`report.json` 与 `browser-report.json`。浏览器验证使用隐藏 Electron（nodeIntegration 关闭、sandbox 开启），只做 DOM 行为断言，不做视觉验收。

## 已验证的证据

| 检查 | 结果 |
| --- | --- |
| 壳先冻结构建，依赖图不含作者夹具 | 通过，metafile 无 `published-editor.tsx`，壳 JS 不含插件节点类型与站点标题 |
| 发布前后模板 JS SHA-256 一致 | 通过，发布阶段零模板改动 |
| 入口 HTML 不含内容数据 | 通过，文章标题与 `pluginRenderers` 只存在于 `data/*.json` |
| 模板自定义首页 | 通过，壳 fetch `data/site.json` 清单自行渲染文章列表（宿主未规定首页结构） |
| fetch 数据渲染真实 ArticlePage | 通过，HTTP 请求日志含 `data/articles/1.json` |
| 插件节点渲染与交互 | 通过，正式作者夹具 `example.portable-counter` 渲染 padding 12px，点击 7 → 8 |
| 内联 vs fetch 渲染一致性 | 通过，同一壳 JS 下两种数据来源 `[data-portable-counter]` outerHTML 完全相同 |
| 数据独立演进 | 通过，改 `data/articles/1.json` 标题后重新打开页面即生效，模板字节不变 |
| 数据缺失 | 通过，404 明确报错，不挂载残缺编辑器 |
| 作者目录删除后网站独立运行 | 通过（作者构建目录在验证前已删除） |

## 文件职责

- `contracts.ts`：数据包协议 v1 类型（site.json 清单 + 文章数据文件 = 现有 `InitData` 形状）。
- `entry.html`：模板作者资产；与宿主的打包契约只有 `__TAU_DATA__` / `__TAU_SHELL__` 两个占位符。
- `shell.tsx`：预编译数据驱动壳；fetch 数据（已内联 `_INIT_DATA_` 时跳过，兼容迁移）、复用正式插件加载服务、渲染真实 ArticlePage 与模板自定义首页。
- `publish.ts`：最小数据打包发布器；节点归属检查、插件资产复制、写 `data/` 文件、机械展开入口 HTML，另产出内联对照页。
- `verify.ts`：隐藏 Electron 行为验证。
- `run.mjs`：构建、发布、HTTP 服务与 Electron 编排，收集 report。
- `esbuild.tsconfig.json`：壳构建专用（`@blog/*` paths + automatic JSX；不能用 blog tsconfig，其 `@tau/editor` 目录映射会盖过包 exports 解析到错误的入口）。

## 协议草案（宿主 ↔ 模板契约收缩为三件事）

1. **数据包**：`data/site.json`（版本化清单：站点元信息 + pages 条目）与 `data/articles/<id>.json`（沿用现有 `IPublishInitData` 形状，`pluginRenderers` 资源路径相对数据文件自身，数据包自包含）。
2. **入口展开**：模板提供 `entry.html`（含 `__TAU_DATA__`/`__TAU_SHELL__` 占位符），宿主按 pages 清单机械替换并复制到声明位置；入口 HTML 的其余内容归模板作者所有。
3. **插件运行时**：沿用 `plugin-runtime.json` 协议 v1 与 `PublishedPluginRender`；模板的义务是实现数据 fetch + 插件加载，宿主可发布参考 runtime（本壳的加载段即可抽为共享包）。

模板作者由此获得：入口 HTML 全权、首页/列表/路由形态、样式主题、数据消费方式；宿主保留：数据序列化 schema、URL 展开规则、插件资产复制与完整性校验、搜索索引。

## 接口定义草案（模板即插件，2026-10-18 讨论稿）

分发已裁决：模板走插件中心，`template: true`；客户端不再随包分发任何插件（bundled-plugins 已退役，见 `1fbb3d3a7`），官方默认模板也是插件中心里由官方账号发布的普通模板插件，客户端零模板资产，首次发布时引导安装。

### 模板插件包（作者提供）

插件中心标准 manifest 之外新增模板声明：

```jsonc
{
  "template": {
    "entry": "template/entry.html" // 入口 HTML，相对包根，宿主唯一读取的文件
  }
}
```

包内其余文件（壳 JS、CSS、字体、图片）由作者自由组织，经 entry.html 相对引用；宿主原样复制到站点 `assets/`，不解析、不加工。无存量用户，不做协议版本兼容层（YAGNI，将来需要时再引入）。

### 客户端（宿主）职责

发布器（主进程 worker）：
1. 从已安装模板插件包读取 `manifest.template.entry` 指向的入口 HTML 与包资产清单；
2. 数据序列化为 `data/` 文件（协议唯一数据契约）；
3. 入口展开：按 pages 清单复制 entry.html、替换两个占位符（按目标位置重算相对路径）；
4. 模板资产原样复制，并附带宿主提供的参考运行时文件（`tau-publish-runtime.js`，全局暴露 `TauPublish`：数据 fetch 封装 + pluginRenderers 加载器，即现 `plugin-runtime.ts` 的抽离）；
5. C23 内容插件收集与复制（不变：节点归属 → 启用插件快照 → `plugin-assets/` + 完整性摘要写入数据文件）；
6. 逐文件上传（不变）。

发布 UI：模板选择器列出已安装 `template: true` 插件；无模板时引导去插件中心安装。

### 模板作者职责

1. 提供模板资产并发布到插件中心（走已有审核链路）；
2. 壳运行时引用宿主附带的 `tau-publish-runtime.js` 获取数据与加载内容插件——模板可以是纯静态资产（HTML + script 引用即可，无需构建工具与 npm 依赖）；数据类型定义随现有 `@tau/plugins` SDK 提供；
3. 接入参考运行时即自动支持全部 C23 内容插件；自研则按公开协议自行实现加载；
4. 站内链接按宿主固定 URL 结构与 `basePath` 生成。

### 插件中心需要的增量

- manifest 校验与展示支持 `template` 字段：模板分类展示，安装后进入「发布设置 → 模板选择」而非编辑器插件启用列表；
- 审核规则增加模板项（入口占位符完整性、入口 HTML 可解析）。

### 边界语义（与现状对齐）

- 模板插件升级不影响已发布站点，重新发布才生效；
- 模板读取位置 = 本地已安装插件包目录，由插件中心负责下载与版本，宿主不感知来源。

## 未证明或待裁决的部分

1. **URL 结构决定权**：已裁决（2026-10-18）——宿主固定 URL（`articles/<id>/` 等），模板不做路由声明。兼容现有上传 diff 与内容链接预览；正式化时进 DECISIONS.md。
2. **内容链接预览**：现依赖 fetch 目标页 HTML 并解析内联 `_INIT_DATA_`（`contentLinkPreview.ts`）；数据化后可直接 fetch `data/articles/<id>.json`，反而更简单，但需同步改造。
3. **runtime Tailwind**：现为每页内联 `<style data-runtime-tailwind>`；数据化后应作为数据文件的伴生 CSS（如 `data/styles/<id>.css`）由模板注入。
4. **SEO/无 JS**：现状内容本就靠 JS 挂载（HTML 里只有内联 JSON），fetch 化无实质退化；如需 SEO 可让宿主在入口 HTML 展开时注入静态摘要（模板声明占位符即可）。
5. **模板分发**：已裁决（2026-10-18）——模板走插件中心（manifest 声明 `template: true`），R2 模板 ZIP 与 `PublishTemplateManager` 退役；客户端零模板资产（bundled-plugins 已于 `1fbb3d3a7` 退役，官方默认模板同样在插件中心发布）。完整接口分工见下方「接口定义草案」。
6. **壳体积（实测）**：正式模板全站产物 29MB（2026-10-18 重建），此前本地 dist 33MB 中的 babel chunk（2.9MB）为 10-04 陈旧构建——custom-block 拆为独立插件（带走 @babel/standalone）后已不在依赖图中，重建实证消失。当前构成：tikzjax 6.6MB（TikZ/LaTeX wasm）、Shiki 全量语言/主题/oniguruma ≈9MB、mermaid 及其传递依赖（flowchart-elk-definition 1.4MB、mindmap-definition、cytoscape 等）≈5MB、abcjs、KaTeX、4.6MB CSS。这些重型渲染器若按内容能力拆为内置插件（diagram、math、code-highlight 等，进 `plugins/distribution.json`，两端同一包），模板基线壳可降至编辑器核心 + 基础节点（minify 后 MB 级），发布站点按 pluginRenderers 只携带页面实际用到的渲染器；custom-block 带走 babel 正是该模式的先例。spike 壳 32.1MB 为单文件 IIFE 未 minify 的验证形态，非架构增量。
7. 样本只覆盖 article 单类型；card/doc/quest/list 的数据文件化与搜索索引、favicon、外观设置等注入项未展开，属机械推广。

# 独立站点的数据接入

自 SDK 0.19.0 提供以下公开子入口；本文的数据结构对应 SDK 0.23.0（含 0.20.0 的站点数据调整）。这些入口用于独立站点，和 [PUBLISH.md](PUBLISH.md) 中向远端上传文件的发布提供方是两种用途。

普通 Tau 插件仍然使用 SDK 类型开发，构建时将宿主注入模块设为 external。SDK 根入口和 UI 包不携带编辑器、组件或页面的运行实现。

博客模板一般直接使用 `@tau/blog`：它包含数据读取、搜索、正文渲染和内容插件接入，见该包 README。只想读取数据、自己渲染正文的站点，可使用 `@tau/plugins/publish-data` 的纯数据类型和 `@tau/plugins/publish-client` 的数据客户端。客户端只有数据读取、摘要校验、取消和搜索，不包含 React、渲染器、路由或预览界面。

```ts
import { createClient } from "@tau/plugins/publish-client";

const client = createClient({ manifestUrl: "https://example.com/data/site.<摘要>.json" });
const manifest = await client.readManifest();
const item = manifest.items[0];
if (item) {
  const result = await client.readData({ key: item.key });
  console.log(result);
}
```

## 数据分布

- 清单 `site.<摘要>.json`：站点信息、全部内容的 key 与数据文件、搜索索引引用，以及只出现一次的站点级数据——`settings`（发布外观设置）、`collections`（项目列表）、`cardTagTree`（卡片标签树）、`projectTrees`（按项目 id 的文档目录）。`readData` 会把 `settings` 一并带回。
- 内容文件：`key`、`meta`、`content`，以及可选的 `links`（本文正文里已发布的站内链接目标）、`pluginRenderers`（内容插件产物）和 `contentStyles`（正文动态样式）。资源以所属数据文件的 URL 为上下文解析。
- 公开路由完全由模板决定，数据里只有 ContentRef（`{ key, type, id? }`），没有 URL。

正文的站内链接由 `@tau/blog` 按 `links` 渲染，模板只提供 `hrefFor`。自己渲染正文的站点按 `links` 的键（`${contentType}:${refId}`，与求索资料的 `citeKey` 同一口径）查目标，查不到即目标未发布。

## 样式

`contentStyles` 是宿主为正文里的 HTML 节点编译的 Tailwind 工具类，属于过渡产物：按原文加载，含 `:root` 主题变量和全局类名，正文挂载期间对整个页面生效。模板若自定义了同名 Tailwind 主题变量，正文挂载时可能被这些默认值覆盖。

## 插件产物

`@tau/plugins/publish-artifacts` 提供 C23 清单校验、定义求值与节点归属检查，仅处理协议，不提供 UI、模块映射或资源生命周期。共享模块由模板通过实际公开能力提供；`@tau/blog` 已内置这部分接入。

## 构建边界

| 入口                                           | 用途                          | 独立站点构建                     |
| ---------------------------------------------- | ----------------------------- | -------------------------------- |
| `@tau/plugins`、`@tau/ui`                      | Tau 注入的插件 API 与界面组件 | 只有类型；不能当作站点运行时打包 |
| `@tau/plugins/whiteboard`、`@tau/plugins/sync` | 白板与同步类型契约            | 使用 `import type`               |
| `@tau/plugins/publish-data`                    | 发布数据类型                  | 使用 `import type`               |
| `@tau/plugins/publish-client`                  | 数据读取、摘要校验与搜索      | 有 ESM 实现，可以打包进独立站点  |
| `@tau/plugins/publish-artifacts`               | 插件发布产物协议处理          | 有 ESM 实现，可以打包进独立站点  |

本模板的 `build.mjs` 面向运行于 Tau 内的代码插件，生成 CJS ZIP；独立博客站点应使用自己的站点构建，不直接复用计数器入口或本地安装脚本。根入口在普通 Node 或浏览器执行时会报错，这是宿主注入约定。模板分发包与代码插件也不能在同一 manifest 中同时声明。

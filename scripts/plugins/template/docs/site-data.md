# 站点数据

用户在 Tau 中发布博客时，Tau 会生成一组数据文件：站点信息、内容列表、每篇内容的正文和搜索索引。博客模板和独立站点读取这些数据来渲染页面。

这一篇面向两类开发者：

- **开发博客模板**：推荐直接使用 `@tau/blog`（npm 包 `@xiongtao.xt/tau-blog`）。它包含数据读取、搜索、正文渲染，以及内容插件（如[编辑器扩展](editor.md)中的自定义块）的接入，用法见该包的 README。
- **只想读取数据、自己渲染的站点**：使用 SDK 中的 `@tau/plugins/publish-client` 和 `@tau/plugins/publish-data`，见下文。

把文件送到远端的[发布提供方](providers/publish.md)是另一回事，与本篇无关。

## 读取数据

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

`publish-client` 只负责读取数据、校验文件摘要、取消和搜索，不包含 React、渲染器、路由或界面。类型定义在 `@tau/plugins/publish-data` 中。

## 数据结构

### 清单

清单文件 `site.<摘要>.json` 是入口，包含：

- `site`：站点信息，见下文。
- 全部内容的 `key` 及对应的数据文件、搜索索引的引用。
- 只出现一次的站点级数据：`settings`（发布外观设置）、`collections`（项目列表）、`cardTagTree`（卡片标签树）、`projectTrees`（按项目 ID 组织的文档目录）。

`readData` 返回内容时会一并带上 `settings`。

### 站点信息与模板字段

`site` 包含 Tau 提供的 `title`、`basePath`，以及可选的 `publicUrl`、`favicon`。

站点的其他配置（描述、副标题、布局开关等）由**博客模板**自己声明：在模板的 manifest 中写 `template.siteFields`，用户在「站点设置 · 博客模板」中填写，发布时以 `site.fields[key]` 交给模板。

- 字段类型有 `text`、`textarea`、`url`、`select`、`switch`，最多 32 个。
- `fields` 只包含已声明的字段。用户没填时取字段的 `default`；没有默认值时，文本类为空字符串，开关为 `false`，下拉为第一个选项。
- 首页数据只有时间线和统计，介绍区等由模板根据自己的字段渲染。

### 内容文件

每篇内容一个数据文件，包含 `key`、`meta`、`content`，以及可选的：

| 字段              | 说明                                   |
| ----------------- | -------------------------------------- |
| `links`           | 正文中指向其他已发布内容的站内链接目标 |
| `pluginRenderers` | 正文中用到的内容插件产物               |
| `contentStyles`   | 正文中 HTML 节点需要的 Tailwind 样式   |

正文中的图片等资源，以所属数据文件的地址为基准解析相对路径。

### 路由与站内链接

公开页面的路由完全由模板决定，数据里没有 URL，只有内容引用 `{ key, type, id? }`。

- 使用 `@tau/blog` 时，它按 `links` 渲染站内链接，模板只需要提供 `hrefFor`，把内容引用转成页面地址。
- 自己渲染正文时，按 `links` 的键（格式为 `${contentType}:${refId}`）查找目标；查不到说明目标没有发布，显示为普通文字即可。

### 正文样式

`contentStyles` 包含 `:root` 上的主题变量和全局类名，正文显示期间对整个页面生效。如果你的模板自定义了同名的 Tailwind 主题变量，正文显示时可能被这些值覆盖，命名时注意避开。

## 内容插件产物

`@tau/plugins/publish-artifacts` 校验 `pluginRenderers` 中的插件产物、加载插件定义并检查节点归属。它只处理数据协议，不提供界面和模块加载。`@tau/blog` 已经内置了这部分，使用它时不需要关心。

## 构建时的注意事项

| 入口                                           | 内容                     | 在独立站点中                                  |
| ---------------------------------------------- | ------------------------ | --------------------------------------------- |
| `@tau/plugins`、`@tau/ui`                      | 插件接口与界面组件       | 只有类型，运行实现由 Tau 提供，不能打包进站点 |
| `@tau/plugins/whiteboard`、`@tau/plugins/sync` | 白板与同步的类型         | 只用 `import type`                            |
| `@tau/plugins/publish-data`                    | 发布数据的类型           | 只用 `import type`                            |
| `@tau/plugins/publish-client`                  | 数据读取、摘要校验与搜索 | 有实现，可以打包进站点                        |
| `@tau/plugins/publish-artifacts`               | 插件产物协议             | 有实现，可以打包进站点                        |

`@tau/plugins` 的根入口在普通浏览器或 Node.js 中执行会直接报错，这是有意的：它的实现只存在于 Tau 中。

独立站点用自己的构建工具，不要复用插件模板的 `build.mjs` 和本地安装脚本，它们是为运行在 Tau 中的插件准备的。

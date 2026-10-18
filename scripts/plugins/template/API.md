# 插件 API

本文介绍编写命令、页面、侧边栏、设置、数据存储、网络请求和摘录所需的接口。插件接口从 `@tau/plugins` 导入，界面组件从 `@tau/ui` 导入。所述能力需要 Tau 0.59.0 或更高版本。

想在文档里添加自定义块，见 [EDITOR.md](EDITOR.md)；需要编译 Tailwind、Typst、Markdown 等内容，见 [SERVICES.md](SERVICES.md)。

AI 功能声明、用户模型分配、流式对话、取消与统一用量审计见 [AI.md](AI.md)（SDK 0.7.0 及以上）。

白板扩展契约见 [WHITEBOARD.md](WHITEBOARD.md)，需要 SDK 0.8.0 及以上。

同步存储插件见 [SYNC.md](SYNC.md)，需要 SDK 0.10.0 及以上。

资源上传提供方见 [UPLOAD.md](UPLOAD.md)，需要 SDK 0.12.0 和包含上传插件能力的客户端。图片和附件上传与数据库同步使用不同接口。

语音合成和音色复刻见 [TTS.md](TTS.md)，需要 SDK 0.13.0。账号配置按实例隔离；需要上传参考音频时使用 `context.upload.uploadRemote`，支持取消。

向应用 AI 提供本地工具或外部 MCP 服务器见 [MCP.md](MCP.md)，需要 SDK 0.11.0 和包含此能力的客户端。

阅读顺序：先了解[入口与生命周期](#入口与生命周期)，再按功能查阅[命令](#命令)、[存储](#私有存储)、[页面](#页面)、[设置](#设置)、[网络请求](#网络请求)、[摘录](#摘录)、[材料动作](#材料动作)和[资源清理](#资源清理)。完整可运行示例见 `src/index.tsx`。

## manifest

通常修改插件身份、版本和最低客户端版本：

| 字段            | 示例               | 含义                                                                   |
| --------------- | ------------------ | ---------------------------------------------------------------------- |
| `id`            | `yourname.counter` | 插件唯一标识；使用小写字母、数字、点或连字符；安装后不要随版本变化     |
| `name`          | `我的计数器`       | 插件管理中显示的名称                                                   |
| `version`       | `1.0.0`            | 插件版本，格式为 `主版本.次版本.修订号`，也可带 `-beta.1` 等预发布后缀 |
| `minAppVersion` | `0.59.0`           | 所需最低 Tau 客户端版本，不是 SDK 版本；低于要求时不加载               |
| `formatVersion` | `1`                | 包格式版本，保留模板值                                                 |
| `apiVersion`    | `1`                | API 协议版本，保留模板值                                               |
| `platform`      | `desktop`          | 运行平台，保留模板值                                                   |
| `format`        | `cjs`              | 产物格式，保留模板值                                                   |
| `main`          | `main.js`          | 构建入口，保留模板值                                                   |

`styles` 和 `integrity` 由构建生成，不必手写。修改源文件后重新运行 `pnpm build`，不要直接编辑 ZIP 内文件。

`minAppVersion` 使用完整版本号，可带预发布标识，例如 `0.59.0-rc.1`；不写 `>=`、`^` 等范围。正式版高于同号预发布版，构建元数据不影响顺序。模板默认要求 0.59.0，后续使用更高版本能力时由作者提高该值。

升级时保持 id 不变并增加 version，正式用户从插件中心更新，开发版客户端可从 ZIP 调试，重启生效。客户端保留上一版代码，支持“恢复上一版”；恢复仍需要重启，且不会恢复旧数据。需要变更存储结构时，优先采用向后兼容读写，避免旧代码恢复后无法读取数据。

## 入口与生命周期

`definePlugin(definition)` 接收 `id`、`name`、`version` 和生命周期工厂 `create`，返回插件定义，作为入口的默认导出。模板使用 `__PLUGIN_META__` 自动读取 manifest 中的前三项。纯编辑器插件可省略 `create`，通过 `editorExtensions` 声明扩展，详见 EDITOR.md。

下面是可替换 `src/index.tsx` 的最小完整插件：

```tsx
import { definePlugin } from "@tau/plugins";

declare const __PLUGIN_META__: { id: string; name: string; version: string };

export default definePlugin({
  ...__PLUGIN_META__,
  create: () => ({
    activate(context) {
      context.commands.register({
        id: "reset-count",
        title: "重置计数",
        run: async () => {
          await context.storage.set("count", 0);
          return null;
        },
      });
    },
  }),
});
```

| 方法                                       | 调用时机与返回值                                               |
| ------------------------------------------ | -------------------------------------------------------------- |
| `create(): PluginInstance`                 | 每次启用时调用，返回本次运行的实例                             |
| `activate(context): void \| Promise<void>` | 注册功能、读取必要配置；完成后插件才可用                       |
| `deactivate?(): void \| Promise<void>`     | 可选的额外清理；不要依赖它写入最终数据，数据应在用户操作时保存 |

停用、工作区切换或激活失败时，本次上下文会失效，命令、页面和设置会被清理。下一次启用会重新调用 `create` 和 `activate`。实例状态放在 `create` 内或组件内；需要跨启用保存的状态放入 storage。

`activate` 抛出错误会导致启用失败。不要在其中等待永不结束的任务；注册事件或任务后及时返回，并按下文处理取消与清理。

## context

`activate` 以及页面、设置组件都会收到 `PluginContext`。

| 属性          | 类型                                   | 用途                                      |
| ------------- | -------------------------------------- | ----------------------------------------- |
| `pluginId`    | `string`                               | 当前插件标识                              |
| `workspaceId` | `string`                               | 当前工作区标识；不要解析它的内部格式      |
| `signal`      | `AbortSignal`                          | 本次运行结束时中止，可用于停止异步工作    |
| `commands`    | `PluginContext["commands"]`            | 注册命令                                  |
| `storage`     | `PluginStorage`                        | 保存当前插件在当前工作区的数据            |
| `pages`       | `PluginPages`                          | 注册并打开页面                            |
| `settings`    | `PluginSettings`                       | 注册并打开设置区域                        |
| `sidebar`     | `PluginSidebar`                        | 创建侧边栏分组、注册页面入口              |
| `fetch`       | `typeof fetch`                         | 发起与插件生命周期关联的网络请求          |
| `services`    | `PluginServices`                       | 编译与转换服务，见 SERVICES.md            |
| `ai`          | `PluginAI`                             | 使用用户分配的模型，见 AI.md              |
| `mcp`         | `PluginMCP`                            | 注册 MCP，本地工具或外部服务器，见 MCP.md |
| `excerpts`    | `PluginExcerpts`                       | 把外部划线、标注写为 Tau 摘录             |
| `materials`   | `PluginMaterials`                      | 获取「转为卡片」等材料动作                |
| `register`    | `(resource: Disposable) => Disposable` | 托管需要清理的资源                        |

不要缓存上下文供下次启用使用。旧上下文失效后调用 storage、注册功能或打开页面会报错。

## 命令

```ts
context.commands.register({
  id: "reset-count",
  title: "重置计数",
  run: async () => {
    await context.storage.set("count", 0);
    return null;
  },
});
```

此处及下文的 `context` 示例放在 `activate(context)` 内，或用于已获得上下文的函数。

| 参数    | 类型                                                    | 说明                                                    |
| ------- | ------------------------------------------------------- | ------------------------------------------------------- |
| `id`    | `string`                                                | 插件内部唯一的局部 ID，例如 `open`；不要自行拼接插件 ID |
| `title` | `string`                                                | 非空的命令标题，用户可在 Ctrl+K 命令面板搜索            |
| `run`   | `(input: JsonValue) => JsonValue \| Promise<JsonValue>` | 执行命令；无返回数据时返回 `null`                       |

返回 `Disposable`，可提前 `dispose()` 撤销命令。未提前撤销的命令在停用时自动移除。同一插件不能重复注册相同命令 ID；命令注册时不会立即执行。

`run` 应处理预期业务错误，并为异步任务提供必要反馈；抛出的异常代表执行失败。`input` 如需使用，应先校验结构，不假定命令面板会提供自定义参数。

命令、页面、设置的局部 ID 和 storage key 均为 1–128 个字符，以字母或数字开头，后续允许字母、数字、点、横线和下划线。

## 私有存储

| 方法                      | 返回值                            | 说明                     |
| ------------------------- | --------------------------------- | ------------------------ |
| `storage.get(key)`        | `Promise<JsonValue \| undefined>` | 不存在时返回 `undefined` |
| `storage.set(key, value)` | `Promise<void>`                   | 保存或替换该 key 的值    |
| `storage.delete(key)`     | `Promise<void>`                   | 删除该 key               |

数据按插件与工作区隔离，停用和重启不会删除。同一个插件在不同工作区读到不同数据；升级时保持插件 ID 不变，并自行处理旧数据结构。

`JsonValue` 支持 `null`、布尔值、字符串、有限数字、这些值组成的数组和普通对象。不能存储 `undefined`、函数、Date、Map、循环引用、NaN 或 Infinity；日期应转换为字符串。

```ts
const saved = await context.storage.get("count");
const count = typeof saved === "number" ? saved : 0;
await context.storage.set("count", count + 1);
```

`get` 不提供泛型解码，读取后应校验类型。返回数据的本地修改不会自动保存，必须调用 `set`。连续的读写不是原子自增；按钮保存过程中应禁用重复提交，模板的计数器演示了这一点。

## 页面

`context.pages.register(definition)` 返回 `PluginPageHandle`：

| 定义字段    | 类型                                                   | 说明                                                 |
| ----------- | ------------------------------------------------------ | ---------------------------------------------------- |
| `id`        | `string`                                               | 插件内页面 ID                                        |
| `title`     | `string`                                               | 非空的页面标题                                       |
| `component` | `ComponentType<PluginPageProps>`                       | React 组件                                           |
| `match`     | `"single" \| "params"`，可选                           | 默认单实例；`params` 按参数区分页面实例              |
| `getId`     | `(params: Readonly<PluginPageParams>) => string`，可选 | `match: "params"` 时自定义实例身份；默认使用完整参数 |

句柄提供只读 `id`、`open(params?): Promise<void>` 和 `dispose()`。`open()` 负责导航，不要自行操作浏览器地址或历史。重复打开单实例页面会复用该页面身份；句柄注销或插件停用后不能再打开。

组件收到 `context` 和只读 `params`。参数仅支持字符串、有限数字、布尔值组成的对象，不接受数组、嵌套对象或 `null`。

下面的完整示例注册一个按条目 ID 区分的页面，以及打开页面的命令：

```tsx
import { definePlugin, type PluginPageProps } from "@tau/plugins";

declare const __PLUGIN_META__: { id: string; name: string; version: string };

function Detail({ params }: PluginPageProps) {
  return <h1>当前条目：{String(params.itemId ?? "未选择")}</h1>;
}

export default definePlugin({
  ...__PLUGIN_META__,
  create: () => ({
    activate(context) {
      const detail = context.pages.register({
        id: "detail",
        title: "条目详情",
        component: Detail,
        match: "params",
        getId: params => String(params.itemId),
      });
      context.commands.register({
        id: "open-detail",
        title: "打开示例条目",
        run: async () => {
          await detail.open({ itemId: "first" });
          return null;
        },
      });
    },
  }),
});
```

## 侧边栏

`context.sidebar` 为页面添加侧边栏入口。条目关联已有页面，点击自动打开并随当前页面高亮；停用后入口消失，恢复启用时重新注册。

### 注册到已有分组

```ts
import { SIDEBAR_GROUPS } from "@tau/plugins";

const page = context.pages.register({ id: "counter", title: "计数", component: Settings });
context.sidebar.registerItem({
  id: "counter",
  title: "计数",
  group: SIDEBAR_GROUPS.daily,
  page,
});
```

此处 `Settings` 是模板的计数组件，示例放在 `activate` 内，import 放在文件顶部。分组使用稳定标识，不使用显示名称：

| 常量                       | 分组                   |
| -------------------------- | ---------------------- |
| `SIDEBAR_GROUPS.daily`     | 日常                   |
| `SIDEBAR_GROUPS.knowledge` | 知识                   |
| `SIDEBAR_GROUPS.learning`  | 学习                   |
| `SIDEBAR_GROUPS.ai`        | AI                     |
| `SIDEBAR_GROUPS.sharing`   | 分享                   |
| `SIDEBAR_GROUPS.plugins`   | 插件；没有条目时不显示 |

### 自建分组

```ts
const group = context.sidebar.registerGroup({ id: "habits", title: "习惯" });
const page = context.pages.register({ id: "counter", title: "计数", component: Settings });
context.sidebar.registerItem({ id: "counter", title: "计数", group: group.id, page });
```

`registerGroup({ id, title })` 返回 `{ readonly id, dispose() }`。传入的 id 为插件内局部 ID，使用返回的 `group.id` 引用分组。空组不显示；不同插件可以使用相同局部 ID 或显示标题，各自独立。自建分组显示在内置分组之后。

`registerItem(definition)` 返回 `Disposable`：

| 字段     | 类型                      | 说明                                                        |
| -------- | ------------------------- | ----------------------------------------------------------- |
| `id`     | `string`                  | 插件内唯一条目 ID                                           |
| `title`  | `string`                  | 非空的入口名称                                              |
| `icon`   | `PluginSidebarIcon`，可选 | SVG 图标组件，省略时使用默认插件图标                        |
| `group`  | `string`，可选            | 公开分组常量或本插件分组句柄的 id；缺省或不存在时归入“插件” |
| `page`   | `PluginPageHandle`        | 本插件本次启用注册的有效页面句柄                            |
| `params` | `PluginPageParams`，可选  | 点击时传给页面的参数，缺省为空对象                          |

条目追加在所在分组末尾。参数页面按页面实例高亮，单实例页面按页面身份高亮；通过命令面板打开相同页面也会高亮侧边栏入口。条目与页面 ID 分别独立，可以为同一个参数页面注册多个入口。

### 自定义图标

`icon` 接收组件本身，例如 `icon: CounterIcon`，不是 `<CounterIcon />`、图片地址或图标名称字符串。模板的 `src/CounterIcon.tsx` 是可直接修改的 SVG 示例：

```tsx
import type { PluginSidebarIconProps } from "@tau/plugins";

export function WaterDropIcon({ size = 24, strokeWidth = 2, ...props }: PluginSidebarIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      {...props}
    >
      <path d="M12 3C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-12Z" />
    </svg>
  );
}
```

在插件入口导入图标后，将其传给 `context.sidebar.registerItem({ id: "water", title: "喝水打卡", page, icon: WaterDropIcon })`。

`PluginSidebarIconProps` 包含标准 SVG 属性及可选的 `size: number | string`。侧边栏传入 `size`、`strokeWidth`、`className` 和 `aria-hidden`，图标应透传这些属性；用 `currentColor` 跟随明暗主题及选中颜色，不写死宽高或颜色。展开和收起状态使用同一个图标，图标不承担按钮点击或业务状态管理。

也可以使用满足该属性约定的 React 图标库组件，依赖通过 pnpm 添加，无须额外配置打包。

提前调用条目的 `dispose()` 会移除入口；注销页面也会隐藏关联入口。提前注销分组后，剩余条目归入“插件”；当最后一个条目移除后，空分组不显示。注册重复 ID 会报错，不覆盖已有条目。插件只能管理自己注册的分组和条目，不能向其他插件的分组插入，也不能引用其他插件或上一次启用的页面句柄。

## 设置

`context.settings.register(definition)` 注册插件设置区域，返回 `PluginSettingsHandle`。

| 定义字段      | 类型                                 | 说明                             |
| ------------- | ------------------------------------ | -------------------------------- |
| `id`          | `string`                             | 插件内设置区域 ID                |
| `title`       | `string`                             | 非空的显示标题                   |
| `description` | `string`，可选                       | 设置区域说明                     |
| `component`   | `ComponentType<PluginSettingsProps>` | 接收 `{ context }` 的 React 组件 |

返回的句柄提供 `id`、`open(): Promise<void>` 和 `dispose()`。设置值不会自动保存，组件必须通过 storage 读写。

模板中的 `Settings` 组件可以直接复用；以下片段放在同一入口的 `activate` 内：

```ts
const preferences = context.settings.register({
  id: "preferences",
  title: "计数设置",
  description: "查看和调整已保存的计数",
  component: Settings,
});
context.commands.register({
  id: "open-preferences",
  title: "打开计数设置",
  run: async () => {
    await preferences.open();
    return null;
  },
});
```

页面与设置同时编辑同一数据时，需要自行刷新界面上的查询或状态。模板使用 React Query 处理读取、保存、加载中和失败状态；storage 本身不提供响应式订阅。

## 网络请求

`context.fetch(input, init?)` 的参数和返回值与标准 Fetch API 相同，返回 `Promise<Response>`。请求会随插件停用取消，也支持传入自己的 `AbortSignal`。

```ts
context.commands.register({
  id: "load-status",
  title: "获取服务状态",
  run: async () => {
    const response = await context.fetch("https://example.com/status.json");
    if (!response.ok) throw new Error(`请求失败：${response.status}`);
    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null || !("status" in data)) {
      throw new Error("响应缺少 status 字段");
    }
    if (typeof data.status !== "string") throw new Error("status 应为字符串");
    return { status: data.status };
  },
});
```

将示例地址替换成自己的服务。HTTP 4xx/5xx 不会自动抛出异常，需检查 `response.ok`。请求仍受运行环境的网络与跨域规则影响，不保证任意地址均可访问。不要把私密令牌写进源码；请求结果进入存储前也要校验数据。

## 摘录

如果你的插件从外部服务读取划线、标注或收藏（读书笔记、网页高亮、文献批注等），可以把它们写成 Tau 的摘录。写入后，用户能在全局搜索和 AI 对话中找到它们、在文档中引用，也能转为卡片或问题。摘录属于用户：插件停用或卸载后，已写入的摘录和引用都会保留。

### 注册提供方

写入前，先在 `activate` 中注册一次提供方：

```ts
const pages = { book: context.pages.register({ id: "book", title: "书籍", component: Book }) };

context.excerpts.register({
  label: "我的读书笔记",
  open: ({ sourceKey, externalId }) => pages.book.open({ bookId: sourceKey, noteId: externalId }),
});
```

| 字段    | 说明                                                                                       |
| ------- | ------------------------------------------------------------------------------------------ |
| `label` | 显示为摘录的来源名称，1–100 字；插件停用后仍用它显示来源                                   |
| `open`  | 可选。用户点击「打开原处」时调用，通常打开插件自己的页面并定位；省略时打开条目或来源的 url |

每次启用只能注册一次，未注册就写入会报错。

### 写入

摘录按**来源**（一本书、一个网页、一篇文献）分组写入，有两种方式：

```ts
const source = { key: "book-42", title: "设计心理学", url: "https://example.com/books/42" };

// 全量：以这批条目为准，不在其中的已有条目会被移除
await context.excerpts.replace(source, [
  {
    externalId: "n1",
    quote: "好的设计是让人一眼就知道怎么用。",
    location: "第 1 章",
    time: 1760000000000,
  },
  { externalId: "n2", quote: "示能决定了可能的操作。", note: "和交互设计课的观点一致" },
]);

// 增量：只新增、更新或移除指定条目
await context.excerpts.patch(source, {
  upsert: [{ externalId: "n3", quote: "反馈要及时。" }],
  remove: ["n1"],
});
```

两者都返回 `{ inserted, updated, deleted }`。外部服务能一次给出某个来源的全部条目时用 `replace`；只拿到变化时用 `patch`。`replace` 传入空数组表示整个来源已不存在。

| 来源字段 | 说明                                                  |
| -------- | ----------------------------------------------------- |
| `key`    | 来源在本插件内的稳定标识，必填，最长 512 字           |
| `title`  | 显示的来源标题，最长 500 字                           |
| `url`    | 可选，http(s) 地址；条目没有自己的 url 时用它打开原处 |

| 条目字段     | 说明                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------- |
| `externalId` | 条目在本插件内的唯一标识，必填，最长 512 字。**它不变，Tau 中对这条摘录的引用就一直有效** |
| `quote`      | 摘录原文，必填，最长 20000 字                                                             |
| `note`       | 用户写的想法或批注，可选                                                                  |
| `location`   | 给人看的位置，如「第 3 章 · 标题」「第 12 页」，最长 500 字                               |
| `url`        | 可选，条目级 http(s) 深链，优先于来源 url                                                 |
| `anchor`     | 可选，插件自己的定位数据（JSON 对象，序列化后不超过 8000 字）；Tau 只保存、不解读         |
| `color`      | 可选，划线颜色，最长 50 字                                                                |
| `time`       | 可选，在原服务中的创建时间（毫秒时间戳）                                                  |

使用约束：

- `externalId` 由你从外部数据中稳定地生成（例如原服务的笔记 ID）。改变生成规则会让旧摘录被移除、用户的引用失效。
- 被移除的摘录不会真正删除，原文仍保留、引用仍能显示；以后同一个 `externalId` 再次写入时会恢复。
- 单次写入最多 20000 条，同一批中 `externalId` 不能重复，同一次 `patch` 不能同时写入和移除同一条。任一条不合法时整批拒绝。
- 外部服务分页拉取时，确认拿到完整列表后再调用 `replace`；用不完整的结果覆盖会误移除条目。

### 读回

```ts
const sources = await context.excerpts.sources(); // [{ key, title, count }]
const entries = await context.excerpts.items("book-42");
```

`sources()` 列出本插件写入过的来源，`count` 为未移除的条目数。`items(sourceKey)` 返回该来源的全部条目，包括已移除的（`deleted: true`），可以用来离线展示或与外部数据比对。每个条目带有 `ref`，用于下文的材料动作。

## 材料动作

摘录等内容在 Tau 中统称「材料」。`context.materials.actions(ref)` 返回 Tau 当前可以对这条材料执行的操作，例如「转为卡片」「转为问题」，适合放在插件自己的列表或详情页里：

```tsx
import { Button } from "@tau/ui";
import type { PluginContext, PluginMaterialAction, PluginMaterialRef } from "@tau/plugins";
import { useEffect, useState } from "react";

function NoteActions({ context, target }: { context: PluginContext; target: PluginMaterialRef }) {
  const [actions, setActions] = useState<PluginMaterialAction[]>([]);
  useEffect(() => {
    void context.materials.actions(target).then(list => {
      if (!context.signal.aborted) setActions(list);
    });
  }, [context, target]);
  return actions.map(action => (
    <Button key={action.id} variant="ghost" onClick={() => void action.run()}>
      {action.label}
    </Button>
  ));
}
```

- `ref` 来自 `excerpts.items()` 返回的条目，把它原样传回即可，不要自己构造或解析其中的字段。
- 每个动作有 `id`、`label` 和 `run()`。直接用 `label` 作为按钮文字，不要按 `id` 写死列表：Tau 以后可能增加新的动作。
- 动作执行后由 Tau 自己给出成功或失败提示，插件不需要再弹提示。

## 资源清理

`Disposable` 的签名为 `{ dispose(): void | Promise<void> }`。

命令、页面、设置的注册结果会自动清理。自行创建的计时器、事件订阅或第三方对象应交给 `context.register(resource)`，返回的句柄也可用于提前清理。资源在本次运行结束时按注册顺序的逆序清理。

```ts
const onOnline = () => console.info("网络已连接");
window.addEventListener("online", onOnline);
const subscription = context.register({
  dispose: () => window.removeEventListener("online", onOnline),
});

// 不再需要时可以提前撤销；未撤销时会在停用时清理。
// await subscription.dispose();
```

清理函数应尽快完成，可安全处理重复调用。React 组件自己的订阅可以在 `useEffect` 的返回函数中清理。异步结果写回界面前检查 `context.signal.aborted`，不要让上一工作区的请求更新新的界面。

## 界面与样式

模板使用 React 组件，并提供 `@tau/ui` 的基础组件。常用组合：

```tsx
import { useState } from "react";
import { Button, Panel, Dialog, DialogBody } from "@tau/ui";

export function Help() {
  const [open, setOpen] = useState(false);
  return (
    <Panel>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        查看说明
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="使用说明">
        <DialogBody>数据会保存在当前工作区。</DialogBody>
      </Dialog>
    </Panel>
  );
}
```

| 组件         | 常用属性                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `Button`     | `onClick`、`disabled`、`loading`、`loadingText`；`variant` 可选 `primary`、`secondary`、`soft`、`ghost`、`danger`、`danger-soft` |
| `Panel`      | `children`、`className`，用于组织内容                                                                                            |
| `Dialog`     | `open`、`onOpenChange`、`title`；可用 `footer` 放操作按钮                                                                        |
| `DialogBody` | `children`，用于弹窗正文                                                                                                         |

自定义样式放入 CSS 并在入口导入。为选择器加插件专属前缀，避免影响其他界面；颜色使用 `var(--tau-accent)` 等主题变量。不要依赖客户端为插件源码生成 Tailwind 样式。

## 依赖与升级

添加依赖使用 `pnpm add <包名>`；升级 SDK 或 React 前先确认兼容性，并完整验证启用、停用和重启流程。保留 `pnpm-lock.yaml`，以便其他开发者复现依赖版本。

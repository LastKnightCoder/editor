# 插件 API

本文介绍编写命令、页面、侧边栏、设置、数据存储、网络请求和摘录所需的接口。插件接口从 `@tau/plugins` 导入，界面组件从 `@tau/ui` 导入。所述能力需要 Tau 0.59.0 或更高版本。

本文对应 SDK 0.25.0；最低客户端版本只负责版本门槛，使用新领域接口时仍需包含对应实现的客户端构建。SDK 升级步骤见 [DEVELOPMENT.md](DEVELOPMENT.md#升级-sdk-与同步旧模板)。独立后台与双入口构建见 [BACKEND.md](BACKEND.md)。

博客发布提供方见 [PUBLISH.md](PUBLISH.md)，需要 SDK 0.21.0 和包含该能力的客户端；独立博客站点读取数据见 [PUBLISH-DATA.md](PUBLISH-DATA.md)。

想在文档里添加自定义块，见 [EDITOR.md](EDITOR.md)；需要编译 Tailwind、Markdown 等内容，见 [SERVICES.md](SERVICES.md)。

AI 功能声明、用户模型分配、流式对话、取消与统一用量审计见 [AI.md](AI.md)（SDK 0.7.0 及以上）。

白板扩展契约见 [WHITEBOARD.md](WHITEBOARD.md)，需要 SDK 0.8.0 及以上。

同步存储插件见 [SYNC.md](SYNC.md)，需要 SDK 0.10.0 及以上。

资源上传提供方见 [UPLOAD.md](UPLOAD.md)，需要 SDK 0.12.0 和包含上传插件能力的客户端。图片和附件上传与数据库同步使用不同接口。

语音合成和音色复刻见 [TTS.md](TTS.md)，需要 SDK 0.13.0。账号配置按实例隔离；需要上传参考音频时使用 `context.upload.uploadRemote`，支持取消。

图片生成与编辑见 [IMAGES.md](IMAGES.md)，需要 SDK 0.18.0。通过 `context.images` 注册提供方，配置组件以 `target: "images"` 挂载到图片生成设置。

视频提供方（视频网站、自建服务器等）见 [VIDEO.md](VIDEO.md)，需要 SDK 0.22.0。通过 `context.video` 注册，插件返回播放源描述，下载、缓存与播放由客户端完成；配置组件以 `target: "video"` 挂载到账号与连接设置；每个插件在各添加入口中各占一项。

向应用 AI 提供本地工具或外部 MCP 服务器见 [MCP.md](MCP.md)，需要 SDK 0.11.0 和包含此能力的客户端。

聊天工具自定义渲染使用 `await context.chat.registerToolRenderer`，数据与生命周期见 [MCP.md](MCP.md#聊天工具自定义渲染)。类型契约自 SDK 0.15.0 提供，需要包含实现的客户端构建。

阅读顺序：先了解[入口与生命周期](#入口与生命周期)，再按功能查阅[命令](#命令)、[存储](#私有存储)、[页面](#页面)、[设置](#设置)、[网络请求](#网络请求)、[摘录](#摘录)、[材料动作](#材料动作)、[业务数据](#业务数据)、[关联已有内容](#关联已有内容)和[资源清理](#资源清理)。完整可运行示例见 `src/index.tsx`。

## manifest

通常修改插件身份、版本和最低客户端版本：

| 字段            | 示例               | 含义                                                                   |
| --------------- | ------------------ | ---------------------------------------------------------------------- |
| `id`            | `yourname.counter` | 插件唯一标识；使用小写字母、数字、点或连字符；安装后不要随版本变化     |
| `name`          | `我的计数器`       | 插件管理中显示的名称                                                   |
| `version`       | `1.0.0`            | 插件版本，格式为 `主版本.次版本.修订号`，也可带 `-beta.1` 等预发布后缀 |
| `minAppVersion` | `0.59.0`           | 所需最低 Tau 客户端版本，不是 SDK 版本；低于要求时不加载               |
| `formatVersion` | `1` 或 `2`         | 普通渲染插件为 1；声明独立后台时为 2，见 BACKEND.md                    |
| `apiVersion`    | `1`                | API 协议版本，保留模板值                                               |
| `platform`      | `desktop`          | 运行平台，保留模板值                                                   |
| `format`        | `cjs`              | 产物格式，保留模板值                                                   |
| `main`          | `main.js`          | 构建入口，保留模板值                                                   |
| `categories`    | `["page"]`         | 插件中心分类，可多选                                                   |
| `keywords`      | `["计数", "打卡"]` | 搜索关键词，最多 5 个，每个不超过 20 字                                |
| `permissions`   | `["cards:read"]`   | 可申请的业务数据权限，见[业务数据](#业务数据)；不声明的接口无法调用    |

分类值为 `page`、`editor`、`whiteboard`、`sync`、`upload`、`voice`、`ai`、`video`、`blog-publish`、`blog-template`。仅提供命令或普通设置时可以省略；分类不授予权限。声明静态编辑器、白板扩展时分别设置 `editor: true`、`whiteboard: true`，详见对应文档。

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

| 属性          | 类型                                   | 用途                                             |
| ------------- | -------------------------------------- | ------------------------------------------------ |
| `pluginId`    | `string`                               | 当前插件标识                                     |
| `workspaceId` | `string`                               | 当前工作区标识；不要解析它的内部格式             |
| `signal`      | `AbortSignal`                          | 本次运行结束时中止，可用于停止异步工作           |
| `commands`    | `PluginContext["commands"]`            | 注册命令                                         |
| `storage`     | `PluginStorage`                        | 保存当前插件在当前工作区的数据                   |
| `permissions` | `PluginPermissions`                    | 查询与申请业务数据权限                           |
| `data`        | `PluginData`                           | 读取与修改卡片、文章、项目文档、待办和日程       |
| `content`     | `PluginContent`                        | 读取与修改正文                                   |
| `events`      | `PluginEvents`                         | 订阅业务数据变化                                 |
| `app`         | `PluginApp`                            | 选择、打开已有内容，执行导出、演示和共享         |
| `entities`    | `PluginOwnEntities`                    | 管理插件自有内容、类型和反链                     |
| `backend`     | `PluginBackendClient`                  | 调用与订阅本机后台，见 BACKEND.md                |
| `pages`       | `PluginPages`                          | 注册并打开页面                                   |
| `settings`    | `PluginSettings`                       | 注册并打开设置区域                               |
| `editor`      | `PluginEditor`                         | 开发台编辑器贡献；正文使用静态扩展，见 EDITOR.md |
| `sync`        | `PluginSync`                           | 注册同步存储提供方，见 SYNC.md                   |
| `upload`      | `PluginUpload`                         | 资源上传与上传提供方，见 UPLOAD.md               |
| `tts`         | `PluginTTS`                            | 语音合成与音色复刻提供方，见 TTS.md              |
| `images`      | `PluginImages`                         | 图片生成与编辑提供方，见 IMAGES.md               |
| `video`       | `PluginVideo`                          | 视频来源与播放源提供方，见 VIDEO.md              |
| `publish`     | `PluginPublish`                        | 博客发布提供方，见 PUBLISH.md                    |
| `sidebar`     | `PluginSidebar`                        | 创建侧边栏分组、注册页面入口                     |
| `fetch`       | `typeof fetch`                         | 发起与插件生命周期关联的网络请求                 |
| `services`    | `PluginServices`                       | 编译与转换服务，见 SERVICES.md                   |
| `ai`          | `PluginAI`                             | 使用用户分配的模型，见 AI.md                     |
| `mcp`         | `PluginMCP`                            | 注册 MCP，本地工具或外部服务器，见 MCP.md        |
| `chat`        | `PluginChat`                           | 注册 MCP 工具结果渲染器，见 MCP.md               |
| `excerpts`    | `PluginExcerpts`                       | 把外部划线、标注写为 Tau 摘录                    |
| `materials`   | `PluginMaterials`                      | 获取「转为卡片」等材料动作                       |
| `register`    | `(resource: Disposable) => Disposable` | 托管需要清理的资源                               |

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

数据按插件与工作区隔离，保存在当前笔记库里并随云同步，换一台设备也能读到；停用和重启不会删除。同一个插件在不同工作区读到不同数据；升级时保持插件 ID 不变，并自行处理旧数据结构。单个值不超过 1 MB，较大的内容应放进插件内容的正文。

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

提供方配置分区声明 `target`，使用宿主注入配置中的 `save` 保存当前提供方或账号，不使用上述普通设置的 storage 流程。配置属性是可选的，组件使用前先检查。配置界面在对应业务设置内挂载，`open()` 跳转到该入口。

| `target`  | 配置属性                                    | 保存方法               |
| --------- | ------------------------------------------- | ---------------------- |
| `sync`    | `syncConfig`                                | `save(value)`          |
| `upload`  | `uploadConfig`                              | `save(value)`          |
| `tts`     | `ttsConfig`（含 `instanceId`、`models`）    | `save(value, models)`  |
| `images`  | `imageConfig`（含 `instanceId`、`modelId`） | `save(value, modelId)` |
| `video`   | `videoConfig`                               | `save(value)`          |
| `publish` | `publishConfig`                             | `save(value)`          |

各配置都提供 `value: JsonValue`，读取后校验结构；保存失败保留草稿，成功后再提示。TTS 和图片按账号实例隔离，其他分区按对应提供方保存。完整示例与业务约束见各领域文档。

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

将示例地址替换成自己的服务。HTTP 4xx/5xx 不会自动抛出异常，需检查 `response.ok`。请求在宿主执行，不自动继承浏览器页面的 Cookie 或 CORS 行为，认证由插件通过标准请求头提供，不保证任意地址均可访问。不要把私密令牌写进源码；请求结果进入存储前也要校验数据。

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

## 业务数据

插件可以读取和修改用户的卡片、文章、项目文档、待办和日程，类型契约自 SDK 0.25.0 提供，需要包含此能力的客户端。

### 声明与授权

先在 manifest 中声明需要的权限，这是插件能申请的上限：

```json
{ "permissions": ["cards:read", "todos:read"] }
```

| 权限                                                   | 可调用的接口                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| `cards:read` / `articles:read` / `documents:read`      | 对应实体的 `get`、`query`，以及其正文的 `content.read`          |
| `cards:write` / `articles:write` / `documents:write`   | `create`（项目文档没有）、`update`，以及其正文的 `content.edit` |
| `cards:delete` / `articles:delete`                     | `delete`                                                        |
| `todos:read` / `todos:write` / `todos:delete`          | `context.data.todos` 的查询、新建与修改、删除                   |
| `calendar:read` / `calendar:write` / `calendar:delete` | `context.data.calendar` 的查询、新建与修改、删除                |

插件第一次调用某个接口时，Tau 会弹窗询问用户：「仅这次」在插件停用或应用重启前有效，「始终允许」保存到用户撤销为止，「拒绝」在本次运行内不再询问，连续拒绝 3 次后转为已阻止。应用不在前台时不弹窗，请求会记在插件详情页的「权限」中等待用户处理。用户可以随时在那里撤销。

未声明、被拒绝或无法询问时，接口抛出 `PluginPermissionError`，`reason` 依次为 `undeclared`、`denied` / `blocked`、`unavailable`。建议在页面中处理这个错误，显示说明和重试按钮，而不是在启动时连续申请：

```tsx
import { PluginPermissionError } from "@tau/plugins";

try {
  setCards((await context.data.cards.query({ limit: 20 })).items);
} catch (error) {
  if (error instanceof PluginPermissionError) setNeedsPermission(true);
  else throw error;
}
```

也可以在用户点击按钮时一次申请多项：`await context.permissions.request(["cards:read", "todos:read"])`，全部获准时返回 `true`。`context.permissions.query(permission)` 返回 `granted`、`prompt` 或 `denied`，不会弹窗。

插件与 Tau 运行在同一环境中，权限约束的是这些接口，不是安全隔离。获准读取的内容可以通过 `context.fetch` 发送出去，用户界面会如实提示这一点；请只读取功能需要的数据。

### 读取实体

```ts
const weekAgo = Date.now() - 7 * 86_400_000;
const page = await context.data.cards.query({ updatedAfter: weekAgo, limit: 50 });
for (const card of page.items) console.log(card.title, card.tags);
if (page.cursor) await context.data.cards.query({ updatedAfter: weekAgo, cursor: page.cursor });

const article = await context.data.articles.get(id); // 不存在时为 null
```

`cards`、`articles`、`documents` 都提供 `get(id)` 与 `query(query)`。查询参数：

| 字段                             | 说明                                                        |
| -------------------------------- | ----------------------------------------------------------- |
| `createdAfter` / `createdBefore` | 创建时间范围，毫秒时间戳，含起点不含终点                    |
| `updatedAfter` / `updatedBefore` | 修改时间范围，正文修改也计入                                |
| `tag`                            | 按标签筛选；层级标签按前缀命中，「读书」也命中「读书/小说」 |
| `sort`                           | `updated`（默认）或 `created`，均为倒序                     |
| `limit`                          | 1–200，默认 50                                              |
| `cursor`                         | 上一页返回的 `cursor`，原样传回读取下一页                   |

返回项都有 `id`、`title`、`tags`、`wordCount`、`createdAt`、`updatedAt`。卡片没有标题字段，`title` 是 AI 标题或正文开头。卡片和文章另有 `pinned` 与 `contentRef`；项目文档有 `kind`（`document` 等）、`projectIds`，非富文本类型的 `contentRef` 为 `null`。`id` 与 `contentRef` 是不透明字符串，只用于传回 Tau，不要解析或自行拼接。

待办与日程：

```ts
const todos = await context.data.todos.query({ completed: false, limit: 20 });
const events = await context.data.calendar.query({ start: "2026-10-19", end: "2026-10-26" });
```

`todos.query` 可按 `source`（`all` / `todo` / `document`）、`completed`、`keyword` 与截止日期 `start` / `end`（`YYYY-MM-DD`）筛选，每页最多 100 条。来自文档勾选项的待办带 `source`，指明所在文档。`calendar.query` 的 `start`、`end` 必填，可以是日期或带时区的 ISO 时间。

### 读取正文

```ts
const snapshot = await context.content.read(card.contentRef); // 默认 Markdown
console.log(snapshot?.markdown, snapshot?.wordCount);
```

需要该正文所属实体的读取权限（例如卡片正文需要 `cards:read`）。`format: "nodes"` 返回编辑器节点 JSON，其结构会随编辑器演进，优先使用 Markdown。读取的是已保存的内容，正在编辑的修改最多晚约 1 秒。

### 修改与删除

```ts
import { PluginConflictError } from "@tau/plugins";

const card = await context.data.cards.create({ markdown: "# 读书笔记\n\n第一段", tags: ["读书"] });
try {
  await context.data.cards.update(card.id, { pinned: true }, { expectedRevision: card.revision });
} catch (error) {
  if (error instanceof Error && error.name === "PluginConflictError") {
    // 用户刚在别处改过这张卡片：重新读取，再决定是否重试
  } else throw error;
}
await context.data.cards.delete(card.id, { expectedRevision: card.revision });
```

| 接口                            | 可修改的字段                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `cards.create` / `cards.update` | 新建时 `markdown`、`tags`、`pinned`；修改时 `tags`、`pinned`                                         |
| `articles.create` / `update`    | 新建时 `title`（必填）、`markdown`、`tags`；修改时 `title`、`tags`、`pinned`                         |
| `documents.update`              | `title`、`tags`；项目文档的新建、移动与删除涉及文档树，暂不开放                                      |
| `todos.create` / `update`       | `title`、`dueAt`（`YYYY-MM-DD`、带时区的 ISO 时间或 `null`）；`setCompleted(id, completed)` 标记完成 |
| `calendar.create` / `update`    | `title`、`start`、`end`、`allDay`、`calendarId`；全天日程的 `end` 不含当天                           |

- **revision**：读到的每一项都带 `revision`，修改和删除时作为 `expectedRevision` 传回。期间用户或其他插件改过它，就会抛出 `PluginConflictError`，不会覆盖别人的修改。修改正文不会改变实体的 `revision`。
- **删除可以恢复**：插件删除的卡片、文章、待办和日程，用户 7 天内可以在插件详情页的「权限 → 最近删除」中恢复。有子待办的待办不能删除。
- **各处同步**：写入后，打开中的页面、其他窗口、搜索与云同步都会跟着更新，不需要插件通知。

### 修改正文

```ts
const snapshot = await context.content.read(card.contentRef);
await context.content.edit(
  card.contentRef,
  { op: "append", markdown: "\n今天读完了第三章。" },
  { expectedRevision: snapshot!.revision }
);
```

| `op`          | 作用                                                           |
| ------------- | -------------------------------------------------------------- |
| `append`      | 在末尾追加 Markdown，原有内容保持不变                          |
| `prepend`     | 在开头插入 Markdown，原有内容保持不变                          |
| `replaceText` | 把 `find` 换成 `markdown`；`find` 必须在当前正文中恰好出现一次 |
| `replaceAll`  | 用 `markdown` 替换整篇                                         |

需要所属实体的写入权限（卡片正文需要 `cards:write`）。正文正在编辑器中打开时，修改会立即出现在编辑器里，协作者也能看到。插件的修改不进入编辑器的撤销记录，用户无法用撤销键退回，请在修改前确认用户意图。`replaceText` 与 `replaceAll` 会把整篇按 Markdown 重建，Markdown 无法表达的格式可能被简化；只是添加内容时请用 `append` 或 `prepend`。返回新的 `revision`，连续修改时传给下一次调用。

### 变更事件

```ts
context.events.on(["card.created", "card.updated", "card.deleted"], event => {
  queryClient.invalidateQueries({ queryKey: ["cards"] });
});
```

| 事件                                             | 说明                                                    |
| ------------------------------------------------ | ------------------------------------------------------- |
| `card.created` / `card.updated` / `card.deleted` | `id` 与 `context.data.cards` 一致；正文修改也算 updated |
| `article.*`、`document.*`                        | 同上，文章移入回收站算 deleted                          |
| `todos.changed`、`calendar.changed`              | 待办、日程有变化，没有 `id`，需要时重新查询             |
| `workspace.reset`                                | 同步下载替换了整个库，应全量刷新                        |

事件只说明哪一项变了，不携带数据，需要时用 `context.data` 重新读取。`origin` 标出变化来源：`{ kind: "plugin", pluginId }` 表示由插件写入（可用来忽略自己写入引起的事件），其他情况为 `{ kind: "app" }`；待办与日程的事件恒为 `app`。同一项在半秒内的多次变化合并为一次，持续编辑时最多每 2 秒一次。订阅需要在 manifest 中声明对应的读取权限；用户尚未允许时事件不会送达，也不会因此弹窗。`on` 返回的句柄在插件停用时自动注销。

## 关联已有内容

自建页面（画布、看板等）需要引用用户已有的卡片、日记、待办时，用 Tau 的搜索选择窗口让用户挑选，点击时再用 Tau 打开它们。类型契约自 SDK 0.25.0 提供。

```tsx
import type { PluginEntityRef } from "@tau/plugins";

async function linkExisting() {
  const picked = await context.app.pick({ kinds: ["card", "diary", "todo"], multiple: true });
  // picked: [{ ref: { kind: "card", id: "12" }, title: "读书笔记" }, ...]；用户取消时为空数组
  await context.storage.set("links", picked);
}

function LinkChip({ link }: { link: { ref: PluginEntityRef; title: string } }) {
  return <button onClick={() => void context.app.open(link.ref)}>{link.title}</button>;
}
```

| `kind`       | 内容             | 打开后                                             |
| ------------ | ---------------- | -------------------------------------------------- |
| `card`       | 卡片             | 卡片详情                                           |
| `article`    | 文章             | 文章详情                                           |
| `document`   | 项目文档         | 所在项目并选中该文档                               |
| `diary`      | 日记里的一条记录 | 当天日记并定位到这一条                             |
| `whiteboard` | 白板             | 白板                                               |
| `todo`       | 待办             | 待办页并打开详情；文档里的勾选项打开所在文档并定位 |
| `event`      | 日程             | 日程页并打开详情                                   |

- `pick` 与 `open` 不需要权限：用户亲手挑选，就是同意插件引用这些内容。插件拿到的只有引用和选择时的标题；要读取正文或刷新标题，仍需对应的读取权限（`context.data.*.get`）。
- 两者都只能在用户操作（点击、按键）之后调用，在定时器或事件回调里调用会抛错。
- `ref` 是可序列化的普通对象，可以存进插件自己的数据；`id` 与 `context.data` 中同类实体一致。目标被删除后，`open` 抛出「内容不存在」，可以据此提示用户移除这条关联。

## 正文组件

插件页面里可以直接嵌入 Tau 的正文编辑器，效果与卡片详情相同：实时协作、内置与已安装的编辑器扩展、文档待办都会生效，修改自动保存。组件自 SDK 0.25.0 提供，只能在插件页面内使用。

```tsx
import { ContentEditor, ContentPreview } from "@tau/plugins";

function CardPanel({ card }: { card: PluginCard }) {
  return <ContentEditor contentRef={card.contentRef} placeholder="写点什么" />;
}

function CardRow({ card }: { card: PluginCard }) {
  return <ContentPreview contentRef={card.contentRef} maxBlocks={3} />;
}
```

| 组件             | 属性                                             | 所需权限                                   |
| ---------------- | ------------------------------------------------ | ------------------------------------------ |
| `ContentEditor`  | `contentRef`、`readonly?`、`placeholder?`、`at?` | 可编辑：所属实体的写入权限；只读：读取权限 |
| `ContentPreview` | `contentRef`、`maxBlocks?`（默认 3）             | 所属实体的读取权限                         |

- `contentRef` 来自 `context.data` 返回的 `contentRef`，目前支持卡片、文章与项目文档的正文。
- 组件挂载时只检查授权，不弹窗；尚未决定时显示「允许访问」，用户点击后才询问。已拒绝时提示用户到插件详情页修改。
- 用户在组件里的编辑与在卡片详情里的编辑相同，产生的事件 `origin` 为 `app`，可以在编辑器的撤销中撤回；这与 `context.content.edit` 不同。
- `ContentPreview` 显示保存后的内容，编辑中的改动约 1 秒后反映出来。
- 组件在插件页面内同步渲染，必须与 Tau 在同一运行环境中执行。

## 宿主动作

导出、演示、协作共享这类自带界面的功能，用 `context.app.run` 交给 Tau 完成，界面与卡片详情中的相同。动作自 SDK 0.25.0 提供。

```tsx
<button
  onClick={() => void context.app.run("content.export", { ref: card.contentRef, format: "pdf" })}
>
  导出 PDF
</button>
```

| 动作              | 参数                                                   | 效果                                               |
| ----------------- | ------------------------------------------------------ | -------------------------------------------------- |
| `content.export`  | `ref`、`format`：`markdown` / `image` / `pdf` / `epub` | Markdown 直接保存文件，其余打开对应的导出窗口      |
| `content.present` | `ref`                                                  | 全屏演示                                           |
| `content.share`   | `ref`                                                  | 打开「内容协作」窗口，由用户确认发起共享或管理成员 |

- `ref` 是 `context.data` 返回的 `contentRef`，目前支持卡片、文章与项目文档的正文。
- 不需要数据权限：界面和确认都由 Tau 提供，插件拿不到正文。与 `open` 一样，只能在用户操作之后调用；内容已删除时抛出「内容不存在」。
- 对应界面打开后即返回，不等待用户完成导出或结束演示。同一时间只显示一个，插件停用时自动关闭。

## 插件内容

插件可以创建属于自己的内容（如每周一篇周记、看板上的卡片），每项带一份正文。正文和卡片正文一样实时保存、随云同步，用 `ContentEditor` 编辑，或用 `context.content` 读写。读写自己的内容不需要业务数据权限。接口自 SDK 0.25.0 提供。

```tsx
import { NotebookPen } from "lucide-react";

context.entities.registerKind({
  kind: "note",
  label: "周记",
  icon: NotebookPen,
  open: { page: "review", params: note => ({ week: note.key }) },
});

async function noteOf(week: string) {
  return (
    (await context.entities.find("note", week)) ??
    (await context.entities.create({ kind: "note", key: week, title: `${week} 周记` }))
  );
}

function NotePanel({ note }: { note: PluginOwnEntity }) {
  return <ContentEditor contentRef={note.contentRef} placeholder="这一周想记下什么" />;
}
```

| 方法                                                  | 说明                                                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `registerKind(definition)`                            | 声明内容类型：`kind`、显示名 `label`、图标 `icon`、在 Tau 中打开时进入的页面 `open`      |
| `create({ kind, key, title?, meta? })`                | 新建一项，正文为空；同一类型下 `key` 已存在时抛出 `PluginConflictError`                  |
| `get(id)` / `find(kind, key)`                         | 读取一项，不存在时为 `null`                                                              |
| `query({ kind?, cursor?, limit? })`                   | 按创建时间倒序分页，默认 50 条、最多 200 条                                              |
| `backlinks(id)`                                       | 哪些卡片、文章、项目文档引用了这项内容：`{ items: [{ ref, title, snippets }], omitted }` |
| `update(id, { title?, meta? }, { expectedRevision })` | 修改标题或 `meta`（最大 64 KB 的 JSON 对象）                                             |
| `delete(id, { expectedRevision })`                    | 删除一项及其正文，用户可在 7 天内恢复                                                    |

- 插件内容在 Tau 里以 `label` 与 `icon` 显示：全局搜索、@ 面板、正文中的引用卡片、脉络与漫步都用它们，而不是笼统的「插件内容」。`icon` 与侧边栏图标同一写法（线性单色 SVG 组件，用 `currentColor`），渲染结果必须是单个 `<svg>`、不超过 16 KB；Tau 在声明时渲染一次并随笔记库保存，所以插件停用、卸载后的 7 天内或在其他设备上，这些地方仍显示你声明的类型名与图标。图标只按形状显示，颜色跟随主题，多色、渐变和位图不会保留。不传 `icon` 时显示通用的插件图标。
- 插件内容会出现在 Tau 的全局搜索与 AI 检索中（标题与正文）。用户点击时 Tau 按 `open` 打开插件页面，`params` 由实体字段算出；命中正文中间某处时页面参数另带 `at`，原样交给 `<ContentEditor at={params.at}>` 即可滚动到命中处。插件停用时，Tau 用自带的只读页显示这项内容。
- `registerKind` 声明 `mentionable: true` 后，用户可以在正文里用 @ 引用这类内容（默认不可）；引用处点击即打开。`backlinks` 只返回插件已获准读取的类型（`cards:read` 等），不会询问权限，其余来源只计入 `omitted`；`ref` 可直接交给 `context.app.open`。
- `key` 由插件决定，用来找回同一项内容，例如周记用周次。`meta` 保存少量结构化信息，正文放在正文里。
- 只有先声明的类型才能新建；`registerKind` 在 `activate` 中调用，停用时自动撤销。
- `delete` 需要传入读取时的 `revision`，内容已被修改时抛出 `PluginConflictError`。删除后，用户可在插件详情页的「最近删除」中 7 天内恢复，恢复后 ID、`key` 和正文都不变，别处指向它的引用重新生效；若插件在此期间又用同一个 `key` 新建了内容，则无法恢复。删除不触发确认窗口，需要确认时由插件自己询问用户。
- 卸载插件后，它创建的内容保留 7 天，期间重新安装即可找回，超过 7 天后删除。

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

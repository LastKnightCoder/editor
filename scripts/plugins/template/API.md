# 插件 API

本文介绍编写命令、页面、设置和数据存储所需的接口。示例适用于本模板锁定的 SDK 版本。插件接口从 `@tau/plugins` 导入，界面组件从 `@tau/ui` 导入。

阅读顺序：先了解[入口与生命周期](#入口与生命周期)，再按功能查阅[命令](#命令)、[存储](#私有存储)、[页面](#页面)、[设置](#设置)、[网络请求](#网络请求)和[资源清理](#资源清理)。完整可运行示例见 `src/index.tsx`。

## manifest

通常只需要修改前三个字段：

| 字段            | 示例               | 含义                                                                   |
| --------------- | ------------------ | ---------------------------------------------------------------------- |
| `id`            | `yourname.counter` | 插件唯一标识；使用小写字母、数字、点或连字符；安装后不要随版本变化     |
| `name`          | `我的计数器`       | 插件管理中显示的名称                                                   |
| `version`       | `1.0.0`            | 插件版本，格式为 `主版本.次版本.修订号`，也可带 `-beta.1` 等预发布后缀 |
| `formatVersion` | `1`                | 包格式版本，保留模板值                                                 |
| `apiVersion`    | `1`                | API 协议版本，保留模板值                                               |
| `platform`      | `desktop`          | 运行平台，保留模板值                                                   |
| `format`        | `cjs`              | 产物格式，保留模板值                                                   |
| `main`          | `main.js`          | 构建入口，保留模板值                                                   |

`styles` 和 `integrity` 由构建生成，不必手写。修改源文件后重新运行 `pnpm build`，不要直接编辑 ZIP 内文件。

## 入口与生命周期

`definePlugin(definition)` 接收 `id`、`name`、`version` 和 `create`，返回插件定义，作为入口的默认导出。模板使用 `__PLUGIN_META__` 自动读取 manifest 中的前三项。

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

| 属性          | 类型                                   | 用途                                   |
| ------------- | -------------------------------------- | -------------------------------------- |
| `pluginId`    | `string`                               | 当前插件标识                           |
| `workspaceId` | `string`                               | 当前工作区标识；不要解析它的内部格式   |
| `signal`      | `AbortSignal`                          | 本次运行结束时中止，可用于停止异步工作 |
| `commands`    | `PluginContext["commands"]`            | 注册命令                               |
| `storage`     | `PluginStorage`                        | 保存当前插件在当前工作区的数据         |
| `pages`       | `PluginPages`                          | 注册并打开页面                         |
| `settings`    | `PluginSettings`                       | 注册并打开设置区域                     |
| `fetch`       | `typeof fetch`                         | 发起与插件生命周期关联的网络请求       |
| `register`    | `(resource: Disposable) => Disposable` | 托管需要清理的资源                     |

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

## 能力范围与升级

上述命令、页面、设置、私有存储、网络和清理接口是本模板的开发范围。SDK 类型中还包含编辑器扩展接口，但目前仅用于插件工作台，不会自动作用到普通笔记编辑器；本文不将其作为普通笔记扩展的可用能力。

添加依赖使用 `pnpm add <包名>`；升级 SDK 或 React 前先确认兼容性，并完整验证启用、停用和重启流程。保留 `pnpm-lock.yaml`，以便其他开发者复现依赖版本。

# 插件的组成

默认模板使用跨端开发格式 3，targets/profile 与节点支持声明见[跨端契约](portability.md)。下文旧桌面 manifest 示例属于格式 1/2，不应直接混入格式 3。

一个 Tau 插件由以下几部分组成：

- **manifest.json**：插件是谁、需要什么。Tau 不运行代码就能读到它。
- **入口模块**（构建后是 `main.js`）：默认导出一个插件定义，包含静态声明和运行时逻辑。
- **样式**（构建后是 `main.css`，可选）。
- **Skill 目录**（`skills/<id>/`，可选）：给 AI 看的使用说明，见 [Skill](skills.md)。

这一篇依次讲 manifest 和入口，以及贯穿所有能力的几条规则：生命周期、`context`、ID、取消与清理。

## manifest

模板的 `manifest.json`：

```json
{
  "formatVersion": 1,
  "id": "example.external-counter",
  "name": "计数器示例",
  "description": "在侧边栏记录并保存计数。",
  "categories": ["page"],
  "keywords": ["计数", "打卡"],
  "version": "1.0.0",
  "minAppVersion": "0.59.0",
  "apiVersion": 1,
  "platform": "desktop",
  "format": "cjs",
  "main": "main.js"
}
```

### 需要你填写的字段

| 字段            | 说明                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| `id`            | 插件的唯一标识，由小写字母、数字组成，用点或连字符分段，例如 `yourname.counter`。发布后不要再改           |
| `name`          | 插件名称，显示在插件页和插件中心                                                                          |
| `description`   | 一句话简介，1 至 160 字                                                                                   |
| `version`       | 插件版本，格式为 `主版本.次版本.修订号`，可带预发布后缀，如 `1.2.0-beta.1`                                |
| `minAppVersion` | 需要的最低 Tau 版本，如 `0.59.0`。写完整版本号，不写 `>=`、`^` 之类的范围。客户端版本低于它时不会加载插件 |
| `categories`    | 插件中心的分类，可多选，也可以不写，见下表                                                                |
| `keywords`      | 插件中心的搜索词，最多 5 个，每个不超过 20 字。例如 S3 插件可以写 `MinIO`、`R2`                           |
| `permissions`   | 插件可能申请的用户数据权限，见[用户数据 · 权限](user-data.md#权限)和 [AI](ai.md)                          |
| `editor`        | 声明了编辑器扩展时写 `true`，见[编辑器扩展](editor.md)                                                    |
| `whiteboard`    | 声明了白板扩展时写 `true`，见[白板扩展](whiteboard.md)                                                    |
| `backend`       | 需要本机后台时填写，同时把 `formatVersion` 改为 `2`，见[本机后台](backend.md)                             |

| 分类            | 适合的插件                    |
| --------------- | ----------------------------- |
| `page`          | 提供页面和侧边栏入口          |
| `editor`        | 在文档中添加块                |
| `whiteboard`    | 在白板中添加元素或工具        |
| `ai`            | MCP 工具、AI 功能、图片生成   |
| `skill`         | Skill 包，或附带 Skill 的插件 |
| `sync`          | 同步存储                      |
| `upload`        | 图片与附件上传                |
| `voice`         | 语音合成                      |
| `video`         | 在线视频来源                  |
| `blog-publish`  | 博客发布目标                  |
| `blog-template` | 博客模板                      |

分类只影响插件中心的展示，不授予任何能力。只提供命令或普通设置的插件可以不写分类。

### 保持模板值的字段

`formatVersion`、`apiVersion`、`platform`、`profile`、`format`、`main` 按所选协议保持一致。`styles` 和 `integrity` 由构建生成；skills 仅旧桌面格式支持。不要直接修改 ZIP。

## 入口与插件定义

入口模块默认导出 `definePlugin(...)` 的结果。最小的插件长这样：

```tsx
import { definePlugin } from "@tau/plugins";

declare const __PLUGIN_META__: { id: string; name: string; version: string };

export default definePlugin({
  ...__PLUGIN_META__,
  create: () => ({
    activate(context) {
      context.commands.register({
        id: "hello",
        title: "打个招呼",
        run: () => {
          context.notifications.send({ title: "你好" });
          return null;
        },
      });
    },
  }),
});
```

`__PLUGIN_META__` 由构建脚本从 manifest 注入，包含 `id`、`name`、`version`，这样插件定义和 manifest 始终一致。

插件定义里的字段分两类：

| 字段                   | 类型       | 说明                                                                  |
| ---------------------- | ---------- | --------------------------------------------------------------------- |
| `create`               | 运行时逻辑 | 每次启用时调用，返回本次运行的实例。只有静态声明的插件可以省略        |
| `editorExtensions`     | 静态声明   | 编辑器块，见[编辑器扩展](editor.md)                                   |
| `editorCodecs`         | 静态声明   | 编辑器块的 Markdown 转换，见[编辑器扩展](editor.md#markdown-导入导出) |
| `whiteboardExtensions` | 静态声明   | 白板元素与工具，见[白板扩展](whiteboard.md)                           |
| `ai`                   | 静态声明   | 插件自定义的 AI 功能，见 [AI](ai.md#自定义-ai-功能)                   |

**静态声明**直接写在插件定义上，Tau 读取插件包时就能拿到，不依赖 `activate`。例如编辑器块不仅在桌面端显示，也会出现在用户发布的博客里，那里根本不会运行 `activate`。**运行时逻辑**则写在 `activate` 里，通过 `context` 注册。

## 生命周期

```tsx
create: () => ({
  async activate(context) {
    // 注册功能，读取必要的配置
  },
  async deactivate() {
    // 可选：额外清理
  },
}),
```

- **启用**：Tau 调用 `create()` 得到一个新实例，再调用 `activate(context)`。`activate` 完成后插件才算启用成功；它抛出异常则启用失败，已注册的内容全部撤销。
- **停用**：用户停用插件、切换工作区，或者 Tau 退出时，本次运行结束。通过 `context` 注册的命令、页面、设置等全部自动撤销，`context.signal` 被中止，然后调用 `deactivate`（如果有）。
- **再次启用**：重新调用 `create()` 和 `activate()`，拿到一个全新的 `context`。

据此有几条规则：

- 运行状态放在 `create` 返回的闭包或 React 组件里，不放在模块顶层。模块只会加载一次，顶层变量会跨越多次启用残留下来。
- 需要跨启用、跨重启保留的数据，存进 [`context.storage`](storage-and-network.md)。
- `activate` 应尽快返回。不要在里面等待用户操作或永不结束的任务；长时间的工作在后台启动，并响应 `context.signal`。
- 不要依赖 `deactivate` 保存数据，它不保证在所有情况下都有机会执行完。数据应该在用户操作时就保存。
- 不要把 `context` 保存下来留到下次启用使用。旧的 `context` 失效后，调用它的方法会报错。

## context

`activate` 收到的 `context` 是插件使用 Tau 能力的唯一入口。页面、设置组件也会通过 props 拿到同一个 `context`。

| 属性                                                  | 用途                                         | 文档                                          |
| ----------------------------------------------------- | -------------------------------------------- | --------------------------------------------- |
| `pluginId`、`workspaceId`                             | 当前插件 ID 与工作区 ID（不要解析工作区 ID） |                                               |
| `signal`                                              | 本次运行结束时中止                           | [取消与清理](#取消与清理)                     |
| `environment`、`navigation`                           | 当前环境与语义功能入口                       | [跨端契约](portability.md)                    |
| `register`                                            | 托管需要清理的资源                           | [取消与清理](#取消与清理)                     |
| `commands`                                            | 注册命令                                     | [界面](ui.md#命令)                            |
| `pages`、`sidebar`                                    | 注册页面与侧边栏入口                         | [界面](ui.md#页面)                            |
| `home`                                                | 注册首页面板                                 | [界面](ui.md#首页面板)                        |
| `actions`                                             | 在卡片、文章、项目文档的菜单里加动作         | [界面](ui.md#对象动作)                        |
| `views`                                               | 在卡片、文章、项目文档详情里放区块           | [界面](ui.md#详情区块)                        |
| `settings`                                            | 注册设置区域                                 | [界面](ui.md#设置)                            |
| `notifications`                                       | 发送通知                                     | [界面](ui.md#通知)                            |
| `storage`                                             | 插件私有存储                                 | [存储与网络](storage-and-network.md)          |
| `fetch`                                               | 网络请求                                     | [存储与网络](storage-and-network.md#网络请求) |
| `permissions`                                         | 查询与申请权限                               | [用户数据](user-data.md#权限)                 |
| `data`、`content`、`events`                           | 读写用户数据与正文、订阅变化                 | [用户数据](user-data.md)                      |
| `app`                                                 | 选择与打开已有内容、导出与演示               | [用户数据](user-data.md#选择并打开已有内容)   |
| `entities`                                            | 插件自己的内容                               | [用户数据](user-data.md#插件内容)             |
| `excerpts`、`materials`                               | 摘录与材料动作                               | [摘录](excerpts.md)                           |
| `ai`                                                  | 调用大模型                                   | [AI](ai.md)                                   |
| `mcp`、`chat`                                         | 给 AI 提供工具、自定义工具结果的展示         | [MCP 工具](mcp.md)                            |
| `flashcards`                                          | 闪卡                                         | [闪卡](flashcards.md)                         |
| `services`                                            | 编译与转换服务                               | [编译与转换服务](services.md)                 |
| `backend`                                             | 调用本机后台                                 | [本机后台](backend.md)                        |
| `sync`、`upload`、`tts`、`images`、`video`、`publish` | 注册服务提供方                               | [服务提供方](providers/README.md)             |

## ID 规则

命令、页面、设置、侧边栏条目、MCP 等注册时填写的 `id` 都是**插件内的局部 ID**：Tau 会自动加上插件命名空间，你不需要也不应该自己拼接插件 ID。不同插件可以使用相同的局部 ID，互不影响。

局部 ID 和存储的 key 都是 1 至 128 个字符，以字母或数字开头，后面可以是字母、数字、点、横线和下划线。同一类注册里重复的 ID 会报错。

## 取消与清理

**通过 `context` 注册的东西都会自动清理**，包括命令、页面、设置、侧边栏、MCP、通知、事件订阅等。注册方法返回的 `Disposable` 可以用来提前撤销：

```ts
const command = context.commands.register({ id: "temp", title: "临时命令", run: () => null });
// 不再需要时
await command.dispose();
```

**你自己创建的资源**，如计时器、DOM 事件监听、第三方库的连接，交给 `context.register` 托管，停用时按注册顺序的逆序清理：

```ts
const timer = setInterval(refresh, 60_000);
context.register({ dispose: () => clearInterval(timer) });

const onOnline = () => refresh();
window.addEventListener("online", onOnline);
context.register({ dispose: () => window.removeEventListener("online", onOnline) });
```

React 组件内的订阅照常在 `useEffect` 的清理函数里处理。

**异步任务**要响应 `context.signal`。网络请求用 [`context.fetch`](storage-and-network.md#网络请求)，它会随插件停用自动取消。异步结果写回界面前检查 `context.signal.aborted`，避免切换工作区后旧请求的结果出现在新界面上：

```ts
const result = await loadSomething();
if (context.signal.aborted) return;
setState(result);
```

## 错误处理

- 预期内的失败（网络错误、配置缺失、用户拒绝授权）要在界面上给出可读的提示，并提供重试或修复的入口。
- 命令的 `run` 抛出异常表示执行失败。需要告诉用户失败原因时，自己发送[通知](ui.md#通知)或在页面上显示。
- 读取存储、网络响应、用户配置等外部数据时，先校验类型再使用，不要假定数据一定符合预期。
- 不要在遇到额度不足、拒绝授权这类错误后自动循环重试。

## 运行环境

插件代码与 Tau 运行在同一个浏览器环境中，可以使用标准的 Web API 和浏览器兼容的 npm 包，但不能导入 Node.js 内置模块（`fs`、`path`、`child_process` 等）。需要 Node.js 能力时，使用[本机后台](backend.md)。

插件中心会审核提交的版本，但插件与 Tau 之间没有安全沙箱。只申请功能确实需要的权限，不要把密钥、令牌或你机器上的路径写进源码和插件包。

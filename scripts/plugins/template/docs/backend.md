# 本机后台

插件的界面代码运行在浏览器环境中，不能使用 Node.js。需要读写本机文件、连接本机设备、调用命令行程序时，给插件加一个**本机后台**：一段在独立 Node.js 进程中运行的代码，界面通过消息调用它。

后台是一个比较重的能力：用户首次运行前需要授权，插件中心也会对带后台的每个版本重点审核。只在浏览器能力确实不够时使用。

## 准备

### 1. 修改 manifest

把 `formatVersion` 改为 `2`，并加上 `backend`：

```json
{
  "formatVersion": 2,
  "minAppVersion": "0.59.0",
  "main": "main.js",
  "backend": {
    "entry": "backend.js",
    "runtime": "node",
    "apiVersion": 1,
    "scope": "application",
    "activation": "on-demand",
    "lifetime": "idle",
    "reason": "读取本机设备状态并显示在插件页面中",
    "systemAccess": ["network"]
  }
}
```

带后台的插件必须声明 `minAppVersion`。这里只列出相关字段，其余字段与普通插件相同。

| 字段                    | 说明                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `entry`                 | 保持 `backend.js`，模板的构建脚本会从 `src/backend.ts` 生成它                                            |
| `runtime`、`apiVersion` | 保持 `node` 和 `1`                                                                                       |
| `scope`                 | `application`：整个应用一个后台；`workspace`：每个工作区一个后台                                         |
| `activation`            | 什么时候启动，见下表                                                                                     |
| `lifetime`              | `idle`：空闲一段时间后停止，有调用时再启动；`persistent`：一直运行到作用域结束，意外退出时自动重启       |
| `reason`                | 向用户说明后台用来做什么，1 至 500 字。用户授权时会看到它                                                |
| `systemAccess`          | 后台会用到的系统能力：`filesystem`（文件）、`network`（网络）、`process`（启动程序），用于告知用户和审核 |
| `tools`                 | 需要启动外部程序时声明，见[调用外部程序](#调用外部程序)                                                  |

| `activation`      | 启动时机         | 可搭配的 `scope` |
| ----------------- | ---------------- | ---------------- |
| `on-demand`       | 界面第一次调用时 | 两者均可         |
| `app-ready`       | Tau 启动后       | `application`    |
| `workspace-ready` | 工作区打开后     | `workspace`      |

### 2. 安装 Node.js 类型

```sh
pnpm add -D @types/node@24.0.0 --save-exact
```

### 3. 创建 `src/backend.ts`

见下一节。构建脚本检测到 `backend` 声明后，会把 `src/backend.ts` 单独打包成 `backend.js`，和界面代码一起放进同一个 ZIP。

## 定义后台方法

```ts
// src/backend.ts
import { defineBackend } from "@tau/plugins/backend";
import { platform } from "node:os";

export default defineBackend({
  create() {
    return {
      activate(ctx) {
        ctx.rpc.register(
          "system.platform",
          {
            input: {
              parse(value: unknown) {
                if (value !== null) throw new Error("此方法不接受参数");
                return null;
              },
            },
            output: {
              parse(value: unknown) {
                if (typeof value !== "string") throw new Error("平台结果无效");
                return value;
              },
            },
          },
          () => platform()
        );
      },
    };
  },
});
```

`ctx.rpc.register(method, schemas, handler)`：

- `schemas.input`、`schemas.output` 是带 `parse` 方法的校验器，必须提供。输入不合法时抛错，错误会返回给调用方。也可以直接使用 zod 等提供 `parse` 方法的校验库。
- `handler(input, { signal })` 处理请求，`signal` 在调用方取消时中止。
- 请求和结果必须是 JSON，单条消息不超过 1 MiB。

后台代码可以使用 Node.js 的内置模块，第三方 npm 包会被打进 `backend.js`。只有 `@tau/plugins/backend` 由 Tau 提供。

## 在界面中调用

```ts
const os = await context.backend.call("system.platform", null, { signal });
```

| 方法                               | 说明                                                        |
| ---------------------------------- | ----------------------------------------------------------- |
| `call(method, input, { signal? })` | 调用后台方法，返回结果                                      |
| `subscribe(event, listener)`       | 订阅后台推送的事件，返回 `Disposable`                       |
| `getState()`                       | 查询后台状态：`stopped`、`starting`、`running`、`failed` 等 |

后台用 `ctx.rpc.emit(event, value)` 推送事件，界面用 `subscribe` 接收。插件停用或切换工作区后，旧的连接失效。

不要在界面代码里 `import` 后台文件，两者只通过消息通信。

## 调用外部程序

先在 manifest 的 `backend` 中声明 `process` 能力和要用到的程序：

```json
{
  "backend": {
    "systemAccess": ["process"],
    "tools": [{ "id": "git", "command": "git", "args": ["--no-pager"] }]
  }
}
```

| 工具字段  | 说明                                   |
| --------- | -------------------------------------- |
| `id`      | 工具 ID，以小写字母开头                |
| `command` | 程序名或绝对路径                       |
| `args`    | 可选。固定的前置参数，每次调用都会带上 |

最多声明 32 个工具。然后在后台中调用：

```ts
const result = await ctx.process.run("git", ["status", "--short"], { signal: request.signal });
// result.exitCode、result.stdout、result.stderr
```

- 参数按数组原样传递，不经过 Shell，不需要也不能使用引号、管道等 Shell 语法。
- 单次执行最长 30 秒，stdout 与 stderr 合计最多 512 KiB。
- 在 Windows 上，`command` 必须能解析到唯一的 `.exe` 文件。
- 需要取消时，把 RPC 请求的 `signal` 传给 `run`。

## 生命周期与清理

- 不要在模块顶层启动任务，在 `activate` 中开始。
- 计时器、连接等资源交给 `ctx.register` 托管，后台停止时会自动清理。
- 长时间运行的任务要响应 `ctx.signal`。
- `ctx.workspaceId` 在 `workspace` 作用域下是当前工作区，在 `application` 作用域下为 `null`。

## 授权与审核

- 用户首次运行插件的后台前，Tau 会请求本机执行授权。安装插件不等于授权，`app-ready` 等自动启动在没有授权时会等待用户处理。
- 插件更新后，用户需要重新确认授权。
- 插件中心会人工审核每个带后台的版本。
- `systemAccess` 用于告知用户和审核，不是操作系统级的权限限制，后台进程实际上可以访问本机的文件和网络。请如实声明。

## 发布

后台和界面在同一个 ZIP 中，作为一个整体更新，不能只替换 `backend.js`。构建、安装和发布流程与普通插件相同，见[快速开始](getting-started.md)和[发布与更新](release.md)。

插件的管理页面会显示后台的状态、错误、启动耗时和资源占用，便于用户和你排查问题。后台的 stdout、stderr 不会写入 Tau 的日志，需要诊断信息时通过 RPC 返回给界面。

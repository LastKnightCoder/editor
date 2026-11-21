# 跨端架构：命令/能力分离与 Web 适配

渲染进程与主进程之间：业务命令走统一 RPC 管道（`invoke`），平台能力走 `packages/platform` 接口按环境多实现；channel 契约集中在 `command()` 工厂，双侧共享类型。Web 版走 Web Server 逐接口承接同一契约，不做全量透传。

## 调用链

```
业务代码
  → src/commands/*（按领域封装，契约化调用）
  → src/electron.ts（渲染进程唯一网关：invoke / send / on / off，
      invoke 内置 No-handler 启动竞态重试）
  → preload bridge（contextBridge 暴露 ipcRenderer）
  → ipcMain.handle（原生通道，modules/ 下注册）
```

渲染进程零处直接使用 `ipcRenderer`。渲染侧契约桥装配在 `src/commands/contracts/install.ts`（call → IPC invoke），主进程侧在 `src-electron/main/rpc/command-bridge-install.ts`（register → ipcMain.handle）。

## 两类 channel

**业务命令**（约八成：article、fts、todo、diary、setting、podcast、导出、下载……）语义是「请后端做某事」，维持统一 RPC 管道；Web Server 实现同一套 channel，渲染层调用代码不变。重原生依赖（sharp、7zip、jieba、node-llama-cpp、ffmpeg/yt-dlp）留在 Node 服务端运行。

**平台能力**（窗口、本地文件、对话框、shell、系统字体、自动更新……）语义是「请本机环境做某事」，收口到 `packages/platform` 接口：

- Electron 实现：内部走 invoke 到主进程（BrowserWindow、dialog、fs、shell）。
- Web 实现：有浏览器等价物的用 Web API（`openExternal` → `window.open`、保存 → `<a download>` / File System Access）；无等价物的服务端承接（`nodeFetch` 代理、文件监听 WS 推送）；都没有的抛 `UnsupportedError`。

`invoke` 的角色因此退化：它是业务命令的统一管道，以及 Electron 平台实现内部的一个传输细节；业务层不直接调用。

## packages/platform

```
packages/platform/src/
  types.ts          # 接口定义 + UnsupportedError + capability 标识（纯类型，零运行时依赖）
  capabilities.ts   # capability 标识常量与静态能力矩阵
  unsupported.ts    # UnsupportedError 与默认 supports 机制
  electron.ts / web.ts   # 双实现
  index.ts          # getPlatform() 按环境返回实现
```

接口按领域拆命名空间（window / fileDialog / localFile / shell / system）聚合为 `Platform`，接口永远完整——Web 实现中无等价物的方法体统一抛 `UnsupportedError`，不出现 null 命名空间。

**能力缺失双轨**：抛错解决「调用了怎么办」，`supports()` 解决「UI 要不要渲染入口」——UI 用 `platform.supports("...")` 替代 `isElectron` 分支隐藏入口，语义从「是否 Electron」升级为「是否有该能力」；逻辑层正常路径假定能力存在，`UnsupportedError` 作为漏网调用的统一兜底。`supports()` 是声明式静态清单（实现构造时声明集合），不做运行时探测。协议层 `@tau/rpc` 的 `RpcErrorCode.UNSUPPORTED` 与之衔接：本地抛的和服务端返回的映射为同一个异常类型。

## 契约集中化

channel 字符串与类型只出现在契约文件：`command()` 工厂在 `@tau/rpc`，零业务类型依赖的契约放 `packages/contracts`（如 setting），依赖 `@/types` 的放 `apps/desktop/src/commands/contracts/`；`.register` 与调用两端共享类型，拼写与签名漂移在编译期暴露。dev 启动的对账报告 diff 实际注册 channel 与契约清单，是存量迁移的活清单。

**尚未契约化的存量**：tables 模式 B（经 `database.ts` 包装注册，60+ tables 的 `win` 隐式尾参循环）需改造注册循环后单独批次推进；其余模块按对账清单渐进搬迁。

## 中立注册表与 web-server

`@tau/rpc` 的 `command-registry.ts` 与 `http-command-endpoint.ts` 零 electron 值依赖（express 仅类型引用）：Electron 侧 `command-server.ts` 只是装配（resolveEvent/鉴权/bodyParser 注入），Web Server 直接挂载同一 registry。协议 `InvokeRequest.sessionId` 已为多用户预留。

`apps/web-server`（Express，默认 24680）提供 `/rpc/invoke`、`/rpc/send`、`/rpc-events` WS 与 `/health`；同一契约给出自己的实现（首个示范：setting 落 `DATA_DIR/setting.json` 原子写），鉴权用 `AUTH_TOKEN` 环境变量（未设跳过，为登录态留位）。预演：`pnpm --filter @tau/web-server dev` 起服务，desktop 渲染端以 `VITE_RPC_BASE_URL` 浏览器直开 dev server 走查，未实现 channel 返回 NO_HANDLER 属预期。

## 广播上下文（ctx 尾参）

需要广播的 handler 签名尾部带可选 `ctx: CommandContext = fallbackCommandContext`；`database.ts` 包装层以 `createWindowCommandContext(win)` 构造并传入。行为保真：IPC 直达调用排除来源窗口，联动调用链不传 ctx 走默认全广播。`@tau/rpc` 提供 `CommandContext` 接口与 `setCommandBroadcastSink` 注入式全广播出口；`types/table.ts` 的 handler 类型保持 `(db, ...args: any)`，尾参被 rest 容纳。

## 尚未承接的 Web 边界

- 登录态鉴权（当前仅 AUTH_TOKEN）、`database.ts` 的 sender → session 路由改造。
- 本地路径/URL 的持久化语义（文档内 `localhost:24678` 资源 URL、`ltoh://` 绝对路径、库内绝对路径）改服务端资源 ID——这是唯一不可逆的数据迁移，动手前必须备份与清洗演练。
- nodeFetch、文件监听的服务端化；数据库层（better-sqlite3 tables）上服务端的搬运。
- webview → iframe 受目标站 X-Frame-Options 限制，网页剪藏/批注依赖服务端抓取兜底。

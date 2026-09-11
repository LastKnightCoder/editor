# 跨端架构方案：命令/能力分离与 Web 版适配

> 状态：设计稿（本文档只描述目标架构与迁移路线，不伴随代码变更）
> 背景：渲染进程 IPC 已全面 HTTP 化（`/rpc/invoke` + WS `/rpc-events`），为迁移 Web 版铺平了管道。本文回答两个问题：当前 IPC 归拢到了什么程度；Web 版应该如何适配。

## 1. 现状梳理：调用已收口，channel 未收口

### 1.1 当前调用链（已 100% 归拢）

```
业务代码
  → src/commands/*（84 个文件、809 处 invoke，按领域封装、手写类型）
  → src/electron.ts（渲染进程唯一网关：invoke / send / on / off）
  → src/rpc/http-invoke.ts（fetch 封装：超时、NO_HANDLER 重试、错误还原）
      POST /rpc/invoke、/rpc/send  +  WS /rpc-events（事件回推）
  → 主进程 Express（127.0.0.1:24678，打包版 Bearer token 鉴权）
  → src-electron/main/rpc/ipc-registry.ts（monkey-patch ipcMain.handle 收录的注册表）
  → 原 ipcMain handler（317 个 channel 注册，分布在 modules/ 下 55+ 文件）
```

关键事实：

- 渲染进程**零处**直接使用 `ipcRenderer`；preload 仅暴露 `bootstrap`（一次性取 token/port/windowId）与 `sendLog`（日志上报避开 HTTP 启动竞态）。
- 全仓库 125 个文件经 `@/electron` 网关调用；事件回推由 `rpc/event-broadcaster.ts` 拦截 `webContents.send` 广播到 WS，渲染侧 `rpc/event-hub.ts` 用占位 event 补齐 `(event, ...args)` 旧签名，业务代码无感。
- Web 切换点已就位：`src/rpc/config.ts` 中 Web 分支用 `VITE_RPC_BASE_URL`（空串 = 同源）+ `localStorage["tau_rpc_token"]` + `windowId: 0`；vite dev server 已配 `/rpc` 代理，浏览器直开 dev server 即可预演 Web 端（dev 模式服务端跳过 token 校验）。
- 协议层 `packages/rpc` 已中立化：`InvokeRequest` / `InvokeResponse` / `EventMessage` / `RpcErrorCode`（其中已预留 `UNSUPPORTED` 错误码，注释明确"当前后端不支持该能力（如 Web Server 不支持窗口操作）"），以及 `typed-json.ts` 严格序列化器弥合 IPC 结构化克隆与 JSON 的语义差异。

### 1.2 尚未归拢的部分（迁移前的缺口）

| 缺口                   | 现状                                                                                                                                                                                                  | 影响                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| channel 无集中定义     | 主进程 55+ 文件内联注册，渲染层 commands 内 809 处内联字符串，双侧靠人工对齐                                                                                                                          | 拼错只能运行时 `NO_HANDLER` 暴露；Web Server 需要人工核对要实现哪些 channel |
| 无 channel 级类型契约  | `invoke<T>` 手动断言，主进程 handler 参数无类型绑定                                                                                                                                                   | 双侧类型漂移无编译期保护                                                    |
| 17 处组件层散落 invoke | `CollaborationPanel`、`AutoSyncManager`、`CollaborationView`、`SharedContentEditor`、`CollaborationSettingsDialog`、`JoinRequestNotifications`、`ContentCollaborationControl`、`TranscriptionSetting` | 绕过 commands 层，环境切换时容易漏改                                        |
| 平台能力与业务命令混居 | `commands/window.ts`（窗口 13 个）、`commands/file.ts`（本地文件 30+ 个）、`commands/extra.ts`（对话框/shell/nodeFetch）与 article/fts 等业务命令走同一条管道                                         | Web 版没有窗口/本地磁盘概念，这两类能力必须区别对待                         |

## 2. 目标架构：channel 一分为二

核心判断：**不需要为全部 channel 做"一套接口 + 双实现"**。317 个 channel 应按语义切成两类：

### 2.1 业务命令（约八成）——维持统一 RPC 管道，Web 版 = Web Server 实现同 channel

article、fts、todo、diary、setting、podcast、rss、resource、llm、model-downloader、epub-export、pdf-export……这些 channel 的语义是"**请后端做某事**"（读库、建索引、导出文件、下载模型）。HTTP 化之后它们本质上已经是 RPC 语义：

- Electron 环境：baseUrl 指向本机主进程 server（现状）。
- Web 环境：baseUrl 指向 Web Server（`VITE_RPC_BASE_URL` 已支持），Web Server 实现同一套 channel。

渲染层调用代码**一行不改**，这正是 HTTP 化已经赚到的收益。重 native 依赖（sharp、7zip、jieba、node-llama-cpp、ffmpeg/yt-dlp 等）留在 Node 服务端原样运行——collaboration-server 已验证 better-sqlite3 + native 模块可脱离 Electron 在 Linux 服务器跑。

### 2.2 平台能力（60~80 个 channel）——packages/platform 接口 + 按环境多实现

窗口控制、本地文件读写/监听、原生对话框、shell、系统字体、自动更新、终端……这些 channel 的语义是"**请本机环境做某事**"。Web 版下它们分成三种去向：

1. **有浏览器等价物**：`openExternal` → `window.open()`；保存对话框 → `<a download>` / File System Access API；选文件 → `input[type=file]`。
2. **改由 Web Server 承接**：`nodeFetch`（绕 CORS 的代理抓取）、本地文件监听（改 WS 推送）。
3. **无等价物**：托盘、全局快捷键、node-pty 终端、多窗口 → 抛 `UnsupportedError`，UI 依据 `supports()` 隐藏入口。

`invoke` 不会消失，但角色退化：它是**业务命令的统一管道**，以及 **Electron 平台实现内部的一个传输细节**。业务层不再直接调用它（现有 17 处散落 invoke 一并收拢）。

```
业务层
 ├── commands/*（业务命令）────→ RPC 客户端（baseUrl 按环境：本机 server / Web Server）
 └── platform（平台能力）──────→ packages/platform 接口
        ├── electron 实现：内部 invoke("minimize-window") → 主进程 BrowserWindow
        └── web 实现：Web API / Web Server RPC 兜底 / 抛 UnsupportedError
```

## 3. packages/platform 接口设计

### 3.1 结构

```
packages/platform/
  src/
    types.ts          # 接口定义 + UnsupportedError + capability 标识（零运行时依赖，纯类型）
    capabilities.ts   # capability 标识常量与静态能力矩阵
    unsupported.ts    # UnsupportedError 与默认 supports 机制
    electron.ts       # Electron 实现（内部走 invoke，channel 逐步集中化）
    web.ts            # Web 实现（Web API / 服务端 RPC / UnsupportedError）
    index.ts          # getPlatform(): Platform 按环境返回实现
```

接口定义零依赖（纯类型 + 极少的运行时类），渲染层与未来的独立 Web app 均可直接引用。

### 3.2 接口形态

按领域拆命名空间接口，聚合为 `Platform`：

```typescript
// packages/platform/src/types.ts（示意）
export interface WindowApi {
  close(): Promise<void>;
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  toggleFullScreen(): Promise<void>;
  setAlwaysOnTop(flag: boolean): Promise<void>;
  getState(): Promise<{ isMaximized: boolean; isFullScreen: boolean }>;
  openPomodoroMini(): Promise<void>;
  // …对齐现 commands/window.ts 的 13 个命令
}

export interface FileDialogApi {
  selectFile(options?: FileSelectOptions): Promise<string[] | null>;
  selectDirectory(): Promise<string | null>;
  saveFile(payload: SaveFilePayload): Promise<SaveFileResult | null>;
  downloadFile(url: string, defaultFileName?: string): Promise<string | null>;
}

export interface LocalFileApi {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, contents: string): Promise<void>;
  readBinaryFile(path: string): Promise<Uint8Array>;
  watchTextFile(path: string): Promise<void>; // Web：服务端监听 + WS 推送
  onTextFileChanged(listener: (p: TextFileChangedPayload) => void): void;
  // …对齐现 commands/file.ts 的本地文件命令
}

export interface ShellApi {
  openExternal(url: string): Promise<void>;
  showInFolder(path: string): Promise<void>;
  openFileWithDefaultApp(path: string): Promise<string>;
}

export interface SystemApi {
  getFonts(): Promise<FontInfo[]>; // Web：Web Fonts 白名单或 UnsupportedError
  nodeFetch(url: string, options?: NodeFetchOptions): Promise<ResponseLike>; // Web：服务端代理
}

export interface Platform {
  readonly kind: "electron" | "web";
  readonly window: WindowApi;
  readonly fileDialog: FileDialogApi;
  readonly localFile: LocalFileApi;
  readonly shell: ShellApi;
  readonly system: SystemApi;
  /** 声明式能力查询，UI 据此预先隐藏入口 */
  supports(capability: CapabilityId): boolean;
}

export function getPlatform(): Platform;
```

### 3.3 能力缺失的表达：UnsupportedError + supports() 双轨

**约定**：接口永远完整（不出现 null 命名空间）；Web 实现中无等价物的方法体统一抛 `UnsupportedError`：

```typescript
// packages/platform/src/unsupported.ts（示意）
export class UnsupportedError extends Error {
  constructor(
    readonly capability: CapabilityId,
    message?: string
  ) {
    super(message ?? `capability "${capability}" is not supported on this platform`);
    this.name = "UnsupportedError";
  }
}
```

与协议层的衔接：`packages/rpc` 的 `RpcErrorCode.UNSUPPORTED` 已预留。Web Server 对"未实现的 channel"返回该错误码，客户端 `http-invoke.ts` 错误还原时把 `UNSUPPORTED` 映射为同一个 `UnsupportedError`——**本地实现抛的和服务端返回的是同一个异常类型**，调用方只需处理一种。

`supports()` 的分工：抛错解决"调用了怎么办"，`supports()` 解决"UI 要不要渲染入口"。二者配套：

- UI 层：`platform.supports("window.minimize")` 为 false 时隐藏/禁用入口（替代现有 `isElectron` 分支——全仓 77 处消费中约 20 处是窗口概念相关的 UI 隐藏，如 `{isElectron && <GlobalTitlebar />}`——语义从"是否 Electron"升级为"是否有该能力"，对未来其他端同样成立）。
- 逻辑层：正常路径假定能力存在直接调用；`UnsupportedError` 作为漏网调用（未迁移的 UI 分支、竞态下的用户操作）的统一兜底，携带 capability 标识便于定位。

`supports()` 是**声明式静态清单**而非运行时探测：每个实现构造时声明自己支持的 capability 集合（`readonly supported = new Set<CapabilityId>([...]）`），`supports()` 查集合。不设计成运行时探测（如 try-catch 试调用），避免异步时序与副作用问题。

### 3.4 能力矩阵

| 能力                                              | Electron 行为              | Web 行为                                                                       | 备注                                                 |
| ------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------- |
| 窗口控制（13 个命令）                             | 主进程 BrowserWindow       | `close()` 可用；minimize/maximize/fullscreen/always-on-top 抛 UnsupportedError | 自定义标题栏三键按 supports 隐藏                     |
| 多窗口（pomodoro/card/todo/quick-card 等 10+ 种） | BrowserWindow 形态         | 路由内多开 / `window.open("/pomodoro")`，能力降级为"新标签页"                  | 见 §5.4，语义近似但非等价，矩阵里标 partial          |
| 选文件/选目录                                     | dialog.showOpenDialog      | `input[type=file]`；目录用 `showDirectoryPicker()`（仅 Chromium）              | 返回值从"本地路径"变为"文件句柄"，见 §5.3 路径语义   |
| 保存文件/下载                                     | dialog.showSaveDialog + fs | `<a download>`（通用）/ `showSaveFilePicker()`（仅 Chromium）                  |                                                      |
| 本地文件读写                                      | 主进程 fs                  | 服务端存储（用户卷/对象存储）+ RPC                                             | 接口签名保留 path 形参，Web 实现内部映射为资源 ID    |
| 文件/目录监听                                     | fs.watch + 事件推送        | 服务端监听 + WS 推送（复用 /rpc-events）                                       |                                                      |
| openExternal                                      | shell.openExternal         | `window.open(url, "_blank", "noopener")`                                       |                                                      |
| showInFolder / openFileWithDefaultApp             | shell                      | UnsupportedError（或 web 版提供"在资源页打开"替代入口）                        |                                                      |
| nodeFetch                                         | 主进程 axios + 代理        | Web Server 代理接口（逻辑原样复用）                                            | 绕 CORS 的核心诉求不变                               |
| 系统字体列表                                      | font-list（native）        | Web Fonts 白名单或 UnsupportedError                                            |                                                      |
| 自动更新                                          | electron-updater           | UnsupportedError（Web 天然免更新，可换"版本公告"）                             |                                                      |
| 终端（node-pty）                                  | 主进程 pty + xterm         | UnsupportedError（未来可选 SSH/web 终端扩展）                                  |                                                      |
| 托盘/全局快捷键/单实例/文件关联                   | Electron 专属              | 无对应，主进程逻辑不进 platform 层                                             | PWA 可部分弥补                                       |
| webview 标签（10+ 处）                            | `<webview>`                | `<iframe>`（HtmlBlockRenderer 已有 fallback 示范）                             | iframe 受 X-Frame-Options 限制，SPA 抓取需服务端兜底 |
| 本地媒体 `ltoh://` 协议                           | 自定义协议流式服务         | 服务端资源 URL                                                                 | **URL 已持久化进用户文档，见 §5.3**                  |

## 4. channel 契约集中化（Phase B，本文档只设计）

解决"双侧内联字符串 + 手写类型"的缺口。思路：**契约即单一来源**，主进程注册与渲染层调用引用同一份定义，类型端到端推导。

```typescript
// packages/contracts/src/article.ts（示意，可与 platform 同期建包）
import { command } from "@tau/rpc-contracts";
import type { IArticle, ICreateArticle } from "@/types";

export const articleCommands = {
  create: command<ICreateArticle, IArticle>("create-article"),
  remove: command<string, void>("remove-article"),
};

// 主进程注册（handler 参数类型由契约推导，无需手动标注）
articleCommands.create.register(async (ctx, input) => db.articles.create(input));

// 渲染层调用（返回类型自动为 IArticle）
const article = await articleCommands.create(input);
```

要点：

- channel 字符串只出现在契约文件；`.register` 与调用两端共享类型，拼写与签名漂移在编译期暴露。
- 渐进迁移：新 channel 一律走契约；存量按模块搬迁（优先高频/核心模块 article、todo、fts、setting）。
- 加一道运行时对账：dev 启动时 diff registry 中实际注册的 channel 与契约清单，报告"已注册未契约化"的存量，作为迁移进度的活清单。
- 契约包只依赖类型与轻量运行时（channel 名 + 调用器），不依赖 electron/express，可直接进 Web Server。

## 5. Web Server 适配路线（Phase C/D，本文档只设计）

### 5.1 前置：中立注册表替换 monkey-patch

现 `ipc-registry.ts` 通过 monkey-patch `ipcMain.handle` 收录 handler，文件顶部 `import { ipcMain } from "electron"`——Web Server 无法复用。改造为：

```
command-registry.ts（中立，零 electron 依赖）
  registerCommand(channel, handler) / getCommandHandler(channel)
        ↑                          ↑                    ↑
  Electron 桥接层              HTTP 端点          Web Server
  （注册同时挂 ipcMain.handle，  （现状复用）      （Express 挂载）
    过渡期双通道）
```

- **handler 签名去 Electron 化**：从 `(event: IpcMainInvokeEvent, ...args)` 改为 `(ctx: CommandContext, ...args)`，`CommandContext = { windowId?: number; sessionId?: string; sender?: WebContents }`。现有 handler 对 event 的使用仅限 `event.sender`（database.ts 的"窗口 → 数据库"路由），ctx 化后收口到一处。
- 过渡期 registry 为事实源，`ipcMain.handle` 与 HTTP 端点都从它分发；原生 IPC 通道稳定后退役（preload 只剩 bootstrap）。

### 5.2 windowId → session/user

- 现状：`windowId`（webContents id）用于多窗口各自路由数据库（`modules/database.ts` 的 `windowToDatabase`）；HTTP 侧 `createMockEvent` 已用 windowId 反查 sender，缺省回退主窗口。
- Web 多用户场景：`windowId` 语义不足。`EventMessage.connectionId` 已在协议中预留（"多用户事件必须由服务端按 connectionId 定向路由"）。目标形态：**路由键从 windowId 换成 sessionId/userId**，Electron 单机模式退化为恒定单 session，两种环境共用一套路由代码。

### 5.3 本地路径语义 → 资源 ID（最大的坑）

三处持久化的本地语义：

1. 文档内容中的 `http://localhost:24678/...` 资源 URL（`convertFileSrc` 生成，编辑器目录内文件）。
2. 文档内容中的 `ltoh:///<绝对路径>` URL（编辑器目录外文件）。
3. 数据库中存储的绝对文件路径（资源表、索引库等）。

方案：

- Web 版资源统一改用服务端资源 ID + `GET /api/resources/:id` URL。
- Electron 端保留 `convertFileSrc` 现行为作兼容读取；提供一次性迁移/清洗脚本把历史 URL 换成中立形式。
- `LocalFileApi` 的 path 形参在 Web 实现内部做"路径 → 资源 ID"映射，接口形态对业务层不变。

### 5.4 其余适配点

- **鉴权**：本机随机 token → 用户登录态（session cookie 或 Bearer）。`config.ts` 的 Web 分支注释已预留"未来接登录态后替换"，协议层无需变更。
- **多窗口**：Web 版用路由 + 新标签页近似，不做等价承诺；番茄钟迷你窗等沉浸式形态降级为页面内模式。
- **剪贴板/屏幕捕获/通知**：渲染层已用 Web API（navigator.clipboard、getDisplayMedia），无迁移负担；提醒推送走既有 WS 通道。
- **`sendLog`**：console-logger 的 IPC 直连改为 HTTP 上报（或随 platform 层收口）。

## 6. 分阶段路线图

| 阶段                   | 内容                                                                                                                                                                                                                          | 依赖        | 验证方式                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------- |
| **A. platform 层落地** | 建 `packages/platform`；接口定义 + Electron 实现（搬 `commands/window.ts`、`file.ts`、`extra.ts` 对应实现）+ Web 骨架实现；替换窗口概念相关的 `isElectron` UI 分支为 `supports()`；收拢 17 处散落 invoke 到 commands/platform | 无          | 单测（web 实现的 UnsupportedError 行为）+ 桌面回归；浏览器直开 dev server 预演 Web 骨架 |
| **B. 契约集中化**      | 建 `@tau/contracts`；新 channel 全走契约，存量按模块渐进迁移；dev 启动对账报告                                                                                                                                                | A（可并行） | 编译期类型 + 对账清单归零                                                               |
| **C. 中立注册表**      | `command-registry` 去 electron 化；handler ctx 化（sender 依赖收口）；windowId → sessionId 路由                                                                                                                               | A           | 双通道（ipcMain/HTTP）行为等价回归                                                      |
| **D. Web Server 本体** | Express/Fastify 挂载 registry；登录态鉴权；资源 ID 化与历史 URL 清洗；nodeFetch/文件监听服务端化                                                                                                                              | B + C       | 浏览器直连 Web Server 全功能走查                                                        |

### 实施状态（2026-09-10 更新）

- **Phase A 已落地**：`packages/platform`（接口 + Electron/Web 双实现 + UnsupportedError/supports）+ `src/platform` 装配 + 存量 commands 委托 + components/pages 散落 invoke 清零。
- **Phase B 已落地（首批）**：契约工厂与对账并入 `@tau/rpc`（`command.ts`）；零业务类型依赖的契约放 `packages/contracts`（setting），依赖 `@/types` 的放 `apps/desktop/src/commands/contracts/`（article 16 个、collaboration 12 个、cli 3 个）；渲染侧 commands 已改契约调用，主进程模式 A 示范迁移（setting.ts 5 个）；dev 启动对账报告挂载于 `initBackground` 完成后（`rpc/contract-audit.ts`）。
  - **遗留**：模式 B（tables 经 database.ts 包装注册，60+ tables、`win` 隐式尾参）的主进程契约化需改造注册循环，单独批次推进；其余存量模块按对账清单渐进搬迁。
- **Phase C 已落地（最小形态）**：中立 `command-registry.ts` + `http-command-endpoint.ts` 进 `@tau/rpc`（零 electron 值依赖，express 仅类型引用）；desktop 侧 `ipc-registry.ts` 内部改持中立 registry、`command-server.ts` 退化为 Electron 装配（resolveEvent/鉴权/bodyParser 注入）；协议 `InvokeRequest.sessionId` 预留、渲染 `config.ts` 同步预留。
  - **遗留**：`database.ts` 的 sender→session 路由改造与 tables handler 的 `win` 尾参抽象（深耦合 9 个 table 文件），随多用户需求（Phase D 登录态）一并推进。
- **Phase D 已落地（骨架 + 全链路演示）**：`apps/web-server`（Express，默认 24680）——复用中立端点实现 `/rpc/invoke`、`/rpc/send`、`/rpc-events` WS 广播（帧格式对齐渲染端 event-hub）与 `/health`；**同契约双实现首个示范**：setting 契约的 Web 实现落 `DATA_DIR/setting.json`（原子写）；鉴权为 `AUTH_TOKEN` 环境变量（未设 = dev 跳过，为登录态留位）。
  - 预演方式：`pnpm --filter @tau/web-server dev` 起服务，desktop 渲染端以 `VITE_RPC_BASE_URL=http://127.0.0.1:24680` 浏览器直开 dev server 走查（未实现的 channel 返回 NO_HANDLER，属预期）。
  - **遗留**：登录态鉴权实现、资源 ID 化与历史 URL 清洗（§5.3，动手前必须备份演练）、nodeFetch/文件监听服务端化、数据库层（better-sqlite3 tables）上服务端的搬运。

### win 尾参去除：一次尝试与回滚（2026-09-11 记录）

曾尝试把 `win` 尾参重构为 `CommandContext` 头参（ctx 携带 broadcastOthers/broadcastAll 能力）：tsc 层面零错误、tables 目录一度零 BrowserWindow，但**全量测试有 17 个测试从运行中消失（总数 1068→1051、skipped 7→2），回滚后立即恢复**——说明该改动存在未被类型检查与单测发现的运行时影响。已整体回滚（561/573 的占位 `_ctx` 形参噪音、约 1500 处 codemod 修改的可审计性问题也是决策因素）。

结论与后续约束：

- **win 尾参问题已按"显式 ctx 尾参"小刀方案落地（2026-09-11 第二次尝试，成功）**：仅改造 12 个真正用 win 的方法（article×4、card、project、document、content、diary×3、daily-note），签名尾部 `...res`/`win: BrowserWindow` 统一为**可选的** `ctx: CommandContext = fallbackCommandContext`（默认参数）；database.ts 包装层以 `createWindowCommandContext(win)` 构造并作尾参传入；`@tau/rpc` 提供 `CommandContext` 接口与 `setCommandBroadcastSink` 注入式全广播出口。**行为与旧机制逐路径保真**：IPC 直达调用排除来源窗口（旧 win 语义）、联动调用链不传 ctx 走默认全广播（旧 win=undefined 语义），27 处联动调用点零修改。7 个文件 BrowserWindow 清零（audio-note/video-note 的形态 C 全量广播按设计保留 electron 依赖）。验收：tsc 零错 + 全量测试与基线逐项一致（35 failed | 1026 passed | 7 skipped | 1068）。
- 后续若要进一步收敛：把 audio-note/video-note 的形态 C 也统一到 ctx.broadcastAll；web-clip.ts 绕行代码回迁 ContentTable.updateContent（其 BrowserWindow 前置障碍已消除）。
- types/table.ts 的 handler 类型保持 `(db, ...args: any)`（尾参 ctx 天然被 rest 容纳，无需改接口）。

风险清单：

- **路径/URL 持久化**（§5.3）是唯一不可逆的数据迁移，Phase D 动手前必须先做备份与清洗演练。
- **FS Access API 仅 Chromium**：目录选择等能力在 Firefox/Safari 直接抛 UnsupportedError，矩阵已按 supports 降级。
- **webview → iframe** 受目标站 X-Frame-Options 限制，"网页剪藏/批注"依赖服务端抓取兜底（nodeFetch 已在服务侧）。
- **重 native 模块**（node-llama-cpp 本地推理等）只能留在 Node 服务端；若 Web 版未来走 serverless 部署，这部分能力需按 supports 裁剪。

## 7. 结论

- **IPC 已归拢**：渲染进程调用 100% 收口到 `src/electron.ts` 网关走 HTTP RPC，业务层零 `ipcRenderer` 残留；未归拢的是 channel 字符串与类型契约（双侧内联、人肉对齐）。
- **Web 适配的主轴**是把 channel 按语义切成"业务命令"（约八成，统一 RPC 管道，Web Server 实现同 channel，渲染层零改动）与"平台能力"（60~80 个，`packages/platform` 接口 + Electron/Web 双实现，能力缺失统一抛 `UnsupportedError`、UI 用 `supports()` 预先降级）。
- 路线图 A→B→C→D 每阶段独立可验证，A/B 可并行启动。

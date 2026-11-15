# 桌面端架构（权威交接文档）

> 给接手的上下文/协作者：本目录是桌面端代码的权威说明，按域分篇，读完索引与对应分篇即可按既有架构、UI 与交互风格继续开发。token 与组件规范见 [design-system.md](/docs/architecture/design-system.md)。

## 上手顺序

1. 读本索引与 [overview](./overview.md)（结构现状与目录职责，≈3 分钟）；
2. 写页面前读 [page-protocol](./page-protocol.md) 与 [ui-interaction](./ui-interaction.md)，其余按任务读对应分篇；
3. 打开 `apps/desktop/src/app/AppShell.tsx` → `Sidebar.tsx` → `page/` 目录过一遍；
4. 跑 `pnpm dev`（desktop），主窗口即新壳层。

## 分篇索引

| 篇                                    | 覆盖                                                                                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [overview](./overview.md)             | 结构现状、目录结构与文件职责、已退役功能边界、公共 UI 归属                                                                                                     |
| [page-protocol](./page-protocol.md)   | definePage / queries / 主题与字体协议、编辑器集成要点、Page 导航与服务层接线、DeepLink、新增页面流程、移动端源码映射                                           |
| [ui-interaction](./ui-interaction.md) | UI 风格铁律、交互规范（形变 / Button / Menu / Dialog / Popover / Tooltip / 演示 / 沉浸 / 滚动区）                                                              |
| [data-baseline](./data-baseline.md)   | 数据基线门禁、正文与白板格式边界、业务写正文口径、字数与空文档、协作网络与身份隔离、导入导出与资源搬运                                                         |
| [plugins](./plugins.md)               | 插件宿主全量：页面与作者 API / 窗口 / 聊天渲染 / ASR 与语音输入 / 领域提供方 / MCP 与 AI / 独立后台 / 静态内容 / 博客发布 / 服务与数据授权 / 中心管理 / 贡献位 |
| [whiteboard](./whiteboard.md)         | 白板画布与扩展装配、文档会话、整库同步与文档保存、文档卡与日记正文身份                                                                                         |
| [main-process](./main-process.md)     | 主进程模块就绪与启动分层、卡顿诊断、索引与嵌入、通知分流、构建与打包                                                                                           |
| [ai-chat](./ai-chat.md)               | 对话工作目录、pi 聊天运行时与工具审批、个人助手记忆                                                                                                            |
| [home-features](./home-features.md)   | 今日页数据契约与各业务域接线（测验 / 日程 / 番茄 / 待办 / 闪卡 / 卡片库 / 脉络 / 洞见 / 创作模式 / 知识地图 / Database / PDF / 列表排布）                      |

## 禁止事项（防腐化）

- 不在 page/、ui/ 引业务代码；features 域之间不 import 彼此 store；
- 可被调用方覆盖默认样式的组件，不裸用 clsx 合并 className（走 `cn()`，见 [ui-interaction](./ui-interaction.md) 铁律）。
- UI 使用 `@tau/ui` + Tailwind，图标使用 lucide-react；不写 CSS Modules；不画横线分隔区块；
- 不在 Sidebar/Titlebar 硬编码模块条目（改 navigation.ts）；
- 新主进程模块一律 BACKGROUND；启动竞态与失败重试使用 ensureModule/withModule（见 [main-process](./main-process.md)）；
- 业务通知走 appNotify / routeNotification（见 [main-process](./main-process.md) 通知分流），禁止直连 `@tau/ui` 的 notify 或 Electron 原生 `Notification`；
- 不造假演示数据（未接线就 null+空态）；
- 主题/页面必须走 defineXxx 协议注册（禁止中心登记表与散装 CSS）。

迁移期的编辑器数量基线、扩展边界独立扫描与 antd 专项检查已退役，不再执行 `check:editor-refactor` / `check:editor-boundaries` / `check:antd`。现有 Oxlint 架构规则、类型、行为、主题契约、数据一致性和其他模块边界仍按变更范围验证。

对话块预览由当前 `renderers` 声明收集；未注册语言作为普通代码展示。TikZ/Typst 的编辑器渲染与编译由插件和当前服务提供。

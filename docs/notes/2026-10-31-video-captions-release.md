# 视频字幕接口与插件发行记录

日期：2026-10-31（Asia/Shanghai）。客户端源码提交为 `2563458f0`；本次没有发布客户端安装包。

## 功能与协议

视频插件新增可选 `getCaptions(ref, signal)`，返回毫秒时间戳字幕或 null。空白视频笔记优先读取并保存平台字幕；读取不到或用户不满意时仍可自行转录，已有转录不会被自动替换。协议说明位于作者模板 `docs/providers/video.md`，宿主事实已沉淀到架构文档。

Bilibili 读取对应分 P 的字幕，人工字幕优先，登录凭据只发给 API，不发给字幕 CDN。YouTube 复用宿主 yt-dlp 与代理，只下载一条 JSON3 字幕，人工字幕优先、同类优先原语言，不下载视频或调用转录模型。字幕请求响应取消，任务目录结束后回收。

## SDK

[@xiongtao.xt/tau-plugins 0.52.0](https://www.npmjs.com/package/@xiongtao.xt/tau-plugins/v/0.52.0) 已公开可安装，注册表完整性与下载归档均同本地产物一致：

`sha512-6ObGwybIkJFAoJOAmYFS+R+TcM/75D3h0DQHONlyJUWs1hF5SNF0O8SzGFbgbAfKo47iAABmLou/7MrUjJrvAA==`

与 0.51.0 对比，依赖不变；除字幕接口外，包含现有源码提交 `153cec3a4` 的 AI 能力收敛（仅 chat / flashcardGeneration），已记入 SDK 更新记录。UI 沿用插件原有 0.5.0，没有发布 UI 包。

作者模板 main 已推送 `7b394b1`：字幕文档为 `ee15ffe`，正式 SDK 依赖升级为 `7b394b1`。SDK 归档只采用模板已提交文档，未纳入本地其他文档草稿。

## 插件发行

| 插件     | 版本与 Release                                                                      | 源码提交                                   | GitHub 与中心 ZIP SHA-256                                          |
| -------- | ----------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| Bilibili | [0.2.7](https://github.com/LastKnightCoder/tau-plugin-bilibili/releases/tag/v0.2.7) | `fc0994c4a602f2695432797f02afd693a642b8a8` | `8ebe19cb9ce5c22bcc43278c562731d498af04e38049351b5405aa40bad797a5` |
| YouTube  | [0.2.8](https://github.com/LastKnightCoder/tau-plugin-youtube/releases/tag/v0.2.8)  | `a1e827f9fac6d249586b242a9f29b500f9257b20` | `d6c0e9b8dc33896273b6b709630a62516f96dedfdfea4a1a68bd1945a5778694` |

两项「发布插件」工作流均成功（Bilibili `41184943725`、YouTube `41184943678`），插件中心分别于上海时间 16:31:48、16:31:46 发布。中心下载、GitHub ZIP 和中心记录的 SHA-256 三者一致；包内 main.js 和 manifest 与本地使用正式 npm SDK 的构建一致。最低客户端声明沿用 0.60.2；旧客户端不调用新字幕接口，字幕优先行为需要包含上述源码提交的客户端。

## 验证与范围

- SDK 全量 337 项测试、SDK 类型检查通过。
- 宿主定向行为测试 27 项、桌面类型检查、Vite 8.3.5 的前端/主进程/preload 构建，以及隔离环境下生产页面模块求值与 React 首次挂载通过。
- 两个插件分别 8 项、5 项测试通过；候选包与正式 npm SDK 分别完成独立作者工程冻结安装、类型检查和构建。正式作者模板冻结安装与构建通过。
- 使用真实 yt-dlp 2026.10.26 进程与本地 HTTP 字幕夹具验证：只下载字幕、正确生成 JSON3 并保留毫秒时间戳。
- 代码检查无错误；现有测试文件的 any 等警告保留。数据库、白板、插件进程边界与文档检查通过。
- 未用真实网站账号验收字幕可用性；未做视觉验收，未发布或安装客户端。

本地原始报告、npm 包和两处下载的 ZIP 位于忽略目录 `output/video-captions/`。

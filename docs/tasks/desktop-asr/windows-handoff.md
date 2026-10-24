# Windows 验证交接

目标：把已实现的 ASR 能力交付到 Windows 实机，验证原生路线和宿主行为，通过后合并到 master。

## 分支与提取边界

- 主仓库分支：`codex/asr-windows-validation`。
- 基线：本地 master 的 `3ec8bfe0a`。用户确认保留其既有提交历史；提取时远端 master 为 `10fa4e54e`，本地领先 45 个提交。
- 本分支新增内容只包括统一 ASR、Whisper 适配、Mac helper、桌面与移动 WebSocket、Seed 注册、可选 AI 整理、对应测试与文档。
- SDK 0.43.0 的发行提交单独移植；不带入开发中的 SDK 0.44.0、正文统计、编辑器契约、白板协作、移动 TTS 或字体功能的未提交改动。
- Seed 固定到已发布的 0.1.0；模板使用正式 SDK 0.43.0，仅同步入口撤回后的说明。公开包不重发，客户端不发布。
- 所有新增产品入口继续撤回：不添加聊天／搜索麦克风、设置页、快捷键、导航或插件配置跳转。测试使用独立工具，能力服务由测试显式调用。

## 工作清单

- [x] Investigate/Triage/Understand the problem：梳理混合工作区、SDK 依赖及分支基线，确认用户接受本地 master 的既有历史。
- [x] 在独立工作树提取 ASR 代码、任务文档和子模块引用。
- [x] 运行隔离源码的相关测试、类型与构建检查，检查改动边界。
- [x] 推送分支，验证远端提交及子模块可达，交接 Windows 实测。

## Windows 获取源码

在没有同名分支的现有克隆中执行：

```powershell
git fetch origin
git switch --track origin/codex/asr-windows-validation
git submodule update --init --recursive
pnpm install --frozen-lockfile
```

如果已有同名本地分支，切换后使用 `git pull --ff-only`；工作区有未提交内容时先妥善保留，不覆盖或重置。

阅读本任务 README、P1–P4 实施记录、entry-removal.md 和 release.md；遵循仓库 AGENTS.md 及桌面架构。此前 P3/P4 的界面使用说明属于历史实现记录，以入口撤回记录为准。

## 验证范围与决策边界

当前 Windows 原生实现尚未完成，探测返回 unsupported；这不是 Windows 平台能力不可用的证据。先记录 Windows 版本/build、CPU 架构、开发工具、Windows SDK、语言资源与包身份，结合微软官方文档制作最小原生验证工具。

- 中文与中英混说、录音期间 partial 修订、停止后的尾帧与 final；真人测试先提示用户开始，建议末句“最后五个字，春夏秋冬雨”。
- 默认 VAD 下的静音、长停顿、自然句末；首次模型准备要区分已装模型和真正冷启动下载，记录离线与取消行为。
- 麦克风拒绝授权、设备／模型缺失、录音中取消、准备中取消及等待 final 时取消；取消后不交付迟到结果，资源应释放。
- 记录首个 partial、停止至 final 延迟和尾句完整性；说明是真流式还是分段识别、本地还是云端处理。
- 现有 PCM 为显式 16 kHz 单声道小端 Int16；按能力协商格式，转换放在适配边界。stop 排空尾帧并等待 final，cancel 终止整个任务。
- Seed 通过独立插件验证标准 WebSocket 事件、状态、send/close、鉴权头、背压和生命周期；缺少真实凭据时标明云端联调未验证，不把 mock 当真机通过。
- Whisper 验证中文和空格路径、FFmpeg 格式归一化、模型缺失、取消时子进程退出及临时文件清理；文件转录不宣称实时能力。
- AI 整理保持可选、复用现有模型、保留原文、失败回退、取消不交付，不增加产品界面。

Windows 不要求兼容所有版本。系统版本、硬件、语言模型、包身份或 NSIS 打包发生限制时，记录证据并与用户商议，不擅自切换 MSIX、引入复杂兼容层或静默改云端。默认不保存真人录音、完整转录正文或凭据。

## 检查与合并

先检查实际 scripts，再执行 ASR、SDK 和桌面相关测试、类型检查、构建及 Windows 打包验证。Mac 检查不能代替 Windows 实测；Agent 不做视觉验收。

把环境、命令、指标、结果和待决策项写入本目录 windows-validation.md，并更新任务进度。架构只记录已确认的实现事实，执行 `pnpm check:docs`。

用户授权 Windows 实测和必要修复通过后合并到 master。未解决的平台／打包取舍先等用户决策；仅提交 ASR 相关内容，若修改子模块先推子仓库再固定 gitlink。获取最新 master、处理冲突、重跑受影响检查后合并并正常推送，不强推、不发布客户端或新的 SDK／插件版本。报告验证结论、限制、提交和合并 SHA、推送状态。

## 本次 Mac 隔离验证

- 主工作区未修改，所有提取、格式化、测试及构建在独立工作树进行；未提交内容通过明确文件清单和混合文件逐段筛选。
- 冻结锁文件离线安装通过。公共 ASR 26 项、SDK 266 项、桌面相关 77 项、移动相关 24 项、Seed 协议 6 项及宿主集成 7 项测试通过，共 406 项。
- 公共 ASR、SDK、桌面整库及移动类型检查通过；此前主工作区的白板类型错误不在本分支内。
- 桌面 Vite 渲染层、主进程与 preload 构建通过；移动 `pnpm --filter mobile build` 通过。构建有既有分包体积／动态导入提示，无错误。
- Mac helper 双架构编译与临时签名通过；移动 `cargo check --lib --locked --offline` 通过。未构建正式签名安装包，没有执行 Windows 或移动真机测试。
- 模板使用 npm SDK 0.43.0 冻结安装、构建通过；两份入口撤回文档提交到模板分支 `codex/asr-host-docs`，提交 `20dbcd2`。Seed 保持已发布提交 `5a7acb68b01a3ec0e24359d8166e512f77a5b8f6`，未改版本或重新发布。
- ESLint／Prettier、数据库与白板边界检查通过；文档检查及入口消费者复查通过。真人证据只有计数、耗时和尾词匹配布尔值，不含原始录音和正文。

以上为 Mac 隔离源码检查，Windows 仍待实机验证。

宿主提交 `b2eaa025e` 已推送至主仓库的 `codex/asr-windows-validation`；Seed 和模板固定提交均已核对远端可达。下一步在 Windows 拉取该分支，按本文件完成实机验证，再按授权合并 master。当前 Mac 主工作区仍保留原有修改，未执行 master 合并。

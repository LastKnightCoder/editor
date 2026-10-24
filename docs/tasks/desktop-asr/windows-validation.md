# Windows ASR 验证

目标：在当前 Windows 实机验证能力层，修复必要问题；按用户确认的支持范围合并，不新增语音入口或发布客户端。

## 工作清单

- [x] Investigate/Triage/Understand the problem：核对交接、环境、微软依据与现有宿主。
- [x] 原生最小探针和平台取舍；用户选择保留 NSIS，本轮不开放 Windows 原生。
- [x] Whisper 真实文件转录、取消、Seed 合成宿主与生命周期回归，修复显式 CPU 选择。
- [x] 最终类型、行为、打包、文档检查。
- [x] 最新 master 合并推送；本轮 Windows 验证完成，父任务的剩余设备与产品验收继续保留。

## 环境与源码

- 日期：2026-10-24；Windows 11 专业版 23H2，10.0.22631.2861，x64。
- CPU：Intel i7-13700KF；GPU：NVIDIA RTX 4080 SUPER。没有据此宣称 NPU 能力。
- Visual Studio Community 2022 17.9.6，MSVC 14.39.33519；Windows SDK 10.0.22000.0 / 10.0.26100.0；dotnet 不在 PATH。
- Node 24.4.1，pnpm 11.9.0；包内 Electron 43.1.1 / Node 24.18.0。
- 起始分支 codex/asr-windows-validation，HEAD 为 151df017324cd431aa1aa7ff7153d33009f10bc4，工作区干净。fetch、pull --ff-only、submodule update --init --recursive、pnpm install --frozen-lockfile 通过。
- Seed 固定发布提交 5a7acb68b01a3ec0e24359d8166e512f77a5b8f6；没有修改子仓库、重发 SDK 或插件。
- 中文系统语音语法资源：zh-Hans-CN；本机 TTS 有 Huihui Desktop 与 Zira Desktop。语言列表不代表新 Windows AI 模型已安装。

## 原生证据与用户裁决

[最小 C++/WinRT 探针](./native-probe/windows.cpp)只读取包身份、枚举语法语言、创建 zh-CN 识别器并编译列表与听写约束，不启动录音或识别，不发送音频。

在 x64 Native Tools 环境编译运行：

```powershell
cl /nologo /EHsc /std:c++17 /utf-8 docs/tasks/desktop-asr/native-probe/windows.cpp /Fo"$env:TEMP\tau-asr-windows\probe.obj" /Fe"$env:TEMP\tau-asr-windows\probe.exe" /link windowsapp.lib
& "$env:TEMP\tau-asr-windows\probe.exe"
```

实测输出：packageIdentityStatus=15700（APPMODEL_ERROR_NO_PACKAGE），grammarLanguage=zh-Hans-CN，recognizerCreated=true，listCompile=0，dictationCompile=0。构造及约束编译成功不证明无身份完整听写可用，也不推导权限、停止尾句和正式安装支持。

2026-10-24 查询的微软官方依据：

- [Windows AI Speech](https://learn.microsoft.com/en-us/windows/ai/apis/speech-recognition)：要求 Windows 11 24H2/build 26100 起，Windows App SDK 2.2.2-experimental9 起；仍为实验、非生产支持。支持 CPU 或 NPU，GPU 不支持；CPU 模型通过 Windows Update 准备。文档的包声明段要求 MSIX + systemAIModels（该段文字仍称 imaging，不能替代实际 speech 包验证）。本机低于系统要求，未安装实验 SDK、模型或升级系统。
- [Windows SDK Speech](https://learn.microsoft.com/en-us/windows/apps/develop/input/speech-recognition)：明确声明包身份要求；预定义自由听写使用远程 web service，需要在线语音识别。其包身份表述与本机“构造/编译成功”需分阶段理解，未实际启动听写，不能声称推翻要求。

用户已确认：保留 NSIS，本轮暂不开放 Windows 原生，继续 Whisper/Seed；不改用微软云端、不加入旧引擎兼容层、不更改发行方式。没有真人录音，因此原生 partial 延迟、stop→final、尾句、VAD、权限拒绝、冷下载进度、离线及准备取消均未验证。产品 Windows 原生仍返回 unsupported，这一产品边界不等于 Windows 平台永远不可实现。

## Whisper 实测

使用本机已有 Faster-Whisper-XXL r245.2 与 faster-whisper-base（model.bin 145217532 字节），未下载或更换模型。独立工具通过 Huihui TTS 生成固定中文合成语料，含“最后五个字，春夏秋冬雨”；先转成中文空格路径下的 44.1 kHz 双声道 MP3，再调用真实 TranscriptionService。FFmpeg 输出的 WAV 头逐项验证为 PCM、16 kHz、单声道、16 位小端。无真人音频或正文保存。

| 场景       | 结果                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 默认 CUDA  | 写出字幕后异常退出 3221226505 / 0xC0000409；直接运行同程序可复现；宿主拒绝成功结果并清理目录                                                |
| 显式 CPU   | 修复前被 program.device 覆盖；修复后真实文件任务通过，14749 ms，返回 85 字符                                                                |
| 五字尾词   | 春夏秋冬雨存在；严格结尾匹配为 false，base 在尾部追加重复内容，不称质量验收完美                                                             |
| 取消       | 识别进程启动后 500 ms 发取消，包含规范化与等待的总耗时 602 ms；结果为 cancelled，两次任务临时目录均删除；随后无残留 faster-whisper-xxl 进程 |
| 模型缺失   | 独立临时资源夹具返回 needs-assets，不启动程序或自动下载；没有删除用户模型                                                                   |
| 并发与失败 | 独占目录、非零退出拒绝残留 SRT、原文件旁旧 SRT 不受影响、取消前不启动，Windows 行为测试通过                                                 |

CPU 直接命令运行亦以 0 正常退出；CUDA 直接命令虽然输出“Operation finished”仍以 -1073740791 退出。未吞掉错误码、未把生成了 SRT 等同成功、未静默降级设备。程序的 CPU 选择是显式传入 device: cpu；缺省仍保留原设备选择规则。

用户已确认接受：本轮 Whisper 显式 CPU 文件转录通过，CUDA 保留已知失败，base 尾部重复保留质量限制；不将文件转录称为实时识别。未测真人、中英混说、长录音或不同模型质量，首 partial 和 stop→final 不适用于该文件流程。

复现测试（仅使用合成输入）：

```powershell
$env:TAU_ASR_USER_DATA = "$env:APPDATA\desktop"
$env:TAU_ASR_FFMPEG = "$env:USERPROFILE\.editor\bin\ffmpeg.exe"
$env:TAU_ASR_FIXTURE = "$env:TEMP\tau-asr-windows\中文 输入.mp3"
pnpm --filter desktop exec vitest run src-electron/main/services/__tests__/whisper-windows-validation.test.ts
```

测试未设置上述环境变量时跳过，不能把跳过算作实测通过。测试只替换 Electron 路径与 FFmpeg 定位，实际执行生产引擎、FFmpeg 和 Whisper；输出仅计数、时间与尾词布尔值。

## Seed、AI 与生命周期

- Seed 正式 npm 锁文件安装、类型、构建、6 项协议及 7 项实际构建产物宿主集成测试通过。协议仍在独立子模块；厂商服务为合成夹具，覆盖 partial 修订、尾包、断线、握手失败、停用回收。
- Windows 本地真实 WebSocket 服务器验证鉴权测试头、协议协商、早到消息、二进制 send/receive、close 原因、窗口隔离与挂起读取释放。SDK 9 项标准桥测试覆盖状态、Blob 顺序、背压、异常与取消；修复固定 10 ms 等待造成的 Windows 时序失败，改用可控计时器，不修改生产桥语义。
- 新增 4 项 speech-input 模块行为测试，以真实本地连接触发 destroyed、render-process-gone、主帧导航和切库，均回收连接、拒绝挂起读取并释放租约。ASR 任务测试另验证迟到成功被取消覆盖。
- AI 整理公共层 8 项、桌面适配 9 项通过：可选、固定已有模型配置、原文与时间轴保留、失败/空响应/超时回退、取消与迟到预览。未调用真实 LLM 账号。
- 未提供真实 Seed 凭据，没有云端识别实测；用户已接受此限制。没有为验证新增配置页或将凭据写入脚本。

## 检查与打包

- 公共 ASR 26 项、SDK 266 项、桌面首轮 25 项通过（Mac helper 与原 Whisper 测试共 6 项跳过）。补齐后 Whisper 文件测试 4 项、真实 CPU 1 项和生命周期 4 项通过；Mac helper 仍仅适用于 Mac。
- 公共 ASR、SDK、桌面全库 tsc --noEmit 通过。
- pnpm --filter desktop build 首轮通过：schema 准备、类型检查、Vite 渲染层/主进程/preload、NSIS、包内 native-runtime 全部通过；既有 chunk 体积与动态导入提示保留。
- 包内验证包含 better-sqlite3、sqlite-vec、sharp、jieba、anydoc、llama CPU/Vulkan、Tailwind、ripgrep、7zip、字体及 pi 中文路径/TypeScript 扩展/JSONL 恢复冒烟。
- 安装包 Authenticode 为 NotSigned；用户已接受未签名限制。没有安装或发布客户端，不将构建通过写为实际安装、升级、麦克风权限或签名验收。
- 修复后再次完整构建成功；最终桌面相关回归 33 项通过、3 项 Mac 专属跳过，真实 Whisper CPU 测试另行通过。类型检查通过；ESLint 0 错误、12 个测试非空断言警告；check:docs 通过、0 警告。构建日志位于本机临时目录 tau-asr-windows/final-build.log，不提交二进制或完整构建日志。

## 修复与交付边界

修复提交：384186d433028740d8c3c1ec389ad28a3c7e4450，已推送 codex/asr-windows-validation。合并前再次 fetch，最新 origin/master 为 10fa4e54e6d78ab3d84b09e3a8c315fc600389fb，已包含在验证分支历史内；无冲突，合并树与已验证分支逐字一致。合并提交 9675b9ae35e3ed6f8679cf05d27a64a4d7117f15 已正常推送 origin/master，并以 ls-remote 核对；未强推。合并消息按仓库要求使用 chore(merge)，消息校验、数据库/白板边界、文档检查均通过；为避免再次格式化既有合并历史，合并落盘使用已完成的检查结果，未重跑 lint-staged。仅本记录的收尾更新随后独立提交。

最终本机 NSIS 文件 Tau-v0.59.5-win32.exe 为 217453727 字节，SHA-256：810267db0c7f6440be0dae65958245638f36e38614f06e2a70342f23fe260886。只构建、不上传。

主要命令：`pnpm --filter @tau/asr test`、`pnpm --filter @tau/plugins test`、各包 `check`、`pnpm --filter desktop exec tsc --noEmit`、`pnpm --filter desktop exec vitest run <相关测试路径>`、`pnpm --filter desktop build`、`pnpm check:docs`、`git diff --check`。Seed 在子模块运行冻结安装、`pnpm test`、`pnpm build`，并设置 `TAU_HOST_ROOT=D:\coding\editor` 后运行 `pnpm exec vitest run --config validation/vitest.host.config.ts`。

生产修复仅为 Whisper 尊重显式 device；其余为跨平台测试、独立探针与文档。所有新增语音入口仍撤回，没有数据库结构或子模块修改。Windows 验证完成不代表整个 desktop-asr 产品任务完成：入口位置、Mac 正式包/冷下载、移动真机及 P5 仍未结束，因此父任务目录保留，完成时再按沉淀→退役→索引收尾。

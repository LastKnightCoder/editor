# P2 契约与 Whisper 接入

日期：2026-10-24。
范围：统一 ASR 契约与运行时、现有 Whisper 文件任务、真实文件入口接线、任务取消及隔离；不扩大 Windows 原生支持，不接 Seed 或产品麦克风 UI。

## 1. 已落实的接口与调用链

工作区新增 `@tau/asr`，无 Electron、React 或插件宿主依赖，包含文件／实时接口、结果与分段事件、错误、文本归约器、任务及流会话控制器。准确签名与当前运行规则见 [包说明](/packages/asr/README.md) 和 [类型](/packages/asr/src/types.ts)。

当前真实调用链：

1. 现有 `transcribeAudio` / `transcribeAudioSegmented` 接收可选第三参数 `{ signal, onProgress }`，先保证 transcription 模块就绪，再固定任务 ID、安装事件监听并发起调用。
2. 主进程仍使用既有 BACKGROUND transcription 模块，按调用窗口 + taskId 登记任务。取消只能作用于本窗口的相应任务；切库、重载、窗口销毁和退出同时取消相关任务。
3. 单文件与分段执行均经内置 `createWhisperASR`；提供方固定模型配置，只声明 file/final-only 能力，不伪报实时。文件读取句柄可以流式落盘；宿主已授权的本地文件在内部直接解析路径，插件契约不暴露该路径捷径。
4. `whisper-engine.ts` 复用原程序检测、模型目录、参数和 SRT 解析。ffmpeg 把输入规范为 16 kHz、单声道、PCM Int16 WAV，每个调用独占临时目录；默认在程序正常退出后读取本次 SRT，再交付最终结果；后续 Windows XXL 的特定完成后退出故障按 Windows 验证记录的严格完成证明恢复。
5. 已有媒体流程继续消费原字段。公共 ASR 的最终结果采用毫秒时间戳与顶层 words；原媒体数据通过宿主私有的 `WhisperTranscript.sourceResult` 取回，不把该字段扩展成插件 API。

本阶段未向 PluginContext 增加未接线的 `context.asr` 字段；插件注册与运行宿主在 P3 与 Seed 一起实现，不发布 SDK。系统原生驱动的产品装配同属 P3。

## 2. 格式、尾句与取消规则

- 公共实时输入限定协商好的 PCM Int16 单声道；帧 seq、startSample 从 0 连续递增，长度按两字节样本对齐。调用方修改原字节不会改变已接受帧。
- 实时发送串行并有音频时长预算；超过队列容量明确失败。endInput 幂等，禁止继续 write，先排空尾帧再调用驱动 finish，结果必须等最终文字；默认尾句期限十秒。
- 取消可胜过结束等待，拒绝迟到成功；在连接创建期间取消，迟到取得的连接也会回收。驱动自身必须遵守取消与有界 dispose，公共包不能抢占任意同步代码。
- Mac 策略已固定 medium VAD、16 kHz Int16；P1 原型也改为默认 VAD，只有显式 --no-vad 才关闭。策略常量不代表产品麦克风入口已经开放，也不表示 whisper.cpp 自动具备 Apple 的 VAD。
- 文件处理的取消信号贯穿提供方、规范化进程、Whisper 进程与读取阶段。实际子进程收到 SIGKILL 后等待 close，随后才释放临时目录；共享 ffmpeg 准备可继续供其他任务使用，取消只结束本任务等待，后续不启动识别。
- 主进程进度带 taskId，渲染端过滤；已取消命令的取消通知直接走控制 IPC，不被同一个已取消的命令作用域拦截。
- 分段队列每次调用有独立工作集；任一段失败时取消同任务其余在途段，等待全部退出后清理。不同视频／同文件并发任务不再共享 activeJobs。

## 3. 保留边界与删码

已知消费者：视频笔记／项目视频学习台共用 `useVideoNoteTranscription`，Notebook 使用模块的 transcribeAudio，导入模块直接使用共享 transcriptionService。模块公开服务及存量媒体结果仍有真实消费者，因此保留；全部媒体流程迁入公共结果属于 P5。

`onTranscriptionProgress` 全局订阅只有视频转录 hook 与命令桶导出两个消费者。它们已改为按调用传 onProgress，并移除旧订阅函数与导出；检索确认无代码消费者。原模块内两套独立 spawn/日志收集分支合并为 `runASRProcess`，日志缓冲有界，识别正文不写日志。

Windows 原输出目录为 source；现在 source 是本次独占的临时 WAV，因此不再覆盖用户源文件旁的同名 SRT。失败进程即使产生了 SRT 也不返回成功，避免残留或半截字幕被当作完成结果。SRT 数字正文不再被当作序号丢弃，已有语言和断句配置继续传递。

Whisper 的旧 languageProbability 含推断／默认值，duration 是字幕末尾时刻。公共 ASR 不把这两者包装成真实 confidence/durationMs；旧媒体流程仍取 sourceResult，P5 迁移消费者时再移除这个宿主内部边界。模型缺失明确返回 needs-assets，不让本次识别隐式下载模型。

## 4. 验证与限制

行为检查包含：文本修订、最终段不可改写、错任务与乱序、创建前／创建中取消、停止与取消竞争、尾帧排空、尾句超时、有界队列、真实 Node 子进程终止、非零退出、并发临时目录、SRT 数字与尾句、进度隔离、分段失败联动取消、旧语言配置与主进程启动分层。

原生 Swift 探针只做编译检查，本轮未再次启动麦克风；P1 真人结果保留。Whisper 完成／失败与文件格式链路使用受控进程夹具验证；实际进程取消使用真实 Node 子进程。没有下载或运行新的 Whisper 模型，没有将夹具测试称作真实模型质量评测。Windows 外部程序的真实执行及 Windows 原生能力仍需设备验收。

收尾检查结果：

| 检查                                               | 结果                                           |
| -------------------------------------------------- | ---------------------------------------------- |
| 公共 ASR 行为测试                                  | 14 项通过                                      |
| 桌面提供方、进程、任务、命令、队列、语言与分层测试 | 28 项通过                                      |
| @tau/asr TypeScript 构建                           | 通过                                           |
| 桌面本地工具链 tsc --noEmit                        | 通过                                           |
| 桌面 vite build --configLoader runner              | 渲染端、主进程、preload 生产构建通过           |
| Swift 6 原型 -warnings-as-errors 类型检查          | 通过，未启动麦克风                             |
| 文档检查与 git diff --check                        | 通过，文档 0 警告                              |
| 定向 ESLint                                        | 0 错误；媒体工具与旧队列清理中的空回调警告保留 |

桌面命令在 apps/desktop 工作目录使用其 node_modules/.bin 工具链；公共包使用自己的 tsconfig 和 Vitest 配置。生产构建不包含发行安装包签名／公证，不替代 P1 正式产品包验收。产品视觉验收按仓库约定由用户执行，不做截图走查。

## 5. 下一阶段

P3 装配 Mac 原生驱动、麦克风租约、插件注册和 WebSocket 桥接，接入 Seed 与聊天／搜索输入。Windows 保留待验证；完整首次模型下载与正式 Electron/helper 签名包验证仍从 P1 清单跟进。P4 的 AI 整理与 P5 的媒体结果迁移未开始。

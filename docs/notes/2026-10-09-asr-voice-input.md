# Tau 语音输入与 ASR 接入调研

调研日期：2026-10-08。本文覆盖桌面端 Electron、移动端 Tauri，以及未来 Web 场景中的麦克风语音输入。服务能力、价格与免费额度为当日公开资料快照；具体账户、地域、模型版本和订单规则仍需在接入时核对。

建议先建立独立的语音输入会话接口，让聊天、编辑器、搜索、快捷记录等业务共同消费，再在其下接入云端、系统原生和本地模型。首批用字节豆包流式语音识别 2.0 与阿里 Paraformer 验证跨服务商抽象，同时评测阿里最新推荐的 Qwen-Audio 3.1 流式模型。免费路线优先考虑 Apple 原生能力、按设备探测的 Android 原生能力，以及现有 Whisper 文件转写的复用。

**免费方案确实存在，但分为三种：系统能力免 API 调用费、本地模型免云端调用费、云服务在额度内免费。没有一种能同时保证所有平台、中文质量、离线运行和零接入成本。**

## 1 需求范围与首期边界

ASR 是自动语音识别，即把音频转换成文字。语音输入还包括麦克风权限、录音、会话状态、停止后等待尾句、取消、文本预览和写入目标等环节。统一层必须覆盖完整会话，才能避免每个业务各写一套录音逻辑。

| 场景                 | 需要的行为                       | 推荐首期处理                       |
| -------------------- | -------------------------------- | ---------------------------------- |
| 聊天输入             | 边说边预览，结束后成为可编辑草稿 | 停止后填入草稿，由用户点击发送     |
| 搜索输入             | 短句识别，保留修改机会           | 停止后更新搜索词，由用户确认检索   |
| 编辑器输入           | 固定文档和插入位置，支持撤销     | 预览在独立区域，停止后一次提交     |
| 快捷记录、待办       | 识别文本交给已有业务表单         | ASR 只产文本，业务负责结构化及保存 |
| 会议、视频、录音文件 | 长音频、时间戳、说话人分离       | 使用独立文件转写接口，后续复用引擎 |

首期以主动点击开始、点击停止的短时听写为目标。可先设产品录音上限为 120 秒，再按所选引擎的更短限制收紧；这是建议的产品边界，不是所有供应商的共同限制。暂不扩展到唤醒词、持续后台监听、全双工语音助手、TTS 或实时翻译。

语音输入与语音对话应分开：ASR 产出的文本仍经现有聊天流程发送；端到端语音模型同时处理理解、回答和合成，会改变对话运行时与工具执行方式，不适合作为首期听写的替代品。

## 2 项目现状与可复用资产

以下是当前代码事实，后文的新目录与接口均为建议方案。

| 已有能力         | 位置                                                                                                      | 对本次接入的意义                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 桌面文件转写命令 | `apps/desktop/src/commands/transcription.ts`                                                              | `transcribeAudio(audioPath, options)` 接收文件路径并返回完整结果；进度事件是消息，不是实时识别文本 |
| 本地转写服务     | `apps/desktop/src-electron/main/modules/transcription.ts`                                                 | macOS 走随包 `whisper-cli`，Windows 走预编译 faster-whisper；当前主路径没有 Python 后备            |
| 模型下载与管理   | `apps/desktop/src-electron/main/modules/model-downloader.ts`                                              | 可复用模型目录、下载与程序检测，不必重新建设模型管理体系                                           |
| 主进程模块管理   | `apps/desktop/src-electron/main/module-init/module-config.ts`、`apps/desktop/src/commands/module-init.ts` | transcription 已是 BACKGROUND；新能力也应按该方式注册，经 `ensureModule/withModule` 保证就绪       |
| 平台抽象         | `packages/platform/src/types.ts`                                                                          | 当前提供 Electron/Web 本机能力；没有现成的跨端语音接口                                             |
| 移动宿主         | `apps/mobile/package.json`、`apps/mobile/src-tauri/Cargo.toml`                                            | React + Tauri 2，具备 Rust/JNI 基础；原生 Speech 能力仍需插件或桥接                                |
| 桌面打包         | `apps/desktop/electron-builder.yml`                                                                       | Windows 使用 NSIS；macOS 已分发 whisper-cli；新增原生助手需处理签名、资源与权限                    |

因此，“已有转写”不等于“已有语音输入”。可先录制 WAV，再调用现有服务完成免费本地听写，但这只能在停止后返回文本。若要边说边出字，需要新增流式引擎或持续运行的本地识别进程。

现有 `modelSize/device/computeType` 是 Whisper 的实现参数，不应进入新的业务公共接口。已有视频、学习资料等消费者继续走文件转写，不为接入麦克风而强行迁移全部存量调用。

## 3 云端服务比较

用户提到的阿里“前文”在本文按“千问／通义语音识别”理解。接入时应区分服务商、产品、具体模型和协议；同一个服务商旗下模型的能力与计费也可能不同。

### 3.1 主要候选

| 候选                                    | 实时输入与输出                         | 接入方式与差异                                                         | 建议用途                   |
| --------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- | -------------------------- |
| 字节豆包流式语音识别 2.0                | 双向流式可边说边出字；另有按句返回模式 | OpenSpeech WebSocket；资源 ID 区分版本和计费；字节二进制帧协议独立封装 | 中文云端首批候选           |
| 阿里 Qwen-Audio 3.1 ASR Flash Streaming | 实时音频流与文本流                     | WebSocket；官方当前推荐，支持热词和 Prompt 上下文                      | 质量与术语增强候选         |
| 阿里 Qwen3 ASR Flash Realtime           | 实时识别                               | 会话式事件协议；与 Fun-ASR/Paraformer 的任务协议不同                   | 需要该模型特性时单独适配   |
| 阿里 Fun-ASR Realtime                   | 实时识别                               | WebSocket 任务协议，支持热词与时间戳                                   | 阿里另一条质量候选         |
| 阿里 Paraformer Realtime v2             | 实时识别                               | 与 Fun-ASR 相近的任务协议；有每月刷新免费额度                          | 低成本云端首批候选         |
| 腾讯实时语音识别大模型 2.0              | 实时识别                               | 应使用实时语音识别 V2 接口，鉴权和事件独立适配                         | 国内第三候选               |
| 讯飞语音听写及听写大模型 2.0            | 实时识别、结果动态修正                 | WebSocket；短音频接口最长 60 秒，必须处理替换旧结果                    | 短句、方言场景候选         |
| Azure Speech                            | 实时识别、文件识别                     | SDK/服务接口，有 F0 免费层；全球 Azure 与中国区域产品需分别核对        | 海外或已有 Azure 账户      |
| Google Cloud Speech-to-Text Chirp 3     | 支持 StreamingRecognize                | V2 API，语言和能力受地域及方法影响                                     | 海外多语种场景             |
| Deepgram Nova 系列                      | 支持实时识别                           | WebSocket，有试用赠金；部分附加功能单独计费                            | 海外流式候选               |
| OpenAI GPT-Live-Transcribe              | 实时文本增量与最终结果                 | Realtime transcription；WebSocket/WebRTC；独立转录会话                 | 海外已有 OpenAI 基础的场景 |

表中能力依据：[字节模型清单](https://docs.volcengine.com/docs/DoubaoVoice/model-list?lang=en)、[阿里选型概述](https://help.aliyun.com/zh/model-studio/asr-model)、[阿里实时识别指南](https://help.aliyun.com/zh/model-studio/real-time-speech-recognition-user-guide)、[腾讯实时 V2 接口](https://cloud.tencent.com/document/product/1093/131127)、[讯飞听写大模型 2.0](https://www.xfyun.cn/doc/spark/spark_zh_iat_new.html)、[Azure Speech 概述](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-to-text)、[Google Chirp 3](https://docs.cloud.google.com/speech-to-text/docs/models/chirp-3)、[Deepgram 产品与定价](https://deepgram.com/pricing)、[OpenAI 实时转录](https://developers.openai.com/api/docs/guides/realtime-transcription)。

不直接依据厂商的“准确率更高”宣传排序。中文夹英文、Tau 专有名词、口语停顿和真实麦克风噪声，需要使用同一组录音进行比较。

### 3.2 字节接入重点

新接入优先评估豆包流式语音识别 2.0。小时版资源 ID 为 `volc.seedasr.sauc.duration`，并发版为 `volc.seedasr.sauc.concurrent`；新版语音控制台采用 `X-Api-Key`，旧版 App ID/Access Token 鉴权仍有独立文档。不要把方舟文本模型配置直接视为已经开通语音产品。[字节一句话识别文档](https://docs.volcengine.com/docs/DoubaoVoice/unidirectional-streaming-automatic-speech-recognition-websocket?lang=zh)、[新版控制台快速入门](https://docs.volcengine.com/docs/DoubaoVoice/QuickStartNewConsole?lang=zh)。

边说边出字应评估双向流式优化端点 `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async`；官方产品动态说明其支持非流式二遍识别，即先返回中间文本，再精修最终句子。`bigmodel_nostream` 是另一种按句返回方式，不能仅因名称中有“streaming”就认定会逐字返回。[字节产品动态](https://www.volcengine.com/docs/6561/162929?lang=en)。

适配器负责二进制包头、序号、压缩、尾包和返回结果归约。模型版本、识别模式与当前语言支持共同决定能力，不能把文件识别的多语种支持直接套到双向流式模式上。

### 3.3 阿里接入重点

阿里当前推荐 `qwen-audio-3.1-asr-flash-streaming`，尤其适合需要热词、领域背景和多语种的实时识别。Paraformer 仍有明确的低成本价值，适合与字节先跑通统一层后作为质量基线。[阿里模型选型](https://help.aliyun.com/zh/model-studio/asr-model)。

至少区分两类协议：

1. **任务协议**：Qwen-Audio Streaming、Fun-ASR、Paraformer 使用 `run-task`、音频发送、`finish-task`、`task-finished` 等流程。
2. **会话协议**：Qwen3-ASR Realtime 使用会话配置、音频缓冲和转录事件，不能仅替换上述任务协议中的 model 字段。

时间戳也有差异：官方实时指南列明 Qwen3-ASR Flash Realtime 当前不返回时间戳；Qwen-Audio Streaming、Fun-ASR 和 Paraformer 可提供句级、字级信息。业务应查询能力，不应假设所有“阿里 ASR”都提供同一种结果。[阿里实时识别指南](https://help.aliyun.com/zh/model-studio/real-time-speech-recognition-user-guide)。

### 3.4 其他服务商的关键差异

讯飞动态修正可能追加文本，也可能替换此前若干结果，因此公共接口不能定义成“收到字符串就不断拼接”。传统听写文档还写明创建应用后默认每日 500 次调用，但这一额度不能迁移解释为听写大模型 2.0 的免费额度；大模型产品需要单独领取或购买。[讯飞传统听写接口](https://www.xfyun.cn/doc/asr/voicedictation/API.html)、[听写大模型 2.0](https://www.xfyun.cn/doc/spark/spark_zh_iat_new.html)。

OpenAI 当前实时转录推荐 `gpt-live-transcribe`。官方示例使用 24 kHz PCM，该模型不支持服务端 VAD/语义 VAD，需要客户端断句并提交音频缓冲；因此统一采集层不能把“所有 ASR 都是 16 kHz、都由服务端判断句尾”写死。录音文件的流式文本返回与持续麦克风实时输入也应区分。[OpenAI 实时转录指南](https://developers.openai.com/api/docs/guides/realtime-transcription)。

## 4 价格与免费额度

### 4.1 可比较的公开价格

以下均为原币种公开参考，不混入资源包折扣；阿里使用北京地域口径。按秒价格乘 3600 得到小时价格，只用于比较，实际账单还受取整、静音、声道、请求边界和附加功能影响。

| 服务或模型                                | 公开价格                                     | 小时换算            | 免费规则与边界                                                       |
| ----------------------------------------- | -------------------------------------------- | ------------------- | -------------------------------------------------------------------- |
| 字节豆包流式语音识别 2.0                  | 官网展示 1 元/小时                           | 1 元                | 新用户开通可获试用礼包，额度、有效期看控制台；不是每个新项目重复赠送 |
| 阿里 `paraformer-realtime-v2`             | 0.00024 元/秒                                | 0.864 元            | 10 小时/月，每月 1 日发放，有效期 1 个月                             |
| 阿里 `qwen3-asr-flash-realtime`           | 0.00033 元/秒                                | 1.188 元            | 10 小时试用，按公开条件有效期 90 天                                  |
| 阿里 `fun-asr-realtime`                   | 0.00033 元/秒                                | 1.188 元            | 10 小时试用，按公开条件有效期 90 天                                  |
| 阿里 `qwen-audio-3.0-asr-flash-streaming` | 0.00033 元/秒                                | 1.188 元            | 10 小时试用，按公开条件有效期 90 天                                  |
| 阿里 `qwen-audio-3.1-asr-flash-streaming` | 输入 6 元/百万 Token，输出 4.5 元/百万 Token | 需按实际 usage 测算 | 100 万 Token 试用，按公开条件有效期 90 天                            |
| 腾讯实时识别大模型 2.0                    | 1 元/小时，后付费日结                        | 1 元                | 该产品公开表中无免费额度；传统实时识别的额度另算                     |
| Azure Speech F0                           | 实时转录每月 5 小时免费                      | 额度内免费          | Standard/Custom 共享免费时长，不支持批量识别；还有 F0 并发限制       |
| OpenAI `gpt-live-transcribe`              | 0.017 美元/分钟                              | 1.02 美元           | 模型页标明 Free 层不支持                                             |

价格来源：[字节官网](https://www.volcengine.com/)、[字节试用规则](https://docs.volcengine.com/docs/DoubaoVoice/QuickStartNewConsole?lang=zh)、[阿里模型价格](https://help.aliyun.com/zh/model-studio/model-pricing)、[腾讯在线版计费](https://cloud.tencent.com/document/product/1093/35686)、[Azure Speech 定价](https://azure.microsoft.com/en-us/pricing/details/speech/)、[OpenAI 模型定价](https://developers.openai.com/api/docs/models/gpt-live-transcribe)。

阿里 3.1 的 Token 价格不能套用其他实时语音模型的每秒 Token 比例估算；先录取模型实际返回的输入、输出 usage。免费额度属于账户、资源或模型的权益，不是 Tau 每个最终用户独享的额度，需确认共享与抵扣规则。

Deepgram 当前提供新账户 200 美元试用赠金；Nova-3 单语流式公开活动价为 0.0048 美元/分钟，多语流式为 0.0058 美元/分钟，分别约 0.288、0.348 美元/小时。页面明确属于限时活动，热词等附加能力还可能另收费，不能当作永久报价。[Deepgram 定价](https://deepgram.com/pricing)。

### 4.2 Tau 的成本估算示例

假设每位活跃用户每天上传 5 分钟音频，每月使用 30 天，即每人 2.5 小时/月。下表忽略免费额度、阶梯价、取整与网关费用：

| 规模    | 月上传音频 | 单价 1 元/小时 | 单价 0.864 元/小时 | 单价 1.188 元/小时 |
| ------- | ---------- | -------------- | ------------------ | ------------------ |
| 个人    | 2.5 小时   | 2.5 元         | 2.16 元            | 2.97 元            |
| 100 人  | 250 小时   | 250 元         | 216 元             | 297 元             |
| 1000 人 | 2500 小时  | 2500 元        | 2160 元            | 2970 元            |

这是上述价格与假设用量的算术估算，不能作为真实账单保证。个人 BYOK 使用 Paraformer 时，假设获得完整月度额度，2.5 小时可落在 10 小时额度内；若 Tau 共用一个账户，该额度会被所有用户共同消耗。

应按真正发送给服务商的音频统计用量，包括静音和重试产生的额外上传；识别返回的文字长度不足以估算费用。应用预算限制可降低成本风险，但硬额度应由服务端或供应商账户限额兜住。

## 5 系统提供的免费能力

### 5.1 Apple 原生 Speech

Apple 已提供两条值得评估的路径：较新系统的 `SpeechAnalyzer + SpeechTranscriber`，以及旧系统的 `SFSpeechRecognizer`。前者的模型在设备上运行，可处理实时和长音频；语言模型由系统管理，可能需要首次联网下载，设备与语言支持必须运行时检查。[Apple SpeechAnalyzer 介绍](https://developer.apple.com/videos/play/wwdc2025/277/)、[SpeechAnalyzer API](https://developer.apple.com/documentation/speech/speechanalyzer)。

新路径的 `SpeechTranscriber.isAvailable` 从 iOS/macOS 26 起提供；还要检查设备支持、locale 与模型安装状态。对于不支持的设备或语言，可评估 `DictationTranscriber` 或旧接口；不要因系统版本满足就认定中文模型已经可用。[Apple 可用性接口](https://developer.apple.com/documentation/speech/speechtranscriber/isavailable)。

旧接口应先查询 `supportsOnDeviceRecognition`，本地策略下要求 `requiresOnDeviceRecognition = true`。普通识别路径不能统一宣称离线；用户选择“仅本地”后，禁止静默改用远端识别。[Apple 本地识别能力](https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportsondevicerecognition)、[本地识别要求](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition)。

接入 Tau 的工程判断：macOS 可通过签名 Swift 助手或原生模块桥接，助手以结构化消息回传结果；iOS 使用 Tauri 原生插件/桥接。免云 API 调用费，但仍有桥接、麦克风与语音授权、模型准备及打包验证成本。

### 5.2 Android SpeechRecognizer

Android 提供 `SpeechRecognizer`；API 31 起可通过 `isOnDeviceRecognitionAvailable()` 和 `createOnDeviceSpeechRecognizer()` 使用可用的设备内识别服务。较新 API 还支持查询语言能力和触发模型下载。需要 `RECORD_AUDIO` 权限，按平台约定在主线程使用，并在结束后 `destroy()`。[Android 官方接口](https://developer.android.com/reference/android/speech/SpeechRecognizer)。

它是系统服务接口，实际引擎由设备上的识别服务提供。国内不同 ROM、服务安装状态和中文离线包可能产生差异，因此只能在探测成功后开放该选项。普通 `createSpeechRecognizer()` 可能上传音频到远端；官方也说明这条通用接口不面向持续不停的识别。

对 Tau 建议：适合作为短句、按键听写的免费增强；通过 Tauri Android 插件封装，不假设 WebView 的 JavaScript SpeechRecognition 就能调用该原生服务。无引擎或离线语言缺失时给出明确状态。

### 5.3 Windows 原生能力与系统听写

需要区分三种能力：

| 能力                                | 能否作为 Tau 引擎                        | 主要限制                                                                       |
| ----------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| Windows 系统语音输入，例如 Win+H    | 用户可在文本框自行使用；不作为会话适配器 | 属于系统输入 UI，无法据此取得 Tau 需要的统一会话事件；该语音输入需要联网       |
| `Windows.Media.SpeechRecognition`   | 可以经原生桥接评估                       | 旧识别接口；自由听写路径涉及在线语音设置，不能把有限语法识别等同于离线自由听写 |
| Windows AI `SpeechRecognitionModel` | 可以作为较新系统的本地候选               | Windows 11 24H2+、WinAppSDK 1.7.1+；支持 NPU 或 CPU，CPU 设备需准备模型        |

依据：[微软系统语音输入](https://support.microsoft.com/en-us/accessibility/windows/use-voice-typing-to-talk-instead-of-type-on-your-pc)、[旧语音识别接口](https://learn.microsoft.com/en-us/windows/uwp/ui-input/speech-recognition)、[Windows AI Speech Recognition](https://learn.microsoft.com/en-us/windows/ai/apis/speech-recognition)。

Windows AI 当前已不局限于 Copilot+ PC：官方列出 CPU 支持和模型按需下载，也指出 CPU 性能影响实时体验。其页面列有 MSIX 与 `systemAIModels` 清单要求，部分说明使用“imaging APIs”措辞；Tau 当前是 NSIS 分发，须通过原生试验核对 Speech 的实际部署要求，不能直接认定现有安装包可用。中文支持也应在所用 SDK/模型上验证。

建议先保留系统听写的用户使用说明，Windows 内置引擎放到后续原生试验。不要以模拟 Win+H 热键、剪贴板抓取或跨应用自动输入来代替 ASR 抽象。

### 5.4 浏览器 Web Speech API

`SpeechRecognition/webkitSpeechRecognition` 可用于部分浏览器，但支持程度有限；普通路径可能把音频发送到远端。新的 `processLocally`、`available()`、`install()` 提供本地识别与语言包能力，仍需要按浏览器、语言和版本检测。[MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)、[MDN 本地识别流程](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)。

**Tau 桌面端不能直接沿用“Chrome 能识别，所以 Electron 也能”的判断。** 当前 `apps/desktop/package.json` 指定 Electron 43.1.1。Electron 官方 PR 52955 为本地 Speech API 添加的是返回 unavailable/安装失败的桩，以修复渲染进程崩溃；43 系列回移发布于 43.5.0。这说明该修复不等于提供了 Chrome 的本地识别引擎。[Electron 官方修复记录](https://releases.electronjs.org/pr/52955)。

据此建议：不把 Web Speech 作为 Tau 桌面默认路线；当前版本也不应在启动时盲目调用上述本地探测 API。若未来单独做浏览器增强，先处理 Electron 版本边界，再通过同一个语音接口适配。

## 6 本地开源模型方案

| 方案                                    | 优点                                       | 接入与性能成本                                                      | 对 Tau 的建议                        |
| --------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------ |
| 现有 whisper.cpp / faster-whisper       | 已有桌面集成与模型管理；本地推理免云调用费 | 当前是文件转写；实时分块涉及模型复用、句尾稳定、去重与 CPU/GPU 占用 | 先复用“停止后转写”免费模式           |
| sherpa-onnx                             | 支持离线及流式识别、多平台原生接入         | 需要选择适合中文的模型、原生打包和模型分发；模型许可分别检查        | 跨端离线流式首选试验路线             |
| FunASR / Paraformer / SenseVoice 等组合 | 可组合识别、VAD、标点等能力                | 工具包与各模型的流式能力不同；Python/服务器路径会增加部署成本       | 适合自建 ASR 服务或离线验证          |
| Qwen3-ASR 开源模型                      | 0.6B/1.7B 模型，提供流式与离线推理工具     | 官方常见路径涉及 Python/vLLM；端侧量化、内存和速度需另外评估        | 自托管质量候选，首期不默认随应用分发 |

依据：[whisper.cpp](https://github.com/ggml-org/whisper.cpp)、[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)、[FunASR](https://github.com/modelscope/FunASR)、[Qwen3-ASR](https://github.com/QwenLM/Qwen3-ASR)。

Whisper 的麦克风示例采用连续窗口转写，官方将其描述为简单示例；不能据此认为当前 `whisper-cli` 文件调用天然具备生产可用的增量识别。若每几百毫秒启动一次进程，会重复加载模型、增加延迟与资源消耗。[whisper.cpp 实时示例](https://github.com/ggml-org/whisper.cpp#real-time-audio-input-example)。

“开源免费”指不按云端调用收费，不代表无成本。模型下载占用磁盘，推理占用算力、内存和电池，自托管还会有服务器成本。代码许可证与具体模型权重许可应分别核对，不能只看推理框架的许可证。

## 7 统一抽象层设计建议

### 7.1 分层与职责

推荐新增独立的 `@tau/speech`，以宿主注入方式装配实现，公共入口保持 TypeScript 平台中立。

| 层                   | 职责                                                   | 不承担的职责                    |
| -------------------- | ------------------------------------------------------ | ------------------------------- |
| 业务输入目标         | 聊天草稿、搜索词、编辑器插入和撤销                     | 不管理麦克风、服务商 WS、Key    |
| `SpeechInputService` | 探测能力、选择配置、会话生命周期、统一事件             | 不直接写正文或自动发送消息      |
| 采集与会话协调       | 录音、格式协商、背压、停止冲洗、结果归约               | 不解析业务文档结构              |
| ASR 适配器           | 供应商协议、鉴权、模型参数和文本修正映射               | 不 import features 或业务 store |
| 宿主运行时           | Electron IPC、Tauri 插件、原生识别、本地进程、安全存储 | 不把长期密钥交给公共 UI         |

数据流有两条：

1. 云端或本地 PCM 引擎：业务调用会话 → 采集麦克风 → 适配器发送音频 → 归约结果 → 业务预览与提交。
2. 系统管理麦克风的引擎：业务调用会话 → 原生识别服务自行采集 → 归约结果 → 同一业务预览与提交。

这两条都使用同一个业务接口，但内部音频输入能力不同。不要让业务先拿到 MediaStream 再传给所有服务商，也不要要求 Android 原生识别实现一个实际不存在的 `pushAudio()`。

`@tau/platform` 仍负责麦克风权限、设备与系统桥接等本机能力；云端服务策略和会话归约放在 `@tau/speech`。移动端当前并未统一依赖 `@tau/platform`，可先直接注入 Tauri 宿主实现，不为语音功能强行迁移整个移动平台层。

### 7.2 建议的业务公共接口

下面是接口草案，用于明确语义，不是已经实现的代码。`engineId` 表示完整配置身份，应绑定服务商、模型、地域及协议；业务通常使用设置中的默认值，只有设置和测试入口需要指定引擎。

```typescript
type SpeechPrivacy = "local-only" | "cloud-allowed";

type SpeechState =
  "idle" | "starting" | "recording" | "finishing" | "finished" | "cancelled" | "failed";

type SpeechErrorCode =
  | "unsupported"
  | "permission-denied"
  | "device-unavailable"
  | "model-unavailable"
  | "configuration-invalid"
  | "authentication-failed"
  | "quota-exceeded"
  | "network-failed"
  | "timeout"
  | "busy"
  | "audio-invalid"
  | "provider-failed";

interface SpeechRequest {
  engineId?: string;
  locale: string;
  privacy: SpeechPrivacy;
  hotwords?: readonly string[];
  contextHint?: string;
  maxDurationMs: number;
}

interface SpeechCapabilities {
  interimResults: boolean;
  wordTimestamps: boolean;
  hints: "none" | "hotwords" | "context" | "both";
  maxDurationMs?: number;
}

interface SpeechAvailability {
  status: "ready" | "needs-permission" | "needs-model" | "needs-config" | "unsupported";
  engineId: string;
  dataRoute: "device" | "cloud" | "unknown";
  capabilities: SpeechCapabilities;
  reason?: string;
}

interface SpeechWord {
  text: string;
  startMs: number;
  endMs: number;
}

interface SpeechSegment {
  id: string;
  text: string;
  isFinal: boolean;
  startMs?: number;
  endMs?: number;
  words?: readonly SpeechWord[];
}

interface SpeechTranscript {
  revision: number;
  text: string;
  segments: readonly SpeechSegment[];
  detectedLocale?: string;
  audioDurationMs?: number;
}

type SpeechEventPayload =
  | { type: "state"; state: SpeechState }
  | { type: "transcript"; transcript: SpeechTranscript }
  | { type: "error"; code: SpeechErrorCode; retryable: boolean }
  | { type: "ended"; reason: "completed" | "cancelled" | "failed" };

type SpeechEvent = SpeechEventPayload & {
  sessionId: string;
  seq: number;
};

interface SpeechInputSession {
  readonly id: string;
  start(): Promise<void>;
  stop(): Promise<SpeechTranscript>;
  cancel(): Promise<void>;
  dispose(): Promise<void>;
}

interface SpeechInputService {
  probe(request: SpeechRequest): Promise<SpeechAvailability>;
  prepare(request: SpeechRequest): Promise<SpeechAvailability>;
  createSession(
    request: SpeechRequest,
    onEvent: (event: SpeechEvent) => void
  ): Promise<SpeechInputSession>;
}
```

`probe()` 只探测，不弹权限、不下载、不录音；`prepare()` 由明确的用户操作触发权限或模型准备。`createSession()` 固定配置并先绑定监听，`start()` 才采集。这样可以避免首个结果先于业务订阅到达。

能力按“当前配置 + 设备 + locale + 模式”判断，而不是在服务商枚举上写一个固定布尔值。运行时不能确定的数据路径使用 unknown；`local-only` 只接受已经证实为 device 的引擎，未知状态不按本地放行。

热词、上下文等不支持时，应在创建前明确返回能力不匹配，由产品选择提示或换引擎，不静默吞掉参数。缺失的时间戳、语言检测或置信度保持缺失，不编造 0、1 或固定中文。

### 7.3 会话与结果的约束

1. **停止与取消不同**：stop 停止收音、发送缓冲尾帧及结束信号，再等待最终文本；cancel 立即停止并丢弃待确认结果。完成后都释放麦克风、WS、定时器与临时文件。
2. **停止有截止时间**：尾句等待超时返回 timeout 和已知草稿，由用户决定是否保留；不能把中间结果伪装为成功完成。连续调用 stop 共用同一在途任务。
3. **取消有明确仲裁点**：完成尚未确认前 cancel 可以赢过 stop；一旦取消，stop 应拒绝，业务不得提交。已完成后 cancel 不撤回已交付结果，撤销由业务负责。
4. **文本是可替换快照**：适配器归约增量、累计结果、讯飞替换区间和二遍修正，生成按音频顺序排列的当前完整文本。业务按 revision 替换预览，不能盲目拼接。
5. **最终状态只出现一次**：每会话 seq 单调递增，ended 只发送一次，之后不再发布文本。服务商无法保证稳定句子时，适配器延后标记 isFinal。
6. **错误有统一口径**：无麦克风、拒绝授权、缺模型、Key 无效、额度不足和网络中断分别处理。no-speech 可视为正常结束且文本为空，不统一映射成服务失败。
7. **一个会话固定引擎**：录音中改设置只影响下一次会话；切换引擎需要结束当前会话，不能拿旧分句去拼接新服务商结果。
8. **录音租约按应用协调**：桌面多窗口同时启动需由主进程仲裁，冲突返回 busy。原生识别和 Web 录音不可同时竞争同一麦克风。

首期短会话使用完整文本快照最简单。若后续扩展到小时级会议，再引入分段补丁与持久转写任务，避免对无限增长全文高频复制；不要首期就建设通用音视频任务平台。

### 7.4 内部适配器与音频协商

内部将驱动分为“接收 PCM”和“自行管理麦克风”两类，使用判别联合或分开的驱动接口。前者协商采样率、声道、位深和发送节奏，后者提供原生开始、停止、取消及结果事件，两者都映射成统一会话。

Electron/Web 的 PCM 路线可用 `getUserMedia + AudioWorklet` 获取持续音频，再重采样为引擎所需 PCM16 单声道。建议主路径使用 PCM，供应商适配器再决定二进制、压缩或 Base64 封装。不要把 MediaRecorder 返回的 WebM/Opus Blob 标记成 PCM 或 WAV 后直接上传。

音频参数须由适配器协商：国内候选常用 16 kHz，其他模型可能需要 24 kHz；设备实际采样率可能是 44.1/48 kHz，不能把录音约束当作已经完成重采样。分包周期也由驱动决定，不能为所有厂商固定成同一个值。

采集和发送队列设上限，按字节、时长统计，慢网时显式失败或提示，不能无限堆积。停止顺序为：停止新增采集 → 冲洗重采样器与尾帧 → 排空发送队列 → 发送结束标志 → 等待最终事件 → 释放资源。PCM 跨进程传输避免 JSON 数字数组；先复用可验证的 IPC，再根据测量决定是否引入专用 MessagePort。

## 8 凭据与隐私策略

建议首期支持用户自带密钥 BYOK，同时允许系统原生和本地模型完全不配置云端账户。ASR 配置与聊天模型配置分开，保存 `engineId/provider/model/region/protocol/credentialRef`；二者可共享安全存储机制，但不能假设文本模型 Key 的语音产品权限。

| 方式               | 凭据放置                                              | 成本与适用场景                                              |
| ------------------ | ----------------------------------------------------- | ----------------------------------------------------------- |
| BYOK 原生端直连    | Electron 主进程或移动原生安全存储；渲染层只读配置摘要 | 无 Tau 中转费用，用户承担供应商费用和账户管理               |
| Tau 托管网关       | 服务端持有运营 Key，客户端经自己的认证连接            | 上手简单，可统一额度和风控；增加运营成本                    |
| 供应商短期凭据     | 服务端换取短期、限权凭据，端上临时使用                | 仅在供应商、具体产品支持时使用；不能虚构各家通用 token 接口 |
| 系统原生／本地模型 | 无云端 Key                                            | 设备能力和模型准备成本由宿主承担                            |

BYOK 并不意味着客户端密钥绝对不可提取，但应避免出现在前端配置、localStorage、日志、URL、错误上报或同步备份中。Electron 可评估 safeStorage/系统钥匙串，移动端使用 Keychain/Keystore；须核对现有配置存储的安全属性，不能直接沿用明文设置文件。

纯浏览器不应内嵌 Tau 的长期 Key。浏览器 WebSocket 无法像 Node `ws` 那样随意添加鉴权头，且供应商鉴权方式各异，托管场景应使用网关或该供应商实际支持的短期凭据。[浏览器 WebSocket 构造接口](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket)。

默认不保存原始音频，结束后清理临时文件。上下文增强只发送用户选定的术语或短背景，不自动上传整篇笔记、聊天记录或文档标题。诊断仅记录会话 ID、引擎版本、时长、延迟、错误码及必要 request ID，不记录转写正文和音频内容。

降级顺序先过滤隐私策略，再选可用引擎。仅本地模式失败时可以切换另一个本地引擎，不能静默上传云端；即便允许云端，也应在会话开始前明确选定数据去向。首期不做跨供应商自动重放音频，避免重复计费和结果重复。

## 9 与现有业务及架构接线

建议实现位置如下，均为后续新增或调整位置：

| 位置                                                   | 建议职责                                                  |
| ------------------------------------------------------ | --------------------------------------------------------- |
| `packages/speech/`                                     | 公共契约、会话状态与文本归约、无平台依赖的策略            |
| `apps/desktop/src/services/speechInput.ts`             | 桌面业务服务入口，注入宿主实现                            |
| `apps/desktop/src-electron/main/modules/speech-input/` | BACKGROUND 模块、WS 适配器、租约、凭据、本地/原生引擎桥接 |
| `apps/desktop/src/commands/speech-input.ts`            | 窄 IPC 命令与按会话过滤的事件订阅                         |
| `apps/desktop/src/features/speech-input/`              | 录音预览与配置组件，不持有供应商协议                      |
| `apps/mobile/src/services/speechInput.ts`              | 注入移动实现，保持相同业务接口                            |
| `apps/mobile/src-tauri/` 的语音插件或模块              | 原生录音、SpeechRecognizer/Speech 桥接、网络和安全存储    |

公共包不 import Electron、Tauri、features 或平台私有路径；实际依赖由宿主装配。`packages/ui` 只提供按钮、状态展示和浮层等通用原语，不反向依赖语音业务。

桌面录音浮层由壳层装配，通过 `useOverlayDismiss` 参与 Esc 仲裁；不注册 dialog/drawer 类型 Page，不监听自己的全局 Esc。移动端采用已有 BottomSheet 等通用容器，自建浮层接入 `useSheetBackDismiss`，返回关闭同时取消录音并处理草稿。

Page 的 Activity 保活意味着“未卸载”不等于“仍可录音和写入”。切页隐藏、切库、目标销毁或变只读时必须取消绑定的输入会话。由 AppShell 稳定持有应用服务，业务实例持有 session，关闭窗口时主进程兜底释放资源。

聊天首期在停止后将文本交给输入框已有草稿更新逻辑，不自动发送。搜索更新搜索词，不因每个中间结果触发检索。编辑器固定发起时的文档和选区，并通过现有异步提交守卫验证目标仍有效；若录音期间用户修改了目标范围，应拒绝覆盖或保留为待确认草稿，不能用识别完成时的新光标位置猜测插入点。

ASR 不直接写数据库。编辑器使用现有文档绑定与提交入口一次写入，形成可撤销动作；不逐个中间结果写 Y.Doc 或操作日志。LLM 润色属于可选后处理，保留原转写，并经现有 pi 一次性生成入口执行。

现有 03 指南规定新增 LLM/代理入口统一走 pi；新增实时 ASR 协议需在实施前于 DECISIONS 明确其与该规则的边界，并同步 03 的主进程、服务层和壳层行为说明。本调研不代表已经变更架构裁决，也不修改 Page 框架或退役音频笔记边界。

## 10 选型建议与实施顺序

### 10.1 按目标选择

| 优先目标             | 推荐路线                                       | 代价与取舍                                 |
| -------------------- | ---------------------------------------------- | ------------------------------------------ |
| 快速提供中文实时输入 | 字节 2.0 或阿里实时模型，通过 WebSocket 接入   | 需要云端配置、网络和调用费用               |
| 个人低频免费使用     | 阿里 Paraformer 月度额度；Apple 原生可用时优先 | 云端额度有账户边界；系统能力存在设备差异   |
| 无账户、隐私优先     | 系统本地识别；桌面复用 Whisper 停止后转写      | 初次模型下载和本机性能限制，部分路线不实时 |
| 全平台统一离线体验   | sherpa-onnx + 经评测的中文流式模型             | 原生开发、模型分发与端侧性能验证成本更高   |
| 面向海外或多语种     | Azure、Google、Deepgram、OpenAI 对比评测       | 网络地域、费用和语言能力需针对目标用户验证 |

建议产品保留三种明确模式：“云端实时”“系统本地”“本地录音后转写”。不把后两者伪装成具有相同逐字速度的引擎，也不为了免费而强制用户只能使用系统当前不可用的能力。

### 10.2 最小推进步骤

1. **确定契约并做双供应商验证**：实现公共会话语义与假驱动，接字节 2.0 和阿里 Paraformer，验证停止尾句、修正与取消。用同一录音评测 Qwen-Audio 3.1，再决定中文默认模型。
2. **打通一个业务并验证复用**：先接聊天草稿，随后接搜索输入。第二个业务无需新增服务商逻辑才算统一接口成立。加入跨窗口麦克风租约与切页、切库取消。
3. **上线可用的免费模式**：桌面录音后调用现有 Whisper 文件转写；Apple 原生先做小范围验证；Android 探测成功后开放原生短句听写。
4. **按需求增加能力**：评估 Windows AI 原生桥接、离线流式 sherpa-onnx、托管网关和其他服务商。文件转写可共享底层引擎，但保持任务接口独立。

此顺序首先证明抽象层能容纳不同协议，再逐步降低用户配置门槛；无需首期把所有供应商、所有系统和会议转写同时做完。

## 11 验证计划与待确认事项

### 11.1 统一评测

建议整理 30–60 分钟获得授权的真实中文语料，覆盖短句、长停顿、中英混说、Tau/数据库/模型名等术语、数字日期、轻度口音、风扇与键盘噪声、纯静音。每个候选使用相同音频、采样设置和热词条件，并记录模型版本与地域。

| 指标             | 测量方式                                   | 判断用途                               |
| ---------------- | ------------------------------------------ | -------------------------------------- |
| 中文字错误率 CER | 与人工转写比较，分别看原文和标点规范化结果 | 避免只凭单个样例判断准确率             |
| 首字延迟         | 从实际语音开始到首个非空中间结果           | 衡量“边说边出字”；不实时的引擎记不适用 |
| 尾句延迟         | 从用户停止收音到最终结果                   | 判断停止后等待是否可接受               |
| 最终结果成功率   | 成功结束且完整保留尾句的会话比例           | 识别网络和状态机问题                   |
| 文本修正次数     | 中间文本被替换的频度和范围                 | 判断预览是否抖动及归约是否正确         |
| 本地资源占用     | 冷启动、峰值内存、CPU、耗电和实时因子      | 决定是否适合作为默认本地引擎           |
| 单小时实际费用   | 按 usage 与供应商账单对账                  | 覆盖静音、重试、取整及附加项           |

可先以首字 p95 小于 1 秒、尾句 p95 小于 2 秒作为短句听写体验目标，再根据真实网络和语料调整；这些是建议验收目标，不是任何供应商的承诺。记录失败样例，最终模型按质量、延迟、费用和平台覆盖综合选择。

### 11.2 行为与结构检查

必须验证：授权拒绝后重试、设备拔出、模型缺失、Key/地域不匹配、额度耗尽、启动中取消、连续 stop、stop 与 cancel 竞争、无语音、尾帧冲洗、重复与乱序事件、服务端断线、文本修正、切页切库、输入目标变化和窗口销毁。

适配器契约测试应确保最终状态唯一、取消后无写入、旧会话不认领新会话事件、时间戳统一毫秒、缺失字段不造假、网络慢时内存有界。再分别做 TypeScript 检查、模块分层检查、相关行为测试、桌面打包和移动原生构建。视觉验收按项目约定由用户完成。

### 11.3 实施前需要核对

- 首期优先桌面还是移动，以及目标最低系统版本；这决定原生免费能力的实际覆盖率。
- 采用 BYOK 还是 Tau 托管；这决定凭据、额度与网络架构。
- Apple 中文 locale、Android 目标 ROM、Windows AI 中文模型及 NSIS/MSIX 部署边界的真机可用性。
- 字节 2.0 当前账户试用礼包、所选双向模式的语言与音频参数、并发上限；阿里北京账户的月度额度抵扣范围。
- 厂商服务的数据保留、训练使用与地域条款。若对外提供托管服务，再按实际商业模式核对平台要求。

本次产出是调研与接口设计建议，未使用账户密钥调用识别服务，也未产生真实准确率、延迟或兼容性测试结果。

## 12 仓库参考

- [桌面架构实现指南](/docs/architecture/desktop.md)
- `桌面架构裁决`
- [平台与 RPC 架构](/docs/architecture/platform-rpc.md)
- [编辑器异步写入与提交守卫异步写入守卫（原 editor-refactor/13，已删）
- [移动页面栈与返回策略](/docs/architecture/mobile.md)
- [现有文件转写命令](../../apps/desktop/src/commands/transcription.ts)
- [现有本地转写服务](../../apps/desktop/src-electron/main/modules/transcription.ts)
- [桌面打包配置](../../apps/desktop/electron-builder.yml)

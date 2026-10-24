# 桌面语音输入与统一 ASR

状态：宿主能力及 SDK／Seed 发行已完成；新增功能入口已按用户要求撤回，位置待决定。

Windows 实机结果与本轮裁决见 [Windows 验证](./windows-validation.md)：保留 NSIS，本轮不开放 Windows 原生；Whisper 显式 CPU 文件转录通过，CUDA r245.2 崩溃与 base 尾部重复为已接受限制，Seed 云端因无凭据未验证。本轮检查完成并已合并、推送 master，未发布客户端。
创建日期：2026-10-24。
目标：在桌面提供系统原生语音输入、Seed 插件识别与可选 AI 整理，并让现有 Whisper 和媒体转录共享统一识别契约。

本文是本任务唯一方案与进度入口，自含需求、任务内决策、接口、实施阶段与验收。用户已授权开展 P1，优先当前 Mac 的中文、实时结果、停止尾句与首次模型准备；Windows 在环境允许时验证，限制先记录商议。下文接口为拟议契约，原型验证不表示产品或 SDK 已发布。

## 1. 范围与任务内决策

### 1.1 用户已确认

- 最新裁决：移除所有新增聊天／搜索／设置入口及壳层挂载，只保留底层能力；入口位置由用户另行决定。本条替代此前关于接入位置的安排。

- 优先桌面端，先验证 macOS 与 Windows 原生识别；P3 同步补齐移动端插件宿主与语音输入接线。
- 用户已认可当前 Mac 原生路线，默认加入 VAD；P2 已完成，当前授权继续 P3，Windows 保留待验证。
- P3 的 Seed 插件创建独立仓库 tau-plugin-asr-seed；协议不得进入应用业务代码。同步更新 SDK、统一模板和文档，移动宿主也要支持该插件。
- WebSocket 尽量对齐标准：同步返回连接，标准事件与状态、send/close 语义不变，仅扩展鉴权头与生命周期；背压由宿主负责。SDK、独立 Seed、模板、桌面与移动宿主一起调整。
- 内置系统能力、插件识别共享底层契约；语音输入与媒体转录分别编排；AI 整理是识别后的独立步骤。
- 首个云端插件接 Seed ASR；不同时铺开多个厂商。
- AI 整理复用现有模型配置与 LLM 运行时，不另建模型账号体系。
- Windows 不强行兼容各个版本。遇到版本、打包、模型、语言或运行条件问题，先提供复现和可选方案，再与用户商议；不自行扩张旧版本兼容范围。

### 1.2 本文采用的设计建议

- 技术命名统一为 **ASR**（Automatic Speech Recognition，自动语音识别）。STT（Speech-to-Text，语音转文字）在本任务中指相同核心能力，不另建 `stt` 接口、配置和注册表。ASR 与 STT 都不天然意味着实时或文件模式。
- 公共契约建议放 `@tau/asr`，插件入口为 `context.asr`，类型以 `ASR` 为前缀；业务编排称 `speechInput` 和 `mediaTranscription`。用户界面使用“语音输入”“转录”“整理文本”。这些名称不是当前已存在的包或接口。
- **现有 Whisper 纳入统一体系，作为内置本地文件识别提供方**。复用程序、模型管理及转录实现，不要求插件化，不把本次任务扩展成 Whisper 实时引擎重写。
- 用户选择 Whisper 听写时，短时录音先落临时音频，停止后按文件模式识别；界面明确“停止后转录”。仅在用户选择该模式且模型可用时使用，不静默下载或切换云端。
- 产品目标为“内置系统识别，不装插件、不配 API Key”；不能承诺任何设备都无需系统模型或语言资源下载。探测和准备是不同操作。
- 首期不包含唤醒词、持续后台监听、系统范围的跨应用输入、实时语音对话、翻译、云端托管计费或会议记录产品。

## 2. 当前实现与复用边界

| 当前事实                                                                 | 实施影响                                                                      |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `transcribeAudio(audioPath, options)` 返回 `text`、分段及时间戳          | 已有音频到文字能力，视频先抽取音轨；不必重建识别引擎                          |
| macOS 使用随包 whisper-cli，Windows 使用检测到的预编译程序；模型仍需准备 | 纳入内置文件提供方，能力与准备状态按实际环境报告                              |
| 当前主路径等待进程结束后读取 SRT；进度事件只有消息                       | 当前没有音频流输入和识别文本流输出；长音频分段也不是实时会话                  |
| 已有 `transcriptionOptimization` 和 `piStreamText`                       | 可复用模型选择与运行时；现有字幕断句提示词、时间轴解析与听写整理分开          |
| TTS 提供方为 `register → create(config, modelId) → instance`             | 沿用注册、配置快照、停用回收模式；ASR 另外定义实时会话                        |
| 插件有原生 HTTP(S) fetch 桥接，没有统一 WebSocket API                    | Seed 接入需要宿主 WebSocket 传输；普通浏览器 WebSocket 不能任意添加握手鉴权头 |
| Windows 安装目标为 NSIS                                                  | 原生验证必须覆盖真实安装包身份，开发环境成功不等于产品可用                    |

代码定位：[文件命令](/apps/desktop/src/commands/transcription.ts)、[转录实现](/apps/desktop/src-electron/main/modules/transcription.ts)、[模型管理](/apps/desktop/src-electron/main/modules/model-downloader.ts)、[视频消费者](/apps/desktop/src/components/VideoNotePanel/useVideoNoteTranscription.ts)、[导入消费者](/apps/desktop/src-electron/main/modules/markitdown.ts)、[学习资料消费者](/apps/desktop/src-electron/main/modules/vibe-learning-transcription.ts)、[字幕优化](/apps/desktop/src/hooks/useTranscriptionOptimization.ts)、[TTS 契约](/packages/plugins/src/tts.ts)、[插件契约](/packages/plugins/src/contract.ts)、[安装配置](/apps/desktop/electron-builder.yml)。

以上消费者是已知起点，迁移前必须重新 `rg` 清点全部直接调用、IPC、测试与模型配置，不能将此清单当作穷尽结果。

## 3. 分层与职责

| 层           | 职责                                           | 禁止承担                          |
| ------------ | ---------------------------------------------- | --------------------------------- |
| 业务入口     | 聊天草稿、搜索词、编辑器插入、媒体笔记         | 厂商音频协议与鉴权                |
| 语音输入服务 | 录音租约、预览、停止、取消、整理、目标提交守卫 | 媒体任务队列、字幕持久化          |
| 媒体转录服务 | 音轨提取、文件队列、分段、字幕及记录保存       | 输入焦点、麦克风交互              |
| ASR 公共层   | 文件任务、实时会话、结果归约、统一错误         | 页面、数据库、Electron 依赖       |
| 内置实现     | 系统原生桥接、Whisper 引擎与模型目录           | 强制经插件上下文才能调用          |
| 插件实现     | Seed 配置、封包、结束标记、返回结果转换        | 控制输入框、绕过宿主管理麦克风    |
| 文本整理     | 经现有 pi 运行时处理最终文本                   | 改写 ASR 原始时间戳或充当识别引擎 |

宿主组合内置提供方和插件注册结果；内置能力直接消费公共契约，宿主核心功能之间不经插件扩展点。插件停用、切库、窗口销毁时，宿主取消相关任务并拒绝迟到结果。

建议落点：`packages/asr/` 放契约与归约器，`packages/plugins/src/asr.ts` 放插件注册面；桌面主进程 `modules/asr/` 管原生桥接、租约和任务，渲染侧 `commands/asr.ts` 与 `services/speechInput.ts` 提供窄入口，`features/speech-input/` 提供 UI。这些路径均为计划，不要求在实现前创建空模块。

新主进程模块使用 BACKGROUND，经 `ensureModule/withModule` 保证就绪。浮层由壳层装配并接 `useOverlayDismiss`；Activity 隐藏、切库、目标销毁或变只读时取消输入会话，不能等卸载才停止录音。实际修改壳层或数据协议时同步桌面架构文档。

## 4. ASR 接口设计

### 4.1 两个入口覆盖四种组合

| 输入     | 输出     | API 与行为                                    |
| -------- | -------- | --------------------------------------------- |
| 完整文件 | 完整结果 | `transcribeFile()` 的 `result`                |
| 完整文件 | 渐进文字 | 同一入口接收分段事件，最终仍等待 `result`     |
| 持续音频 | 完整结果 | `openStream()`，结束输入后等待 `result`       |
| 持续音频 | 渐进文字 | 同一会话持续接收分段事件，最终仍等待 `result` |

“文件输入”表示源已确定，不表示一次读取全部字节。“流式输出”表示识别文本可提前交付，不包括上传进度或百分比。允许提供方只实现文件或实时能力，不用空实现宣称支持。云端异步提交与轮询由文件适配器处理；持久队列、恢复及重试策略属于媒体任务层，基础 ASRTask 不承诺进程退出后恢复。

### 4.2 公共结果与事件

```ts
interface ASRWord {
  text: string;
  startMs: number;
  endMs: number;
}

interface ASRSegment {
  id: string;
  text: string;
  final: boolean;
  startMs?: number;
  endMs?: number;
  speakerId?: string;
}

interface ASRTranscript {
  text: string;
  words?: readonly ASRWord[];
  segments?: readonly ASRSegment[];
  language?: string;
  durationMs?: number;
}

type ASREvent = {
  taskId: string;
  seq: number;
} & (
  | {
      type: "segments";
      baseRevision: number;
      revision: number;
      startIndex: number;
      deleteCount: number;
      segments: readonly ASRSegment[];
    }
  | {
      type: "progress";
      stage: "uploading" | "recognizing";
      fraction?: number;
      message?: string;
    }
);
```

事件采用有序分段替换：从 `startIndex` 删除 `deleteCount` 个段，再插入新段。适配器把厂商的累计文本、增量、句末修正转换成该协议；同一段修订保留 ID，拆分与合并分配新 ID 并移除旧段。无分段信息的短听写可用一个临时段承载当前全文。

每任务从 revision 0 开始；每次文字变更的 `baseRevision` 必须匹配当前 revision，新 revision 加一。seq 对所有事件递增；重复事件忽略，缺失、乱序或版本不匹配按协议错误处理，不把残缺补丁静默拼接。宿主维护完整投影，晚订阅的 UI 从宿主读取当前快照，不要求厂商重放。

`final` 只表示该段不可再修改，不代表任务结束；服务商仍可能修订的段不能提前标 final。任务的 `result` 是唯一成功完成出口，包含权威最终全文；此前可能没有任何文字事件。成功结果的 segments 如存在，必须均为 final。失败或取消由 result 拒绝表示，已知中间文字保留为草稿，不能冒充成功结果。

时间戳统一毫秒、相对音频起点；缺失语言、时间戳、说话人信息不填假值。词级时间戳由 ASRTranscript 顶层 words 承载，Whisper 原有 wordSegments 映射时保留真实对齐关系；不存在词级结果时不能由句长均分伪造。原文是识别服务返回的最终文本，可能已包含其标点或数字规范化，不宣称未经任何处理的逐字稿。

### 4.3 请求、任务与插件实例

```ts
import type { Disposable, JsonValue } from "@tau/plugins";

interface ASRAudioFormat {
  encoding: "pcm-s16le";
  sampleRateHz: number;
  channels: 1;
}

interface ASRAudioFrame {
  seq: number;
  startSample: number;
  data: Uint8Array;
}

interface ASRAudioFile {
  name: string;
  mimeType: string;
  sizeBytes: number;
  open(signal: AbortSignal): Promise<ReadableStream<Uint8Array>>;
}

interface ASRRequest {
  language: string;
}

interface ASRFileRequest extends ASRRequest {
  audio: ASRAudioFile;
}

interface ASRStreamRequest extends ASRRequest {
  format: ASRAudioFormat;
}

interface ASRRunOptions {
  taskId: string;
  signal: AbortSignal;
  onEvent: (event: ASREvent) => void;
}

interface ASRTask<T extends ASRTranscript = ASRTranscript> {
  readonly result: Promise<T>;
  cancel(): Promise<void>;
}

interface ASRStreamSession extends ASRTask {
  write(frame: ASRAudioFrame): Promise<void>;
  endInput(): Promise<void>;
}

interface ASRInstance {
  probe(request: ASRProbeRequest, signal: AbortSignal): Promise<ASRAvailability>;
  transcribeFile?(request: ASRFileRequest, options: ASRRunOptions): Promise<ASRTask>;
  openStream?(request: ASRStreamRequest, options: ASRRunOptions): Promise<ASRStreamSession>;
}

interface ASRProviderDefinition {
  id: string;
  name: string;
  create(config: JsonValue, modelId: string): ASRInstance;
}

interface PluginASR {
  register(definition: ASRProviderDefinition): Disposable;
}
```

上面用一段示例展示公共类型与插件注册的组合；实际公共包不依赖 `@tau/plugins`。注册类型与 JsonValue 留在插件 SDK，SDK 依赖公共 ASR 契约，不能形成包循环。

语言使用 BCP 47 标签或显式 `auto`；提供方负责映射厂商参数，不支持自动检测时明确拒绝。模型、资源 ID、地域、热词等首期服务商参数留在固定的实例配置，不将 Whisper 的 modelSize/device/computeType 暴露为通用请求字段。

文件对象是宿主管理的受限读取句柄；跨 IPC 传资源 ID 并在目标端构造读取代理，不序列化函数或 ReadableStream，不暴露任意文件系统路径。文件读取和上传保持有界内存。Whisper 内置驱动可经内部资源服务取得本地路径；该捷径不进入插件契约。第一版不要求云端文件上传，不因未来支持文件而引入公网资源上传平台。

`create` 只固定配置和模型，不联网、不录音；注册返回的 Disposable 注销提供方并取消其活跃任务。onEvent 与信号在启动前安装，宿主生成并绑定 taskId、调用窗口和插件激活代次。返回任务句柄后宿主立即接管 result 的成功与拒绝，避免无人处理的 Promise 拒绝。

### 4.4 能力探测与准备

```ts
interface ASRProbeRequest extends ASRRequest {
  input: "file" | "stream";
}

interface ASRAvailability {
  state:
    "ready" | "needs-permission" | "needs-assets" | "needs-config" | "unavailable" | "unsupported";
  reason?: string;
  execution: "device" | "remote" | "unknown";
  textUpdates: "partial" | "segments" | "final-only";
  timestamps: "none" | "segment" | "word";
  speakerLabels: boolean;
  acceptedAudio?: {
    streamFormats?: readonly ASRAudioFormat[];
    fileMimeTypes?: readonly string[];
  };
  maxDurationMs?: number;
}
```

探测针对实例配置、语言、输入模式和当前设备；不是厂商级静态布尔值。probe 不请求权限、不下载、不采集，也不发起付费识别；它不能证明账号余额或未来网络一定可用，创建任务仍处理运行期错误。unknown 不等于离线，缺失时长上限不表示无限制。

系统资源准备由宿主独立 `prepare` 操作承担，在用户主动使用或准备能力时申请所需权限和资源，完成后重新 probe。不支持的模式、语言和格式在录音或上传前拒绝；无法提前确定的服务限制在运行时如实返回。

### 4.5 生命周期、背压与取消

- 文件：创建 → 上传或识别 → 完成／失败／取消。实时：创建 → 接收音频 → 结束输入 → 等待最终结果 → 完成／失败／取消。终态只发生一次，之后无文字事件。
- `write` 串行提交，校验连续帧序和样本位置；Promise 表示已接受到有界发送通道，不表示已完成识别。采集队列按字节和音频时长限制，满时明确报错，不无限积压或静默丢音频。
- `endInput` 幂等，排空此前已接受帧并发送结束标记；之后拒绝 write。它不等于识别完成，最终文本仍从 result 取得。结束等待设截止时间，超时失败并保留草稿。
- `cancel` 幂等，与 AbortSignal 同义；result 未完成时取消可胜过结束等待，result 以取消错误拒绝；成功后取消不撤回交付结果。取消释放采集、连接、计时器、读取流及临时文件。
- 创建中取消也释放已经取得的资源；关闭窗口、插件停用、激活代次变化或切库由宿主兜底取消，旧事件不能进入新会话。
- 云端取消保证本机不再交付结果，不承诺服务端停止计费；不跨供应商自动重放，网络重试与长任务恢复需由业务明确决定。
- Whisper 接入不能只包一层 Promise：必须给现有子进程增加取消与清理通道，并将进度归属绑定到 taskId，避免同窗口多个任务互相认领。
- 错误归一为权限拒绝、设备不可用、资源缺失、配置或鉴权失败、不支持、忙、网络、额度、超时、协议错误、取消与内部错误；无语音正常返回空文本。保留可用的厂商 requestId，不记录凭据、音频或识别正文。

### 4.6 原生麦克风驱动与业务入口

部分原生 API 自行采集麦克风，不接受外部 PCM。这类实现使用宿主内部 `openMicrophone` 驱动，提供结果事件、stop、cancel，映射到相同 ASR 结果；不伪造 openStream 能力，不要求插件自管麦克风。原生是否也支持文件或外部音频按验证结果分别开放。

业务入口只看到 `speechInput.start({ target, engine, onPreview, signal })` 返回的会话，调用 `stop()` 得到 `{ original, preparedText, refinement }`，或调用 `cancel()` 退出；具体目标类型在接入现有提交守卫时定义，不以裸 DOM 焦点作为持久身份。

stop 顺序为停止新增采集 → 冲洗重采样器与尾帧 → endInput／原生 stop → 等待最终识别 → 可选 AI 整理 → 校验目标并交付可编辑草稿。stop 在途复用同一 Promise，取消覆盖整理阶段；业务在提交前再次检查信号和目标版本。输入期间预览不写入 Y.Doc，编辑器最终一次提交、一次撤销；目标发生冲突则保留草稿，不覆盖用户后续编辑。

宿主统一麦克风租约；当前用户主动选择的识别来源固定至本会话结束。PCM 由宿主采集并重采样成协商格式，不能把 WebM/Opus Blob 当作 PCM，也不能假定设备实际采样率就是请求值。

听写默认不永久保存录音；Whisper 使用每任务独立临时目录，成功、失败、取消后均清理。识别原文在本次草稿生命周期内保留供恢复，是否持久保存由业务决定；媒体原文件和转录记录继续遵循原有业务保留规则。

## 5. 原生验证与 Seed 插件

### 5.1 macOS

优先评估 SpeechAnalyzer/SpeechTranscriber；对当前产品支持设备，记录系统与 CPU 架构、可用 API、中文 locale、是否需要首次下载、离线行为、临时结果、句末修正和停止尾句。SFSpeechRecognizer 是候选路线，不在真机验证前承诺覆盖范围或默认兼容策略。

验证包含真实打包后的原生助手／桥接、麦克风权限、必要的语音识别权限、签名与资源分发。选 Swift helper 或原生模块的具体承载由验证结果决定，JS 层只看到稳定协议。权限需求按实际 API 核实，不能把一种 API 的权限要求套给所有路线。

### 5.2 Windows

先评估 Windows AI Speech 与 Windows SDK 语音识别的实际可用性，记录系统 build、CPU/NPU、SDK 与发布通道、中文支持、模型准备、网络路径、包身份要求。基于当前 NSIS 安装方式验证，不能用有 MSIX 身份的示例程序替代产品结论。

遇到无法直接落地的条件，形成决策项：复现、官方依据、影响用户范围、候选方案、开发和维护成本、推荐选项。可讨论提高最低版本、增加包身份或调整打包、暂不开放该平台原生能力。**不默认要求兼容所有 Windows 版本，不自行增加 SAPI 等旧引擎兜底，也不把系统输入快捷键模拟视为已有可编程 ASR。**

等待 Windows 取舍时，可继续不依赖该选择的公共契约、macOS 与 Seed 工作；不能把“待商议”写成已完成 Windows 支持。

### 5.3 Seed 与宿主网络桥接

首个插件接豆包流式语音识别 2.0，验证 `bigmodel_async` 的音频上传、文字修订、尾包和二遍识别。具体端点、资源 ID、鉴权和音频参数在实施时按当前官方文档及实际账号核对；模型名不决定使用哪个协议。

新增宿主 WebSocket 桥接供普通插件使用，承载 URL、握手头、二进制消息、背压、关闭与取消；厂商封包和响应解析留在插件。宿主按插件代次与调用任务回收连接，不为 Seed 硬编码业务，不要求每家厂商额外起 Node 后台。握手头、凭据不进入日志；网络桥接不是恶意同环境插件沙箱。

配置沿用 TTS 的提供方实例模式；ASR 账号独立于 LLM 模型账号，不假定文本模型 Key 已开通语音产品。实施时核查配置存储的实际保密边界，不将“沿用现有配置”表述为已具备安全凭据仓库。本期 Seed 先交付实时能力，不宣称同时支持其文件识别产品。

## 6. AI 整理与配置

- 复用现有 `llmProviders`、模型选择 UI 和 pi 文本生成入口；新增“语音输入整理”用途槽，建议键 `speechInputRefinement`，引用现有 providerId/modelId，不复制账号配置。
- 保留现有 `transcriptionOptimization` 的字幕断句职责。两者可以选同一模型，但用途、提示词、输出解析和配置分别表达。
- 未配置整理模型则使用原文；配置后直接使用，不额外增加启用开关、预算或确认弹窗。可配置整理风格与用户指令，默认补标点、分段、去无意义重复，保留原意、专有名词和数字。
- 只向整理步骤提交本次最终转录及显式选定的必要上下文，不自动附带整篇文档。转录内容作为待处理数据，整理任务不授予工具执行权限。
- 原始识别结果与整理文本分开；整理允许流式预览，但最终输入提交只执行一次。整理失败或超时降级原文并标明结果；用户取消整个会话则不自动提交原文。
- 本地 ASR 加云端整理不等于全程离线；界面根据实际执行路径描述，不自行改变用户选择的模型或识别来源。
- 视频字幕仍保存原始时间轴；改写、摘要与笔记作为独立产物，不能用自由润色文本覆盖原字幕。首期不在说话过程中反复请求 LLM 整理临时结果。

ASR 选用配置区分内置引擎与插件实例，并分别保存语音输入默认来源、媒体转录默认来源；不让改听写来源意外更换视频转录引擎。设备可用性不持久化为跨设备事实，运行时重新探测。已有 Whisper 模型选择、下载目录与媒体记录在迁移时保留。

## 7. 分阶段实施与验收

阶段按依赖推进；同一时间只标记一个主阶段为进行中。技术验证与产品交付分开，原型成功不等于功能完成。Windows 未决项可以保留，同时推进独立阶段，但不得删除对应验收项。

| 阶段                | 范围与产物                                                                                                    | 退出条件                                                                                                        | 当前进度                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| P1 原生可行性       | macOS/Windows 最小原型、中文测试、权限与模型准备、真实安装包验证；记录 Windows 决策项                         | 每平台有可复现结果和支持边界；阻碍项有候选方案，需用户取舍的事项已明确列出                                      | Mac 路线已确认；冷下载、正式包与 Windows 保留待验收              |
| P2 契约与 Whisper   | 按 P1 修订契约；实现任务归属、归约器、取消和有界传输；接入 Whisper 文件提供方及真实文件调用入口               | 文件转录完成／失败／取消正确，现有模型可复用，能力不伪报实时；相关契约与行为测试通过                            | 已完成：14 项公共契约测试、28 项桌面相关测试、类型与生产构建通过 |
| P3 原生与 Seed 听写 | 接入通过验证的原生驱动、WebSocket 桥接、Seed 插件、麦克风租约；聊天草稿和搜索接入；Whisper 短时录完后转录模式 | 首字、修正、尾句与取消可用；两业务不含厂商逻辑；桌面/移动插件停用与切库无迟到写入；Windows 未决项有明确范围标记 | 能力层完成；界面接线已撤回，位置待决定                           |
| P4 整理与编辑器     | 新增现有模型用途槽、整理风格、原文恢复和失败降级；接入编辑器提交守卫                                          | 不自动发送聊天；整理失败保留原文；目标变化不误写；一次提交可撤销；取消覆盖整理全过程                            | 整理服务保留；界面与模型分配入口已撤回                           |
| P5 媒体整合与收尾   | 迁移现有媒体消费者到共享 ASR 文件层，保留音轨／队列／字幕流程；清理旧入口并完成桌面打包验收                   | 已知与检索发现的消费者全部验证，取消及进度隔离正确，无重复识别管线；未决平台范围已裁决；沉淀、退役、索引完成    | 未开始                                                           |

P2/P3 的引擎能力未接好时不对用户暴露不可用入口；每个产品提交保持已有功能完整。公共 SDK 在接口与插件验证完成前不发布。P5 不以必须新增 Seed 文件模式作为收尾条件；该模式若后续纳入范围，需补充文件上传、任务轮询与结果验证。

### 7.1 必须记录的行为验证

- 权限拒绝、资源缺失、中文／中英混说、静音、长停顿、数字与术语。
- 创建中取消、重复 stop/endInput、stop 与 cancel 竞争、尾帧排空、尾句超时。
- 临时段替换、二遍修正、分句 final 与任务完成区别、重复／乱序／缺失事件。
- 慢网背压、断线、鉴权与额度错误、多窗口争用、设备拔出、插件停用、窗口销毁。
- 切页、切库、目标变只读、录音期间编辑目标、整理期间取消、LLM 失败后原文恢复。
- Whisper 子进程取消、临时文件清理、多任务进度隔离、视频与导入消费者回归。

### 7.2 评测与检查

同一组真实语料记录识别错误率、首字和停止后最终结果的 p50/p95、失败率、峰值队列、CPU/内存，以及系统版本、模型和网络条件。Whisper 录完后模式不填写“实时首字延迟”。原生测试与云端调用只记录实际结果，不预设准确率排名或延迟承诺。

实现阶段按变更范围执行类型检查、契约和行为测试、模块分层检查、插件构建及桌面打包；涉及数据库字段时同步 Schema 与内部数据库技能文档。视觉验收由用户完成，Agent 不截图或做浏览器视觉走查。

本机验证（2026-10-24）：Swift 6 警告视为错误编译、原型签名校验、中文实时回放、真人麦克风、尾句与静音 A/B 已执行；具体结果与限制见 [P1 验证记录](./p1-native-validation.md)。未进行 Seed 付费调用、Windows 真机或正式 Tau 安装包验收。`pnpm check:docs` 通过（0 警告），`git diff --check`、构建脚本语法与证据终态／真人日志隐私检查通过。

P3 的实现、用户裁决、验证证据及未完成项见 [P3 实施记录](./p3-implementation.md)。

P4 的接口、可选模型与原文保留边界见 [P4 实施记录](./p4-implementation.md)。

SDK 0.43.0、模板正式依赖及 Seed 0.1.0 已发行，源码与包摘要、最低客户端版本及后续限制见 [发行记录](./release.md)。

入口撤回的范围、保留能力与验证见 [入口撤回记录](./entry-removal.md)。

## 8. 下一步与完成定义

P2 交付及保留边界见 [P2 实施记录](./p2-implementation.md)。本轮已完成统一 ASR 包、Whisper 文件提供方、既有入口接线、任务取消与进度隔离；下一主阶段为 P3 的原生／Seed 听写装配。

P1 当前 Mac 初验结果见 [原生验证记录](./p1-native-validation.md)。后续补正式 Electron/helper 打包与干净设备模型准备验证；取得 Windows 环境后再验证原生 API 和包身份条件。当前没有可执行 Windows 命令的环境，不将文档核查标为真机通过。

本次原型的直接实施约束：系统格式协商与 PCM Int16 转换必须明确；音频回调与界面线程隔离；结束输入后等待 finalize 与结果流完成；听写默认评估 medium VAD 并验证弱音边界。SpeechDetector 的空结果序列不能解释为没有语音，模型安装请求非空也不能解释为正在完整下载。详细依据与原始证据在同目录验证记录，不提前写成产品已实现事实。

原生验证记录和本任务新增裁决继续写在本目录；不依赖 notes 调研快照。P2 的实际契约与运行规则已落到 `packages/asr`；插件注册与真实原生会话装配属于 P3，不为 P2 新增未接线的 PluginContext 字段。

任务完成或放弃时执行：

1. 将已实现的识别契约与宿主边界沉淀到包文档及 `docs/architecture/`，同步桌面与插件架构；跨任务有效规则进入 decisions/preferences，可复用操作进入 guides。未实现提案不写成架构事实。
2. 删除本任务目录；任务内方案与裁决由 Git 历史保留。
3. 更新 `docs/README.md`，运行 `pnpm check:docs`。任务最长保留 90 天，不能以文档已写完代替产品任务收尾。

## 9. 官方依据

以下资料用于原生验证与适配器实现，接口、系统要求和账号能力在实施时再次核对；本任务方案已在上文完整描述，不依赖外链理解。

- [Apple SpeechAnalyzer 与实时、文件识别](https://developer.apple.com/videos/play/wwdc2025/277/)：包含临时结果修订、最终段与系统模型管理。
- [Apple 本地识别支持](https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportsondevicerecognition)：旧接口按实际语言与设备判断本地可用性。
- [Windows AI Speech](https://learn.microsoft.com/en-us/windows/ai/apis/speech-recognition)：新原生路线的系统、模型与包条件。
- [Windows SDK 语音识别](https://learn.microsoft.com/en-us/windows/apps/develop/input/speech-recognition)：包身份、权限及网络听写约束。
- [Seed 实时识别](https://docs.volcengine.com/docs/DoubaoVoice/bidirectional-streaming-automatic-speech-recognition-websocket?lang=zh)：鉴权头、音频格式、修订与二遍识别。
- [豆包文件识别](https://docs.volcengine.com/docs/DoubaoVoice/Accessmust-read?lang=zh)：文件任务与实时会话是不同产品链路。

Windows 拉取分支、提取边界与实测步骤见 [Windows 交接](./windows-handoff.md)。

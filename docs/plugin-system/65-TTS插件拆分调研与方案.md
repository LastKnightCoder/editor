# TTS 插件拆分调研与方案

状态：2026-10-18，M3已完成配置迁移、旧代码退役、SDK 0.13.0发布及GitHub干净克隆、Release验收。所有客户端改动仍在codex/tts-plugins独立分支，不合并master。

## 任务与范围

- COMPLETE：Investigate/Triage/Understand the problem。核查桌面TTS、播客、声音复刻、设置与主进程消费者。
- COMPLETE：形成最小接口、配置迁移、删除清单与阶段验收方案。
- COMPLETE：M1通用契约、uploadRemote、MiniMax与多账号接线；独立分支与隔离验收完成，不合并master。
- COMPLETE：M2 Qwen、uploadRemote复刻、播客与单句重生成。用户确认的会话关闭通知已接通并验证。
- COMPLETE：M3配置迁移、旧实现与重复集成入口退役。
- COMPLETE：M3公共SDK、模板与独立仓库发布，干净克隆及Release验收。

只拆MiniMax/Qwen的TTS服务商实现。业务流程、音频播放与加工留在客户端。插件仍在主窗口渲染进程执行；独立窗口经宿主转发；主进程提供fetch、文件与媒体能力，不执行插件代码、不创建隐藏窗口。插件走独立仓库与插件中心，不随客户端发布。不拆语音转录，不重构LLM配置或增加新的计费平台。

## 现状与真实调用链

以下为拆分前调研记录；最终边界与验收见本文末尾M3记录，不把历史路径当作现行实现。

| 入口               | 调用链                                                                           | 输出去向                                                    |
| ------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 语音设置           | VoiceTtsPanel → TTSProviderFactory → synthesis.getVoiceList                      | 当前服务、模型、音色选择                                    |
| 白板文本转语音     | AudioSelectorModal → TTSGenerateModal → synthesizeSpeech                         | Blob预听，确认后AudioUtil/desktopMedia插入白板              |
| 普通播客           | PodcastGenerationModal/usePodcastGeneration → services/podcast生成脚本 → 逐句TTS | audio-processor合并、计算时间轴 → uploadResource → 保存播客 |
| Notebook播客       | GenerateDialog/tasks/runner → services/podcast → tasks/podcastAudio              | 逐句合成、合并、资源保存，再保存任务结果                    |
| 播客单句重生成     | usePodcastGeneration.regenerateSegment → TTS                                     | 渲染端音频处理或podcast-audio主进程FFmpeg替换片段，再上传   |
| 通用克隆面板       | VoiceClonePanel → getVoiceCloner → uploadReferenceAudio → cloneVoice             | 返回实际音色ID，刷新/补入音色列表                           |
| 语音设置的Qwen克隆 | VoiceTtsPanel中的QwenVoiceCloneSection                                           | 按编辑中的账号/模型创建音色，不一定是当前默认账号           |

源码注释称合成消费方含“编辑器朗读”，但目前TTSGenerateModal的直接UI消费者是白板音频选择器，不能据此宣称存在已接线的全文朗读功能。

### 当前进程分布

- 合成和音色列表：渲染端Factory/Provider → commands/contracts/tts → 主进程modules/tts按ETTSProvider分支 → main/tts/minimax、qwen发请求。
- MiniMax复刻：渲染端services/minimax直接fetch上传文件、创建音色；不经主进程tts模块，也没有使用新插件context.fetch。
- Qwen复刻：渲染端先走资源上传，再调用主进程tts:clone-voice；主进程做匿名HEAD预检并请求customization。
- podcast-audio只做临时文件、提取/替换音频片段，不是TTS提供方，不能跟tts模块一起删除。

### 不可漏掉的耦合

1. services/podcast的两套脚本提示词直接调用buildMinimaxSpeechPromptRules；Factory输出provider+minimaxModel。MiniMax标签归一化也按模型版本处理。只迁走HTTP会使宿主继续感知服务商，或改变现有播客效果。
2. 普通播客逐句重新读取Factory，生成途中切换设置可能混用账号/模型；Notebook路径先取一次实例，但任务signal没有传入实际合成请求。
3. 两条播客路径都捕获单句错误并跳过；取消/停用不能再被当成普通单句失败吞掉，否则仍会合并、上传部分结果。
4. 适配器返回audio+mime，但渲染Provider丢弃mime；TTSGenerateModal硬编码audio/mp3。插件化必须保留真实MIME，不能默认所有插件只返回MP3。
5. MiniMax合成默认speed=1.1，输出单声道32kHz MP3；Qwen独立映射speed/volume/pitch。保留两者既有转换，不在宿主再次统一换算。
6. MiniMax克隆和验证请求固定官方域名，没有沿用TTS实例baseUrl；应在插件内统一消费该实例的baseUrl，属于明确的小修正，不新增账号体系。
7. VoiceClonePanel有至少8字符Voice ID验证，并对一个音色下的多个文件逐个“创建音色”；这不是多样本联合训练。Qwen返回不同ID时，面板最终仅记录最后一个。不能原样复制为通用插件标准。
8. 当前播客记录的scriptLines/speakers保存voiceId，没有账号/模型来源。历史音频正常播放不需要TTS插件；历史重生成只能使用用户当前明确选定的服务，不能推断原账号或自动选择付费账号。

## 最小接口建议

M1执行时用户追加确认了两项必要修正：上传提供方增加单次signal并同步适配三个上传插件；设置提交复用原串行队列，落盘成功后才发布内存与广播。未引入新的后台环境或存储框架。

沿用同步插件“注册提供方、宿主传配置创建实例”的模式。一个插件可由用户配置多个账号实例，不能迁移成“每个插件只留一份Key”。

| 接口/字段（草案）                                        | 必需 | 职责                                                                                 |
| -------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------ |
| context.tts.register({id, name, create})                 | 是   | 注册当前插件的TTS实现，随启停回收                                                    |
| create(config, modelId)                                  | 是   | 用配置与模型快照创建任务内实例；无网络初始化，不读取客户端store                      |
| instance.getVoices(signal)                               | 是   | 返回id/name/type/description；类型为system/cloned/custom，不返回服务商枚举           |
| instance.synthesize({text, voiceId, options}, signal)    | 是   | 返回{audio: Uint8Array, mime: string}，不保存文件、不播放音频                        |
| instance.cloneVoice({file, requestedId?, name?}, signal) | 否   | 接收{name,mimeType,content}音频字节，封装上传和复刻，返回真实Voice对象；不再返回void |
| instance.textInstructions                                | 否   | 当前模型的合成文本规则，供脚本生成器附加；缺省为纯文本，不控制播客内容与角色结构     |

options仅保留已有speed/volume/pitch及现有取值语义；不加入音频生成、流式播放、SSML、模型发现、自动重试配置或能力声明表。是否能克隆取决于实例是否实现cloneVoice，不额外声明supportsClone。服务商限制在插件内校验并给出明确错误。

任务绑定实例、配置、模型和插件激活代次；调用信号与context.signal组合，网络继续使用context.fetch。取消、停用、切库、窗口关闭使旧结果失效；取消单独向上抛出，不能进入普通“单句失败跳过”分支。重试策略留在各插件，宿主不叠加一层重试。第一期不定义统一TTS计价/额度系统，也不把TTS用量伪装成LLM token。

### 设置承载

保留「语音 → 语音合成」作为唯一入口。宿主保留账号实例列表、模型列表编辑、当前账号/模型/音色选择；去掉内置服务商预设和所有按MiniMax/Qwen判断的表单分支。

插件通过现有settings.register扩展target:"tts"贡献自己的凭据表单，宿主注入当前实例的ttsConfig.value/save。保存仅修改该实例，不能覆盖同插件其他账号。新增账号时选择已启用的TTS插件；插件表单可填入模型预设，仍保存到当前实例的通用models列表，不需要另建getModels网络接口。缺失插件显示原配置和不可用状态，不清空配置、不回落另一个付费服务。

音色列表、合成和克隆均针对显式选择的账号与模型，设置页编辑非默认账号时不偷用默认账号。此处不同时增加“向其他插件开放TTS调用”的第二套消费API。

## 播客拆分方案

- 剧本内容、说话人、LLM调用、解析、逐句进度、时间轴、合并和片段替换仍由宿主负责。
- MiniMax模型标签规则和normalizeMinimaxSpeechText全部进入MiniMax插件；插件给出textInstructions，宿主将其插入现有提示词固定位置。Qwen给出纯文本规则。
- 一次生成在开始时固定TTS实例、模型与规则，两条播客入口共用同一解析口径。正文规则不再传provider/minimaxModel；不为此定义名为“播客插件”的新接口。
- 保留普通服务失败时既有逐句跳过策略，但取消/停用必须结束任务，合并、保存前再次校验任务有效性；AudioContext在finally关闭。
- 已有生成好的音频、正文、音色ID与时间轴不改写，不增加数据库迁移。单句重生成使用明确选定的实例；跨服务商音色ID无效时报告错误，不自动替换音色。

## 声音复刻与上传依赖

MiniMax：插件内部用FormData直传参考音频，再调用voice_clone；返回用户指定或插件生成的真实ID，不需要图床。

Qwen：保留“本地参考音频 → 当前资源上传提供方 → 公网URL → customization”的流程。文件大小/MIME、前缀生成、按target_model筛选复刻音色、部署状态解释都属于Qwen插件。现有匿名HEAD预检属于Qwen当前实现，迁移时不得提升为所有上传插件的通用门槛；HEAD失败策略另行评估，不宣称HEAD成功保证服务端一定能取到文件。

**现有SDK的实际缺口**：context.upload目前只有register，TTS插件不能调用用户选中的上传提供方。建议只补一个context.upload.uploadRemote(file,{signal})，复用已完成的命名、配置快照、上传注册表与宿主转发；本地模式或无有效远端明确报错，不默默上传、不默认选S3、不要求用户再填一份存储凭据。它不提供任意插件调用、文件系统访问或资源管理API。复刻音频不做图像压缩；调用取消不等于撤回服务商已经收到的文件，不承诺远端回滚。

声音复刻UI建议改为通用单参考文件表单，保留多音色逐条处理；requestedId可选，具体规则交插件。MiniMax可按现有规则生成缺省ID，Qwen返回真实服务端ID。移除Qwen专属设置组件、固定8字符验证与“错误文案含已存在就当成功”的判断。**这是需确认的交互修正**：不继续保留“同一音色多个文件重复创建”的假多样本语义；若用户确需多样本训练，应按服务商真实支持另行设计。

## 配置迁移

建议继续使用ttsProviders与ttsUsageSettings的现有容器，实例改为{id,name,pluginId,config,models}；config为插件负责解释的JSON，宿主不再定义apiKey/baseUrl字段。

1. 先备份原设置，按旧实例逐项映射minimax→tau.tts-minimax、qwen→tau.tts-qwen。保留实例id、名称、模型顺序/自定义模型、当前providerId/modelId/voiceId；Key/baseUrl原样移入config，不合并账号。
2. 已有新结构配置优先。只在确实没有新版TTS实例时消费更旧的integration.minimax/podcastTTS；不可用单份旧Key覆盖多个新实例。未知提供方不丢弃或猜测映射，应保留备份并报告需处理项。
3. 成功落盘后删除integration.minimax、integration.podcastTTS、misc.tts.providersMigrated及其双向同步逻辑；失败不发布迁移完成状态。
4. 不自动安装插件，不默认启用新插件，不改变已有明确启停偏好。选择信息保留；插件未安装时提示去插件中心安装，旧TTS执行路径不再回退。
5. 只保留一次性配置转换入口，不保留旧运行接口或两份账号存储。待用户配置升级完成后可单独删除这份转换；不借此重建通用迁移框架。

## 删除与保留清单

| 文件/区域                                                             | 处理                                                                               |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| src-electron/main/modules/tts.ts、main/tts/minimax.ts、qwen.ts        | 提供方逻辑迁入独立插件后删除；移除tts模块登记                                      |
| src/commands/contracts/tts.ts及tts:synthesize/voice-list/clone-voice  | 删除服务商RPC；替换为宿主内部渲染转发，不让插件代码进入主进程                      |
| utils/tts/MinimaxTTSProvider、QwenTTSProvider、catalog、minimaxSpeech | 服务商实现、目录、模型规则移到对应插件；无消费者后删除                             |
| utils/tts/TTSProviderFactory                                          | 替换为通用插件实例解析与任务绑定，不保留switch分发和getActiveProviderType          |
| services/minimax.ts、types/minimax.ts                                 | 服务商请求/响应类型迁入插件；PodcastGenerationProgress先移到podcast类型再删文件    |
| types/tts.ts                                                          | 通用音色、请求/结果归SDK；宿主仅保留设置与选择类型，删除ETTSProvider及固定凭据结构 |
| VoiceTtsPanel、TtsProviderCreateDialog                                | 保留通用账号/模型/音色体验，删除预设枚举、硬编码凭据UI、QwenVoiceCloneSection      |
| IntegrationSection的MinimaxDialog/服务行/verifyMinimaxApiKey          | 删除；若AI平台组因此为空，连空分组一起删                                           |
| useSettingStore的updateMinimaxApiKey、setMinimaxEnabled与旧配置链     | 迁移后删除，不保留“修改一个Key覆盖全部MiniMax账号”的行为                           |
| services/podcast及两类播客调用者                                      | 仅改通用实例、规则与取消接线；保留生成/编辑/保存业务                               |
| podcast-audio、audio-processor、mp3、MediaUtil、音频播放/缓存         | 保留；属于宿主通用媒体能力                                                         |
| VoiceSection语音转录、Whisper下载/识别                                | 保留，本次不是ASR插件化                                                            |
| 集成中的GitHub、S3、Bilibili、YouTube                                 | 保留，分别仍服务博客发布、视频导入与代理；不能因为TTS拆分清空账号页                |

本次未发现integration.minimax供其他生产业务使用的消费者；LLM服务商目录里的MiniMax/Qwen不等于这份TTS凭据，不删除LLM提供商支持。移动端setting.rs仍有podcastTTS默认字段，属于历史配置残留；不因此增加移动端插件机制，删除前另查其设置序列化消费者，不纳入桌面运行时实现。

## 阶段与验收

| 阶段       | 交付目标                                                         | 必须通过                                                                                         |
| ---------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| M0（本轮） | 调研和协议草案                                                   | 用户确认接口、上传消费入口与克隆表单修正；未改运行代码                                           |
| M1         | 最小TTS契约、主窗口渲染注册与跨窗口转发、实例配置、MiniMax独立包 | 合成/音色/复刻、baseUrl、多账号隔离、停用取消；不随包安装                                        |
| M2         | Qwen独立包、资源上传消费接线、两条播客链及单句重生成             | Qwen公网参考音频、模型音色隔离、异步部署提示；MiniMax原有标签规则和音频默认参数不退化            |
| M3         | 一次性配置迁移、旧代码与重复账号入口退役、SDK/模板/仓库发布      | 无旧provider分支与服务商主进程代码；重启恢复、插件缺失、取消不产生迟到保存、真实包及干净克隆构建 |

M1/M2是独立分支上的连续施工阶段，不作为长期双实现产品交付；M3完成后才合并。源码质量优先，发现需要新的后台执行环境、通用RPC框架或服务商特判时停下来讨论。

测试分层：插件协议测试（fetch请求与字节）、宿主生命周期/配置测试、双窗口Electron、真实插件包设置与播客集成、用户真实账号验收。真实合成和复刻可能产生费用，实施验收时明确样本和调用量；本轮没有发起任何云服务请求，也没有读取用户密钥。不进行视觉走查，视觉由用户验收。

## M1实施记录

工作区：~/.codex/worktrees/sync-storage/editor，分支codex/tts-plugins。独立MiniMax源码在同级tau-plugin-tts-minimax，插件ID为tau.tts-minimax，候选版本0.1.0。三个上传仓库分别在codex/upload-cancellation分支，候选版本0.1.1。均未发布或安装到用户目录。

已经完成：

- SDK草案版本0.13.0增加tts和uploadRemote，TTS与上传请求只通过宿主转发到主窗口渲染端；进程退出、窗口导航、单次取消、插件停用均回收等待，迟到回复不重新建立任务。
- TTS实例固定账号配置、模型和激活代次；多个账号不共享Key。音色查询使用短会话，连续合成/批量复刻在操作内复用实例，finally关闭会话。主进程不执行插件create或合成函数。
- 语音页保留统一账号、模型、音色选择。新插件凭据由target:tts分区提供，模型列表继续由宿主编辑；插件设置跳转直达语音合成标签。删除当前账号清空选择，不切到另一付费账号。
- MiniMax合成参数、模型文本规则、音色类型和重试分类与旧实现对照；音色复刻在插件中完成，上传与复刻都使用该账号baseUrl，网络与退避都响应取消。
- 复刻UI使用audioFile单值，不保留“多文件自动合并”的误导语义；批量音色仍保留，显示服务端返回的真实音色。
- MIME沿合成结果传递到预听与白板文件，WAV/OGG不再伪装为MP3。播客合并、时间轴、音频保存与FFmpeg片段替换仍属于宿主。
- 统一设置提交先原子落盘，成功后广播；TTS/上传/同步配置在提交队列执行时合并当前值。设置RPC等待结果后回执，目录模型价格回填也在同一队列中合并；前端通用即时设置只补失败提示，不宣称自动回滚所有乐观编辑。

验证：

- SDK检查与77项既有测试通过；桌面类型检查通过。
- 桌面TTS、播客提示词、上传/语音转发、设置与表单相关48项测试通过；最终表单/复刻/落盘组合6项复跑通过。
- 白板音频MIME单测3项通过；MiniMax独立请求测试4项通过；三个上传仓库原有7项测试和构建通过，实际ZIP的网络取消各1项通过。
- 真实MiniMax ZIP在隔离Electron双窗口中验证两个账号、不同baseUrl、字节返回和停用取消；上传Electron回归通过。没有访问真实MiniMax或云存储。
- 桌面Vite生产构建通过。测试脚本是scripts/plugins/verify-tts.mjs与verify-upload.mjs，生产实现均在src/app/plugins、src/services和主进程services中。

验收包保存在output/tts-m1，SDK声明草案保存在output/tts-m1-sdk。MiniMax使用草案SDK在临时作者目录完成安装、测试和构建；没有向作者仓库写入本机SDK依赖路径，也没有声称完成公共npm/GitHub干净克隆验收。SDK草案和正式模板依赖升级、作者锁文件、GitHub仓库/Release发布均留到M3；发布前重新核查版本号占用。

复跑：

```sh
pnpm --filter @tau/plugins check
pnpm --filter @tau/plugins test
node scripts/plugins/verify-tts.mjs /绝对路径/tau.tts-minimax-0.1.0.zip
node scripts/plugins/verify-upload.mjs
# 在apps/desktop下执行真实包表单测试
TAU_TTS_PLUGIN_ZIP=/绝对路径/tau.tts-minimax-0.1.0.zip pnpm exec vitest run src/features/settings/__tests__/TTSPluginSettings.test.tsx
```

M2/M3尚未完成：Qwen独立插件、公网参考文件完整业务验收、旧配置一次性迁移、旧MiniMax/Qwen执行路径与重复集成入口退役、SDK及作者仓库正式发布。M1显式保留已有配置结构作为阶段施工输入，没有按插件ID把新请求偷偷回退到旧服务；新插件账号走新路径，旧账号在最终迁移前仍走现有路径。此分支不作为最终产品合并。

## M2实施记录

本节更新上一节的阶段状态：M2已完成，仍在codex/tts-plugins，不合并master。Qwen源码在工作区同级tau-plugin-tts-qwen，插件ID tau.tts-qwen，候选版本0.1.0；SDK沿用0.13.0草案，没有增加公开TTS接口。

### 已完成

- Qwen合成、音色目录与复刻请求全部在独立插件渲染代码中。各实例固定apiKey、baseUrl、model；下载合成音频不携带百炼凭据，返回实际音频字节。
- 复刻调用context.upload.uploadRemote，复用当前远端配置；本地模式明确失败，不自动选存储。信号贯穿上传、匿名HEAD、复刻请求与下载。原有文件限制、HEAD预检和音色分页/模型筛选行为保留，未扩展为上传服务通用门槛。
- 复刻返回真实音色ID与部署提示；没有新增自动轮询，也不将已创建ID宣称为立即可合成。设置页和播客共用单参考文件批量组件，设置页显式指定正在编辑的账号与模型，不回落全局默认账号。
- 普通播客从脚本到确认合成复用同一任务实例；Notebook任务在内存Runtime中固定实例，不把凭据写进任务记录。播客核心只接收textInstructions，旧provider/minimaxModel提示词分支与全局读取方法已删除，通用进度类型移到podcast域。
- 经用户确认，补齐内部会话关闭通知：渲染宿主停用/切库→主进程校验宿主代次→调用窗口取消信号。合成字节已返回后，后续合并/上传/保存仍检查会话存活；关闭、重置、替换任务后的迟到结果不写回。
- 普通单句失败仍跳过音频，但保留空片段和零时长行；不再让片段数组错位。缓存片段重生成可补回失败行；历史播客仍用宿主FFmpeg替换。临时文件使用UUID，避免多窗口并发覆盖。
- 单句重生成固定操作开始时的账号、音色和原始时间轴，关闭/重置后丢弃迟到结果。无音频的零时长行不再尝试提取播放。复刻表单关闭或卸载会取消当前文件和后续批次。

### 验证与产物

- Qwen独立请求测试5项通过，覆盖多账号、参数、音频下载、模型/部署状态筛选、uploadRemote顺序、取消与HEAD失败。
- 桌面相关回归45项通过；最终表单/任务组合复跑通过。包括非默认账号复刻、脚本/音频账号固定、失败行补回、历史片段FFmpeg路径、取消后迟到上传不完成、Notebook会话关闭后不建播客记录、临时文件并发隔离。
- Qwen与MiniMax真实ZIP均通过隔离Electron验证。Qwen验证包含实际宿主转发与上传注册表、参考字节、匿名HEAD、返回真实ID、嵌套上传取消，以及本地模式拒绝；云服务响应由测试模拟，不读用户凭据，不产生真实服务费用。
- 桌面类型检查与Vite生产构建通过。无截图/视觉走查。
- Qwen验收ZIP放在output/tts-m2；独立源码仍声明公共SDK 0.13.0，M2仅在临时作者目录注入草案声明包编译，没有把本机SDK路径写入源码仓库。公共SDK、作者锁文件、GitHub和插件中心发布仍归M3。

复跑Qwen的Electron验证：node scripts/plugins/verify-tts.mjs /绝对路径/tau.tts-qwen-0.1.0.zip。真实包表单继续使用TAU_TTS_PLUGIN_ZIP环境变量；同一脚本可回归MiniMax。

下一步M3：旧配置迁移、旧服务商执行代码/重复集成入口退役、公共SDK与模板发布、两个TTS插件及上传取消版本的独立仓库发布和干净克隆验收。真实百炼账号/公开桶及参考音频仍需指定样本后做收费服务验收，自动化模拟结果不替代该项。

## M3执行记录（2026-10-18）

M1/M2章节保留为阶段历史，以下为最终状态。

### 配置与退役

- 主进程首次加载设置执行`tts-settings-migration`，先在应用数据目录写入`setting.json.tts-<uuid>.bak`（仅当前用户可读写），再经原子保存更新配置；失败不发布新内存快照。
- 逐账号保留id、name、模型顺序、模型别名和当前音色，把凭据移入对应插件config；已有插件配置优先。旧单账号升级标记已完成且用户删光账号时，不从残留Key复活账号。未知旧提供方先备份再报错，不猜测、不丢弃。
- 删除integration.minimax、integration.podcastTTS、misc.tts.providersMigrated以及渲染端重复迁移；设置加载不再将失效选择自动回退到其他账号。插件未安装/停用时配置与选择保持，提示去插件中心安装启用。
- 删除旧MiniMax/Qwen适配、主进程tts模块及RPC、旧服务工具/类型/模型目录、设置页服务商特判和集成页MiniMax入口。服务商文本规则仅由插件textInstructions提供；宿主的提示词测试使用通用规则样本。语音转录、博客S3/GitHub配置与内容平台连接保留。
- 插件只在主窗口渲染进程执行，独立窗口经现有宿主转发。无Node入口、隐藏窗口或新RPC框架。

### 发布结果

| 项目                                       | 已公开版本/提交  | 结果                                               |
| ------------------------------------------ | ---------------- | -------------------------------------------------- |
| npm `@xiongtao.xt/tau-plugins`             | 0.13.0           | 已发布并从公共registry安装；UI仍为0.1.1            |
| `LastKnightCoder/tau-plugin-template`      | 55b6402          | main已更新API、TTS、UPLOAD、AI开发指南与公共依赖锁 |
| `LastKnightCoder/tau-plugin-tts-minimax`   | 6b8fc80 / v0.1.0 | 公开仓库，Action成功并产出Release ZIP              |
| `LastKnightCoder/tau-plugin-tts-qwen`      | 664a409 / v0.1.0 | 公开仓库，Action成功并产出Release ZIP              |
| `LastKnightCoder/tau-plugin-upload-github` | 93d2747 / v0.1.1 | 公共SDK升级和取消接线已发布                        |
| `LastKnightCoder/tau-plugin-upload-oss`    | 93eb6d6 / v0.1.1 | 公共SDK升级和取消接线已发布                        |
| `LastKnightCoder/tau-plugin-upload-s3`     | bec6803 / v0.1.1 | 公共SDK升级和取消接线已发布                        |

仓库统一用SSH推送。正式插件仍需提交插件中心审核，不随客户端分发；本轮没有替用户安装或自动启用，也没有提交插件中心审核。

### 验证与后续接手

- SDK类型检查及77项测试通过；桌面类型检查、生产构建通过。
- 桌面相关15个测试文件41项通过，Notebook域33项通过；随后增加两项迁移边界，迁移套件最终7项通过。
- 五个独立插件共16项测试通过。MiniMax/Qwen正式ZIP经Electron验证多账号、跨窗口、音频字节、停用取消；Qwen还覆盖uploadRemote嵌套上传取消和本地目标拒绝。
- 六个仓库从GitHub干净克隆到`/tmp/tau-tts-m3-clean-iqKrN4/`，逐个执行`pnpm install --frozen-lockfile`、`pnpm run --if-present test`、`pnpm build`全部通过，构建后Git状态干净。没有本地SDK路径、快照包或临时依赖注入。
- 本地安装包位于独立仓库`dist/`，正式下载取对应GitHub Release。客户端分支`codex/tts-plugins`留在`~/.codex/worktrees/sync-storage/editor`，暂不合并master。
- 维护命令：客户端`node scripts/plugins/verify-tts.mjs <插件ZIP>`；作者仓库用pnpm测试/构建，升级同步修改package与manifest版本并推送tag触发Release。
- 尚未做真实付费服务与用户音频验收；模拟网络及Electron验证不能替代真实服务结果。下一步由用户安装两个TTS包，核验旧账号恢复、模型/音色选择及实际合成/复刻；视觉验收由用户完成。

# P1 原生识别验证记录

日期：2026-10-24。
范围：当前 Mac 原生 API、中文实时输入、停止收尾、模型准备、独立应用权限与原型签名；Windows 仅检查可用验证环境。
结论：**当前 Mac 的 SpeechAnalyzer + SpeechTranscriber 路线可行，真人麦克风与中文逐块回放均已通过；P1 尚不代表 Windows、全新设备模型下载或正式 Tau 安装包验收完成。**

本记录属于[统一 ASR 任务](./README.md)，不修改产品支持范围。原型及证据在本目录，任务退役时随其沉淀或删除。

## 1. 环境与验证方式

| 项目     | 本次实际值                                                                              |
| -------- | --------------------------------------------------------------------------------------- |
| 设备     | Apple M3 Pro，36 GiB 内存，arm64                                                        |
| 系统     | macOS 26.5.1，build 25F80                                                               |
| 工具     | Xcode 26.2（17C52），macOS SDK 26.2，Swift 6.2.3，Swift 6 编译模式                      |
| 原生识别 | SpeechAnalyzer + SpeechTranscriber，zh-CN 经系统解析为 zh_CN                            |
| 结果模式 | timeIndexedProgressiveTranscription                                                     |
| 输入     | 文件按 200 ms 块、真实音频时长逐块馈送；真人输入使用 AVAudioEngine                      |
| 格式     | 识别输入为 16 kHz 单声道 PCM Int16；真人设备提供 48 kHz，由 AVAudioConverter 转换       |
| 应用原型 | com.tau.asr-p1-probe，独立 .app，ad-hoc 签名、Hardened Runtime、audio-input entitlement |
| 执行方式 | 裸命令行、bundle 内可执行文件、LaunchServices 独立启动分别验证                          |

合成样本由系统 Tingting 声音生成，语速 175，长度 20.938 秒；原文见 [fixture.txt](./native-probe/fixture.txt)。另外测试末尾五秒与两秒全零 PCM。真人录音经用户明确表示准备好后启动，有可见倒计时与录音状态，不保存录音，结果正文只在原型窗口临时显示；持久日志仅包含计数、时间和指定词匹配布尔值。

首结果耗时从输入会话开始计至第一条非空文字，真人数据包含开口等待，不是从声学起点计算的识别延迟。尾句耗时从停止输入／收音计至最终结果消费完成；麦克风路径包含采集队列与重采样尾帧排空。样本数量不足以推导产品 p95 或准确率排名。

## 2. 中文、实时结果与尾句

| 验证                                | 首结果  | 临时结果数 | 停止后收尾 | 结果                                        |
| ----------------------------------- | ------- | ---------- | ---------- | ------------------------------------------- |
| 裸命令行，完整中文样本，无 VAD      | 1257 ms | 82         | 159 ms     | 完整保留“春夏秋冬雨”                        |
| bundle 内程序，完整中文样本，无 VAD | 1249 ms | 82         | 153 ms     | 完整保留指定末句                            |
| 独立启动 .app，完整样本，带 VAD     | 1233 ms | 82         | 109 ms     | 中文持续出字，指定末句保留                  |
| 独立启动 .app，末尾五秒，带 VAD     | 1253 ms | 19         | 77 ms      | 结束输入后继续返回尾字并最终确认            |
| 独立启动 .app，真人麦克风，带 VAD   | 1223 ms | 35         | 48 ms      | 2 个最终段，39 字，指定五字在最终结果中保留 |
| 独立启动 .app，两秒纯静音，无 VAD   | 2024 ms | 2          | 38 ms      | **错误地返回英文 you**                      |
| 独立启动 .app，两秒纯静音，带 VAD   | 无文字  | 0          | 6 ms       | 正常得到空结果                              |

真人目标录音时长为 15 秒，实际送入 15.6 秒；当前原型的界面计时受调度影响，不承诺精确截断。首轮真人原型曾崩溃，修复后的第二轮才算通过，不能把失败轮计入成功样本。

完整合成样本的最终结果含“三点半 → 3:半”的错误，且部分标点丢失；中间文本出现“3:点半”再修订为“3:半”。这证明实时输出必须支持替换，也说明最终确认不等于识别内容一定正确。本次不以合成语音推断真人中文准确率；真人日志未保存正文，不能据此计算 CER。

停止后的正确顺序已经实测：停止采集 → 排空已采集音频与转换尾帧 → 结束 AsyncStream → `finalizeAndFinishThroughEndOfInput()` → 等待 results 消费结束。完整样本与五秒样本的最后几个字都在 end-input 之后才返回；直接关闭进程或取消 analyzer 会有丢尾句风险。

### 2.1 语音活动检测的结论

纯静音源确认是 32000 个 Int16 零样本，不能归因于环境噪声。无 VAD 的错误在命令行 bundle 与 LaunchServices 独立启动中均出现；加入 SpeechDetector 后静音返回空，完整中文与真人尾句仍通过。

后续原生听写驱动建议启用 medium VAD，并把弱音、轻声开头、噪声和尾句截断纳入验收。它是当前可行选择，不代表任何环境下都不会误判。官方也说明 VAD 可能过滤真实语音，需要权衡灵敏度。

本次 `SpeechDetector.results` 没有输出检测事件，不能因此认定没有语音。官方当前明确该序列主要用于错误，正常情况下保持空序列；不应把它当作可直接提供 speech-start/speech-end 的业务接口。最终探针输出 `detectorEventCount: 0` 和 `reportedSpeechDetected: null`；早期原始日志中的 `speechDetected: false` 只是“没有收到阳性事件”，不是有效的无语音判定。

依据：[SpeechDetector](https://developer.apple.com/documentation/speech/speechdetector)、[results 当前语义](https://developer.apple.com/documentation/speech/speechdetector/results)。

## 3. 首次准备与模型生命周期

本机最初 `installedLocales` 已有 zh_CN、zh_TW，但当前模块的 `AssetInventory.status` 是 supported，当前客户端 reservedLocales 为空。不能仅凭“已安装语言列表”就跳过模块准备。

| 操作                                        | 观测                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| 裸命令行首次 reserve + installation request | status 从 supported 到 installed，43 ms                                 |
| 新 bundle 身份首次准备                      | reservedLocales 初始为空，status 为 supported；准备后 installed，36 ms  |
| 同一 bundle 再次准备                        | 初始 already installed；仍返回安装请求对象，调用后 8 ms，保持 installed |

这只是**已有共享模型资源上的首次应用准备与重复准备**，不是全新系统从零下载模型的测量。未测下载字节、网络流量、进度完整过程，也未删除或重置用户系统模型来制造冷启动。

接口落地须遵守：

- probe 读取当前模块状态和 locale；prepare 才申请 reservation、取得安装请求并执行准备。
- 安装请求对象非空不等于实际发生大规模下载；本次已有资源时仍返回对象。
- `reserve(locale:)` 返回 false 表示该应用已经保留该语言，不是准备失败。早期原始日志的 `succeeded` 字段命名不准确，最终探针已改为 `newlyReserved`；失败应看抛错与最终状态。
- 准备完成后重新检查模块状态，再启动 analyzer；不能用一次缓存状态永久代表设备可用性。
- 验证结束只释放本探针新增的语言 reservation，不删除共享模型，也不撤销用户麦克风授权。

本轮清理已完成：bundle 和裸命令行探针均成功释放自身 reservation；bundle 随后探测为 reservedLocales 空、installedLocales 仍包含 zh_CN/zh_TW、模块状态回到 supported。说明共享资源保留和当前客户端模块准备状态确实需要分别处理。

仍需另找干净系统／设备验证：完整首次下载、下载失败与恢复、可用空间不足、模型被系统移除后的重新准备；不把这次 36 ms 展示成用户首次下载的预期等待。

依据：[AssetInventory](https://developer.apple.com/documentation/speech/assetinventory)、[reserve 的返回值](https://developer.apple.com/documentation/speech/assetinventory/reserve%28locale:%29)。

## 4. 权限、原型打包与问题修复

独立 .app 经 LaunchServices 启动时，初始 microphoneAuthorization 为 0（notDetermined）；用户授予权限后真人采集成功。此前命令行上下文的状态为 3（authorized），不能拿来代替新应用授权测试。旧 SFSpeechRecognizer 的授权仍为 notDetermined，本次没有调用它识别或申请其权限，不能由新 API 成功推导旧 API 也无需授权。

原型含中文麦克风用途说明和标准 audio-input entitlement；`codesign --verify --strict` 通过，Swift 6 `-warnings-as-errors` 编译通过。当前已安装 Tau.app 也有麦克风用途说明，但本次没有修改、重签或重装 Tau，没有验证 Electron 启动嵌套 helper、正式 Developer ID 签名、公证与升级包。

| 问题                                          | 证据与修复                                                                | 后续要求                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 文件读取默认浮点 PCM 导致 Speech 框架 SIGTRAP | 原生日志明确要求 16 位有符号整数；改为 Int16 后识别通过                   | 驱动验证并转换实际格式，不能只看 prepareToAnalyze 返回成功 |
| 麦克风第一批数据触发线程断言                  | 崩溃栈为音频 tap 回调执行 MainActor 检查；显式 `@Sendable` 后真人测试通过 | 实时音频回调与界面隔离，缓冲区复制后经有界队列转交         |
| 裸可执行文件没有 bundle identifier            | 系统日志提示使用不稳定客户端身份                                          | 产品 helper 使用稳定身份，按实际父子进程权限归属验证       |
| open -W 返回 0，但子程序可能已崩溃            | 首轮麦克风失败时启动器仍成功返回                                          | 以终态 summary/error/timeout 为准，不能只检查启动器退出码  |

原型的麦克风回调只复制缓冲区和入队，转换由消费侧串行完成，并在结束时冲洗转换器。文件模式仅用于已知合成样本，拒绝非 16 kHz 单声道输入；不是产品 ASR SDK。90 秒进程看门狗只防验证挂起，不代表产品会话超时策略。

## 5. Windows 环境与待商议事项

当前执行主机只有 macOS；常见本机 Windows 虚拟化 CLI（prlctl、VBoxManage、virsh、qemu-system-aarch64/x86_64、pwsh）未发现可执行入口，也未发现 Parallels、VMware Fusion、UTM、VirtualBox 应用及其常见虚拟机目录。当前工具未提供可执行命令的 Windows 主机，因此**本轮没有 Windows 编译或真机验证**。这不是 Windows API 不可用的结论。

项目 Windows 安装配置仍是 NSIS。官方相关原生 API 文档列有包身份／MSIX、系统与模型准备要求，是否适用于本项目、所选 SDK 发布通道和中文模型，需要在实际 Windows 环境复核。

待取得 Windows 设备后，先跑最小原型，再按证据讨论：最低系统版本、能否维持当前安装方案、是否需要包身份、是否暂不提供 Windows 原生识别。本轮不引入旧版兼容层，不安装虚拟机，也不改 Windows 打包配置。

## 6. 复现与证据

原型：[Probe.swift](./native-probe/Probe.swift)、[构建脚本](./native-probe/build.sh)、[样本生成](./native-probe/make-fixtures.py)、[应用声明](./native-probe/Info.plist)、[权限声明](./native-probe/Entitlements.plist)。脚本生成物默认位于 `/tmp/tau-asr-p1`，不提交音频或二进制。

从仓库根运行，需要 macOS 26 和兼容 SDK：

```bash
bash docs/tasks/desktop-asr/native-probe/build.sh
python3 docs/tasks/desktop-asr/native-probe/make-fixtures.py

# 只读取状态，不下载、不录音。
'/tmp/tau-asr-p1/Tau ASR P1 Probe.app/Contents/MacOS/probe' probe

# 显式准备本次中文模型；系统缺资源时可能下载。
'/tmp/tau-asr-p1/Tau ASR P1 Probe.app/Contents/MacOS/probe' prepare

# 实时速度回放：结束输入后等待最终结果。
open -n -W --stdout /tmp/tau-asr-p1/replay.jsonl \
  --stderr /tmp/tau-asr-p1/replay.stderr \
  '/tmp/tau-asr-p1/Tau ASR P1 Probe.app' \
  --args stream /tmp/tau-asr-p1/fixture.wav --vad

# 真人测试：权限提示、五秒倒计时、约十五秒录音。
open -n -W --stdout /tmp/tau-asr-p1/live.jsonl \
  --stderr /tmp/tau-asr-p1/live.stderr \
  '/tmp/tau-asr-p1/Tau ASR P1 Probe.app' --args mic
```

P2 已将探针默认设为 medium VAD；静音 A/B 将输入换成 silence.wav，分别添加 --no-vad／使用默认值；尾句测试输入为 tail.wav。历史证据仍保留当时的开关与结果。不要用文件模式转录私人音频：文件模式会输出正文日志，mic 模式不记录正文。检查对应 JSONL 必须包含 summary 或 microphone-summary，且不含 error/timeout；没有终态即未通过。

[证据汇总](./evidence/summary.json)包含环境、输入校验值、准备状态和各案例终态。同目录九份原始 JSONL 保留当次字段，后续字段命名修正不回写原始证据；正文日志仅来自公开的固定合成样本。真人证据为 [microphone-2.jsonl](./evidence/microphone-2.jsonl)，不含音频或识别正文。

## 7. P1 当前验收清单

- [x] 当前 Mac 的中文能力探测、真实原生识别与实时临时结果。
- [x] 结束输入后等待尾句；合成输入与真人均保留指定五字。
- [x] 新应用身份的模型准备、重复准备与权限申请。
- [x] 独立应用包、Hardened Runtime 与 ad-hoc 签名校验。
- [x] 静音负例、VAD 修正及正常语音回归。
- [x] Windows 环境限制与后续决策点记录。
- [ ] 全新设备完整模型下载、失败恢复及资源移除后的准备。
- [ ] 正式 Tau/Electron 父子进程、Developer ID 签名、公证与安装包验证。
- [ ] Windows 设备原型与实际 NSIS／包身份条件验证。
- [ ] Intel Mac、其他系统版本及更广的真人语料质量评测。

本轮本机可行性验证完成；P1 保留以上未验收项，不将产品支持范围自动扩大。下一步可基于当前 Mac 证据继续收敛原生驱动，取得 Windows 环境后补测并商议限制；P2–P5 未开始。

收尾检查：`pnpm check:docs` 通过（203 个 Markdown 文件，0 警告）；`git diff --check`、构建脚本语法、样本生成脚本语法，以及五份案例终态与真人日志无正文检查通过。无产品代码修改，本轮未执行整仓构建或无关业务测试。

# @tau/asr

无 Electron、React 或插件宿主依赖的语音识别契约与运行时。文件任务和实时会话共用结果、取消与事件规则；引擎层不调用厂商、不管理模型账号；浏览器采集与输入编排作为宿主辅助函数提供。

## 公共接口

- `ASRInstance.probe` 针对语言与输入模式探测。`transcribeFile`、`openStream` 是可选能力，不实现即不支持。
- `ASRAudioFile` 是受限读取句柄，`open(signal)` 返回流，不要求整文件进入内存。对象内的函数／ReadableStream 不直接跨 IPC 传输。
- `ASRTask.result` 是唯一成功终态。`cancel()` 取消任务并等待执行路径收尾；已经成功的结果不撤回。
- `ASRStreamSession.write` 接收有序 PCM 帧，`endInput` 停止接收并排空此前已接受的帧；最终文字仍等待 result。
- `ASRTranscript` 包含 text、可选 segments、顶层 words、language 和 durationMs。所有时间统一毫秒；缺失的事实不补假值。顶层 words 用于原引擎只有词／令牌对齐、没有句级分段的场景。

准确类型以 [types.ts](./src/types.ts) 为准。`ASRTask<T>` 允许宿主保留内部结果扩展；提供方的私有数据不自动成为公共契约。

## 文件与实时任务

`createASRTask(options, execute)` 固定 taskId 与外部信号，生成递增事件序号，验证分段与最终结果。执行函数的 finally 负责释放文件、子进程和连接，完成或取消后迟到事件不再交付。调用方可稍后订阅原 result 拒绝，不产生无人观察的拒绝。

`createASRStreamSession(options, format, connect, limits)` 包装驱动的 write、finish、dispose：

1. PCM 格式为 `pcm-s16le`、单声道、正整数采样率；采样率必须先与驱动协商，设备约束不等于实际格式转换。
2. 帧序号和 startSample 均从 0 开始；位置按 Int16 样本数递增，字节必须对齐。接收时复制当前帧，不允许发送期间被调用方修改。
3. write 按顺序执行，Promise 表示帧已交给驱动；默认队列预算为两秒音频，超出预算明确失败。驱动自身的网络缓存仍须有背压，不能把无限缓冲藏在 write 内。
4. endInput 幂等；排空已接受帧后调用 finish，驱动发送结束标记并等最终识别。默认尾句期限十秒，涵盖队列排空和尾句等待；超时失败，不交付临时文字冒充最终结果。
5. 取消可胜过结束等待，释放已取得的驱动；连接创建也收到取消信号，迟到取得的连接仍被回收。驱动必须实现可结束的 dispose，不能依赖本包抢占任意同步代码或停止没有取消机制的外部资源。

Mac 原生策略由 `MAC_NATIVE_ASR_DEFAULTS` 表达：medium VAD、16 kHz Int16 单声道、两秒队列及十秒尾句期限。原生驱动由桌面宿主装配。

## 事件投影

`ASRTranscriptReducer` 根据 taskId、seq 与 revision 校验事件。分段事件使用有序替换范围，临时段可改写，已确认段不可替换或从最终结果中消失。重复序号忽略，序号缺口、错误归属、版本不匹配、重复段 ID、非法时间戳会失败。

progress 只表示工作进度，不是文本流。文字段的 final 只确认该段；整个任务是否成功以 result 为准。投影快照是不可变数据，晚订阅的 UI 从宿主读取快照。

## 验证

```bash
pnpm --filter @tau/asr test
pnpm --filter @tau/asr check
pnpm --filter @tau/asr build
```

包只在工作区使用，不发布 npm。行为测试覆盖文本修订、错误归属、取消竞争、尾帧排空、尾句超时、慢发送队列和连接创建中取消。

## 宿主采集与输入编排

`prepareMicrophone` 在用户手势中唤醒 AudioContext，按引擎协商格式执行 AudioWorklet 重采样、单声道混合与小端 Int16 编码；200 ms 帧、两秒有界等待，停止先刷尾帧再等待写入。取消或迟到权限结果会停止音轨，设备断开令任务失败。

`createSpeechInputService` 统一麦克风与 ASR 会话：同一服务实例最多一个录音，最长 120 秒，预览经 reducer 校验，最终结果与释放均走同一收尾路径。引擎失败会停止采集；输入目标的提交、冲突和页面可见性由 `@tau/shared/speech-input` 及应用消费者处理。桌面另有跨窗口原生租约，移动使用当前插件宿主生命周期。

## 可选转录整理

`SpeechRefiner` 是宿主注入的纯文本处理函数；`refineSpeechInput` 在最终识别后调用它，返回独立的 original/text/status，原始分段与时间戳不改写。无适配器或静音不调用；失败、空正文、默认 30 秒超时回退原文；外部取消直接拒绝，不以原文自动提交。预览只在当前整理任务存活期间交付，收尾后忽略迟到回调。模型、账号和用途配置归宿主，不进入 ASR 提供方或麦克风层。

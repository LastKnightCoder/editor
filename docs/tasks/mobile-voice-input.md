# 移动端语音输入入口

状态：进行中
目标：在移动端卡片、文章、日记、快速捕获的编辑器里接入按住说话的语音输入，并预留 AI 润色的界面。

## 需求

- 入口：编辑态在配件栏右侧固定一个 🎤（「收起键盘 / 完成」左侧，不进可横滑的中段）；阅读态在「编辑」悬浮按钮左侧加圆形 🎤。代码块、公式、表格、源码块等上下文模式和格式模式不显示。
- 手势：按住 🎤 开始录音，松手写入，手指上滑到 ✕ 松手取消；不做锁定。按下不足 200ms 视为短按，只提示「按住说话，松手写入」。
- 录音中：底部升起居中弧形沉浸区（波形、计时、「松手插入 · 上滑取消」），✕ 居中悬在弧形上方，上方渐变压暗。键盘不收起，沉浸区盖在键盘位置上，正文不跳。按下后整块屏幕都跟踪这根手指，不要求手指停在 🎤 上。
- 流式插入：识别中的文字以浅灰色出现在锁定的插入点（编辑态为按下时的光标，阅读态为文末新段落），不写进文档、无底色；尾句（仍会被修正）更浅。松手后一次性写入正文，作为一个撤销步；toast 提供「撤销」。
- 取消：上滑进入 ✕ 范围时 ✕ 变红放大、沉浸区泛红、提示「松手取消」，预览文字变淡并划掉；松手调用 `cancel()`，正文不变。
- 上限：2:00 由服务层自动停止，按松手处理（写入）；剩 15 秒计时变红。
- 异常：未配置识别服务、麦克风权限被拒、连接失败、没识别出字分别提示，未配置给「去设置」（我的 › 语音 › 语音输入）。
- 系统识别：手机端没有实现，设置页「系统识别」不可选；当前选的是系统识别时，按住提示「手机端暂不支持系统识别，请选择识别插件」。
- AI 润色：本期**不接入**（还没有给用户配置 AI 的地方）。界面组件与状态先写好、加测试，入口由一个润色器参数控制，缺省为空即不显示润色流程；后续接入时只需传入润色器。

## 方案

### 结构

| 位置                                    | 内容                                                                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/src/features/speechInput/` | 新功能域                                                                                                                                                                                          |
| `useDictationSession.ts`                | 会话状态机：`idle → connecting → listening → (cancel-armed) → committing → polishing? → done`；包装 `SpeechInputService.start`，维护预览文字、计时、取消判定；可选润色器 `refine?: SpeechRefiner` |
| `dictationPreview.ts`                   | 编辑器装饰扩展：在锁定插入点（Slate Point，经 `Editor.pointRef` 跟随文档变化）渲染预览文字；状态存在模块级小 store，`subscribe` 触发装饰重算                                                      |
| `commitDictation.ts`                    | 一次性写入：编辑态在插入点插入文本（多段拆成段落），阅读态在文末追加段落；`HistoryEditor.withNewBatch` 合并为一个撤销步；返回撤销函数                                                             |
| `DictationOverlay.tsx`                  | 沉浸区视图（portal 到页面根），纯展示，props 驱动：`state`、`elapsedMs`、`cancelArmed`、`level`                                                                                                   |
| `PolishPill.tsx`                        | 润色胶囊：润色中（✦ 脉动 +「AI 润色中」+「跳过」）、完成（「已润色 · 用原文 · 撤销」）、失败（「润色失败，已用原文 · 重试」）；本期只在测试与开发预览中挂载                                       |
| `useHoldGesture.ts`                     | 按住手势：pointerdown 后 200ms 进入录音，在 window 上跟踪同一指针；pointermove 判断是否进入 ✕ 命中区（按钮矩形外扩 24px）；pointerup / pointercancel 分别提交或取消                               |
| `DictationTrigger.tsx`                  | 按钮 + 手势 + 沉浸区 + 润色胶囊的组合；按钮外观由入口经 `renderButton` 提供                                                                                                                       |
| `useEditorDictation.ts`                 | 编辑器侧编排：锁定插入点、预览、写入、润色胶囊状态、未配置引导                                                                                                                                    |

### 关键约定

- 预览不写文档：装饰扩展用 Slate 折叠装饰范围切出空叶子，`LeafRenderer` 经 MarkSpec 渲染 `contentEditable={false}` 的预览 span。预览期间编辑器正常可写，插入点用 `pointRef` 跟随。
- 写入在 `stop()` 拿到 `result` 后执行；`onPreview` 只更新预览 store。
- 识别服务来自 `createMobileSpeechInputService(runtime.asr)`，在功能域内按插件运行时单例化。
- 润色：`refine` 缺省为 `undefined`，`useDictationSession` 不进入 `polishing`；有润色器时松手后先写原文（灰色流光样式），`refineSpeechInput` 结果替换同一段，「用原文」可来回切换，整个过程一个撤销步。
- 样式：Tailwind 语义类 + `--tau-*`；流光、波形等关键帧放 `styles.css`（D-087 允许）。

### 视觉

以 mockup `apps/mobile/mockups/voice-input-mobile/`（分页 1 按住说话、2 AI 润色、3 阅读态、5 权限与异常）为准；视觉验收由用户完成。

## 决策

- 交互用「按住说话」，不做录音前后的确认面板；松手即写入，靠撤销回退。
- 取消用上滑（同微信），去掉锁定，长段按住说，最长 2 分钟。
- 沉浸区居中对称，不跟随 🎤 位置。
- 录音时键盘不收起，沉浸区覆盖键盘，保证正文不跳。
- AI 润色本期不接入，界面先实现，后续接入只传润色器。
- 手机端系统识别（Android `SpeechRecognizer` / iOS `SFSpeechRecognizer`）先不做，设置页与按住提示如实说明不支持，原生实现另立任务。

## 进度

- [x] Investigate/Triage/Understand the problem：服务层、装饰扩展机制、配件栏、阅读态悬浮按钮、权限声明已确认（Android `RECORD_AUDIO`、iOS `NSMicrophoneUsageDescription` 已有）。
- [x] 会话状态机与写入（`useDictationSession` / `commitDictation`）+ 测试
- [x] 预览装饰扩展接入移动端内容 Kit + 测试
- [x] 沉浸区、手势与配件栏 / 阅读态入口 + 测试
- [x] 润色胶囊与润色状态（缺省关闭）+ 测试
- [x] 文档同步（`docs/architecture/mobile.md` 语音输入小节）、类型检查、构建
- [x] 系统识别如实提示：设置页不可选并提示改选插件，按住时按原因提示（系统识别 / 账号未配置）
- [ ] 真机验收（用户）：按住 / 上滑取消手势、预览位置、键盘不收起、Android 与 iOS 麦克风权限弹窗
- [ ] 接入 AI 配置后：入口传入 `refine`，补「重试」的重新润色

遗留：✕ 命中区按按钮矩形外扩 24px 判定（不是需求里写的圆形半径），真机手感不对再调。

## 验证

- `pnpm --filter mobile exec vitest run src/features/speechInput src/features/cards/__tests__/mobileEditorBottomToolbar.test.tsx src/features/cards/readingMode src/features/cards/__tests__/contentDetail`：15 个文件 131 项通过（语音输入新增 54 项）。
- `features/cards` 与 `services` 全量里另有 8 项失败（块选择入口、快速捕获正文绑定、内容计数、插件中心与安装），撤下本任务改动后同样失败，不属于本任务。
- `apps/mobile` 的 `tsc --noEmit` 0 错误。
- 系统识别提示补丁后：`src/features/settings` 与 `src/features/speechInput` 共 198 项通过（新增设置页 1 项、按住提示 3 项）。
- 未做视觉验收与真机测试。

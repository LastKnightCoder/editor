# 移动端语音输入

状态：进行中
目标：让语音成为移动端和键盘平级的输入方式：编辑时一键切到语音面板连续口述，首页长按 ＋ 随时说一段存进速记。

## 需求

- **编辑态（方案 A）**：配件栏最左端（「插入」左侧）固定一个输入方式切换键 🎤；点一下，键盘位置换成等高的语音面板，键变为 ⌨，再点回到键盘。代码块、公式、表格、源码块等上下文模式、格式模式和只读时不显示。首次出现时显示一次引导气泡。
- **语音面板**：正中大麦克风轻点开始、再点停止并写入；按住超过 250ms 为按住说，松手写入、上滑到 ✕ 松手取消。两侧「撤回这段」「换行」。停止后留在面板，可以连续说多段。切到面板不自动开始录音。
- **焦点**：语音面板期间正文保持焦点但不弹键盘（`inputmode="none"`），点正文只移动插入点。
- **流式预览与写入**：识别中的文字以浅灰色出现在插入点，不写进文档，尾句更浅；停止后一次写入，每段一个撤销步。写入后面板顶部显示「已写入 N 字」，不再弹 toast。
- **自动停止**：识别文字 7 秒无变化提示「没听到声音」，10 秒无变化自动停止并写入；2:00 上限由服务层自动停止；剩 15 秒计时变红。
- **阅读态**：「编辑」左侧强调色 🎤，点击打开底部语音抽屉并立即开始录音，追加到文末，可连续多段，关闭不进入编辑。
- **全局直接说（方案 C）**：首页 Dock 中央 ＋ 轻点展开新建菜单；按住直接说，Dock 上方浮出识别卡片，松手存成一条速记，toast 给「打开」；上滑取消。新建菜单增加「说一段」，打开速记并直接进入语音面板开始录音；首次点击提示可以长按 ＋。
- **异常**：未配置识别服务、麦克风权限被拒、连接失败等显示在面板内；配置类给「去设置语音识别」（我的 › 语音 › 语音输入）。Dock 长按没有面板，仍用 toast。
- **系统识别**：Android `SpeechRecognizer`、iOS `SFSpeechRecognizer` 经 Tauri `native-speech` 插件接入，与插件识别共用同一套会话、预览和写入。
- **AI 润色**：本期不接入（还没有给用户配置 AI 的地方）。`useVoiceDictation` 接受可选润色器，状态显示在面板顶部；入口缺省不传。

## 方案

### 结构（`apps/mobile/src/features/speechInput/`）

| 文件                     | 内容                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `useDictationSession.ts` | 会话状态机，包装 `SpeechInputService.start`，可选润色                                  |
| `useHoldGesture.ts`      | 轻点 / 按住二合一手势（250ms 阈值），window 上跟踪同一指针与 ✕ 命中区                  |
| `dictationPreview.tsx`   | 编辑器装饰扩展：插入点预览文字，阅读态另起一段并画插入点                               |
| `commitDictation.ts`     | 一次性写入、润色替换、撤销                                                             |
| `speechService.ts`       | 识别服务实例复用、可用性判断                                                           |
| `useVoiceDictation.ts`   | 编辑器侧编排：锁插入点、预览、写入、撤回这段、换行、静音自动停止、润色状态、面板内错误 |
| `VoicePanel.tsx`         | 语音面板视图：大麦克风、计时波形、结果条、两侧按钮、按住时的 ✕ 与压暗                  |
| `VoiceModeCoach.tsx`     | 配件栏切换键首次引导                                                                   |
| `ReadingVoiceSheet.tsx`  | 阅读态底部抽屉                                                                         |
| `useVoiceCapture.ts`     | 不经编辑器的语音速记：识别后存成速记卡片                                               |
| `VoiceCaptureCard.tsx`   | Dock 长按时的识别卡片                                                                  |

接入点：`MobileEditorBottomToolbar`（切换键与 `voice` 面板、`autoStartVoice`）、`useMobileEditorToolbarController`（`EditorPanelKind` 增加 `voice`，inputmode 处理）、`ContentDetailPage`（阅读态抽屉）、`AppDock`（长按与「说一段」）、`quickCapture.page.tsx`（`voice` 参数）。

### 视觉

以 mockup `apps/mobile/mockups/voice-first-mobile/` 为准（0 问题与方案对比、1 语音模式、2 按住说、3 AI 润色、4 阅读态与速记、5 全局长按、6 权限与异常）；视觉验收由用户完成。

## 决策

- 语音是和键盘平级的输入方式，入口是配件栏最左端的切换键，不再是右侧需要长按的小按钮。
- 轻点为主、按住为辅，同一个按钮按 250ms 区分。
- 切到语音面板不自动开始录音；阅读态抽屉和「说一段」目的明确，打开即开始。
- 停顿 10 秒自动停止并写入。
- 写入反馈放在面板里（已写入字数 + 撤回这段），不再用 toast 撤销；润色胶囊并入面板顶部。
- 首页长按 ＋ 直接说并存成速记，菜单「说一段」是可见入口。
- 速记暂不记住上次的输入方式。
- 原生识别按 session ID 隔离事件，权限弹窗中取消、应用切后台和旧识别器迟到事件均不能写入正文；Android 系统识别器自动断句后续听，最长两分钟。

## 进度

### 语音优先重做

- [x] Investigate/Triage/Understand the problem：现有入口在配件栏右侧、需长按；确认可复用会话、预览、写入与面板等高预留机制。
- [x] 设计稿 `apps/mobile/mockups/voice-first-mobile/`，用户选定 A + C。
- [x] 语音面板与编排（`VoicePanel` / `useVoiceDictation`），删除 `DictationTrigger` / `DictationOverlay` / `PolishPill` / `useEditorDictation` / `useDictationKeyboardSwap`。
- [x] 配件栏切换键、`voice` 面板与 inputmode 焦点处理。
- [x] 阅读态抽屉、Dock 长按速记与「说一段」。
- [x] 测试、类型检查、构建、文档同步。
- [ ] 真机验收（用户）：`inputmode="none"` 下点正文是否真的不弹键盘（iOS / Android WebView）、面板与键盘切换不跳动、Dock 长按与菜单轻点不冲突、阅读态抽屉。

### 系统识别（已完成部分）

- [x] Tauri `native-speech` 插件：Android `SpeechRecognizer`、iOS `SFSpeechRecognizer`、权限、partial/final/错误事件
- [x] Android 识别服务包可见性、引擎/语言包/网络错误提示、连续断句与取消竞态
- [ ] Android 厂商验证：无识别服务、联网识别、语言包未安装、断网、跨自动断句、切后台和连续使用
- [ ] iOS 真机验证：语音权限拒绝/允许、语言不可用、切后台取消与跨断句
- [ ] 接入 AI 配置后：入口传入 `refine`

## 验证

- `pnpm --filter mobile exec vitest run`（全量）：188 个文件通过，1263 项通过；`features/cards/__tests__/pageBlockSelectionEntry.test.tsx` 的 2 项「项目文档」用例失败，撤下本次改动后同样失败，不属于本任务。
- 语音相关 7 个测试文件 52 项通过（新增语音面板 7 项、语音速记 4 项、切换键 7 项）；工具栏控制器新增 voice 面板 2 项。
- `apps/mobile` 的 `tsc --noEmit` 0 错误，Vite 生产构建通过，变更文件 oxfmt 检查通过。
- 未在真机或手机客户端运行；视觉验收由用户完成。

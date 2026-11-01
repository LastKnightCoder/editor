# 视频笔记重设计（剧场版面）

状态：进行中
目标：项目里的视频笔记条目改成「左边看、右边记」，笔记和视频互相回连，对话退为按需打开。
需求：

- 范围只含项目条目 `VideoNoteView`；白板侧栏的旧 `VideoNotePanel` 本轮不动。
- 版面：左栏播放器 + 跟随转录，右栏笔记常驻；对话默认收起，⌘J 开关并记住上次状态。条目区 ≥ 左栏 440 + 笔记 360 + 对话宽（对话输入框最少 480，约 1280）时对话停成第三栏，否则作为抽屉盖在笔记栏上；画面任何宽度都不让位。
- 窄窗：收起文档树后条目区仍放不下两栏（< 860）时自动收起项目文档树（不改用户持久化的收起偏好），用户再点展开即尊重用户。不弹提示，面包屑的展开按钮即入口。
- 进度条按 AI 章节分段；下方圆点标出笔记里的时间戳（空心）、摘录（实心）、截帧（方块），悬停浮出笔记片段，点击跳播。
- 转录按章节分组（吸顶段头）；划选弹工具条：摘到笔记（引用块 + 时间戳插到笔记光标处）/ 问 AI（带进对话输入框，不自动发送）/ 从这句播放 / 复制；已摘录的句子留浅色底；手动滚走后出「回到当前播放」。「摘到笔记」不设快捷键（⌘⇧E 已是编辑器行内公式）。
- 多篇笔记用栏头胶囊切换 + 「＋」，替代下拉菜单。
- AI 章节：转录落库后用「视频总结」模型位自动生成章节标题 + 一句摘要；未配模型时不生成、转录不分组、进度条一整段；⋯ 菜单可重新生成。

方案：

- 章节存 `video_notes.insights`（列已存在、原内容无消费者）：`{ version: 2, transcriptHash, generatedAt, chapters: [{ start(ms), title, summary }] }`；读到其他形态视为没有章节，不迁移。转录变化（hash 不一致）时自动重新生成。无 schema 变更。
- 播放器：`@tau/shared` 的 `VideoPlayer` 新增 `chapters`（分段 + 悬停气泡带章节名 + 底栏信息位显示当前章节）与 `markers`（刻度圆点）两个可选 prop，`LocalVideo` 透传；其他调用方不受影响。
- 刻度来源：扫描本视频全部笔记正文里的 `video-timestamp` / `video-screenshot` 节点；所在块为引用块即「摘录」。当前笔记随编辑实时更新，其他笔记取加载时内容。已摘录句子 = 段起点与摘录时间戳相差 < 1 秒。
- 摘录插入：`NotesStage` 暴露 `insertQuote(text, timeSec)`，在光标处（无选区落文末）插入 `blockquote > paragraph[video-timestamp, 文本]`。
- 问 AI：对话展开并经 `ChatContainerHandle.setInputValue` 预填引用文本。

决策：

- 2026-11-01 用户按推荐裁决：版面 A 剧场；做 AI 分章节；对话默认收起、记住上次；白板面板本轮不动。mockup 见 `apps/desktop/mockups/video-note/`。

未纳入（后续另议）：对话回答里的时间可点跳播、回答「插入到笔记」。

进度：

- [x] 播放器章节分段与刻度（`VideoPlayer` 的 `chapters` / `markers`，`ProgressBar` 的 `breaks`）
- [x] AI 章节生成与存储（`useVideoNoteChapters`，复用「视频总结」模型位；旧 `video-insights` 提示词与主题 / 高亮类型无消费者，已删）
- [x] VideoNoteView 重排、⌘J 对话、文档树自动收起
- [x] 转录划词摘录 / 章节分组 / 回到当前播放
- [x] 笔记胶囊与刻度来源
- [x] 架构事实同步到 `docs/architecture/desktop.md` 视频笔记段
- [x] 删除只服务旧版面的 `ResizableAndHideableSidebar` / `WidthResizable` 的 `fillRemaining`
- [ ] 用户视觉与交互验收
- [ ] 验收后收尾：删本文件、更新 docs/README

验证：

- `apps/desktop`：`tsc --noEmit` 通过；`vitest run src/components/VideoNotePanel src/features/projects/components/ProjectView/VideoNoteView src/constants/internal-skills/__tests__/database-schema.test.ts` 6 文件 23 项通过。
- `packages/shared`：`vitest run src/components/MediaPlayer` 8 文件 38 项通过（`tsc` 仅有 3 处既有的 CSS 副作用导入报错，与本任务无关）。
- `packages/ui`：`tsc --noEmit` 通过，`ResizableAndHideableSidebar.test.tsx` 3 项通过。
- 改动文件 oxlint 无错误（只有既有的警告）。
- 未做：视觉走查（按 AGENTS.md 由用户验收）；真实模型生成章节、长视频分章节质量未试。

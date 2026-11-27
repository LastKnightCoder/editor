# 今日页与业务域数据

> 今日页数据契约与各业务域（测验/日程/待办/闪卡/卡片库/脉络/洞见/PDF/列表）接线。

今日主视图、统计摘要和布局编辑使用 `features/home/locales/` 的三语 JSON 词典，日期和数字按当前界面语言格式化；面板 ID 与布局存储不随语言变化。内置面板名称与插件包装器的标题在读取时解析，语言切换不创建新面板组件。

待办快照保留 `dueAt`，日程保留全天标记与开始/结束分钟，最近编辑保留 `updatedAt`；查询不缓存中文日期与默认标题。面板在展示边界解析相对日期、全天状态、数量和无标题回退，语言切换不改变查询键或重新请求业务数据。

回顾时间窗、评分标签、构成单位和趋势提示使用首页词典；显示数字、百分比和紧凑数量按当前语言格式化，图表的 CSS 比例、统计值与时间窗 key 保持原样。YearHeatmap 的月份、活动次数与默认说明由公共 UI 词典负责，缓存只保存月份数字，不固化语言标签。

洞见列表选择器显式接收翻译器与 locale，在缓存数据上重新生成固定标题、类型和操作文案；查询键不依赖语言，AI 理由、引用原文、主题和项目名保持原样。首页漫步卡与漫步页共享的类型和选中原因由 walk 模块词典提供，纯格式化函数接收语言参数，不改变抽样池、足迹与屏蔽规则。

## 今日页数据（已全部接线，features/home/queries.ts）

### 学习测验的数据与作答会话

- `features/vibe-learning/quizQueries.ts` 查询测验集、题目、历史和最高分；键包含数据库及项目/测验身份，命令绑定原库。最高分走主进程 `vl-quiz:best-scores` 聚合，完整历史仅在记录浮层打开时读取，不再逐测验预取全部记录。
- `quizSession.ts` 的控制器由每个 QuizTestModal 的 `useQuizSession` 独立创建；持有开始时的项目、测验及题目快照，答案和游标不持久化。重复完成复用同一在途请求，提交期间冻结作答/导航，失败保留答案可重试；取消、重开及切库后的旧结果不能完成新会话。Activity 停驻不清空当前作答。
- 题目/名称编辑与删除成功才更新/失效原库缓存，null/false 结果视为失败；错误表单和确认框留在原地。成绩提交由主进程校验测验仍存在且归属项目一致，已删除测验不能继续写入生成题目或成绩。
- 数据库 IPC 提交后以 `vl-quiz:changed` 携带库名通知全部窗口；与日程复用 `database-notifications.ts` 底盘。后台 runner 保持离页生成与原库写入，只失效原库查询，不再拉取全局测验列表或设置选中测验。笔记等其他任务的状态协议保留。
- `useVLQuizStore`、未接线的全局 QuizTestSession/QuizTestStatus 类型已删除；`vl-quiz-store` 的项目/测验 ID 没有数据库身份，设置初始化直接清除，不迁移到新会话。测验业务表、成绩记录、生成执行器和题面组件保留。

### 日程数据、偏好与变更通知

- `features/schedule/queries.ts` 承载日历/分组目录、日期窗口事件、单条定位、备注和待办来源状态；查询键包含数据库名，事件键另含完整月网格/周/日范围及排序后的可见日历 ID。全部隐藏时不发送空筛选查询。SearchPalette 复用目录及创建 mutation，不依赖日程 store。
- 命令通过 `bindDatabaseCommands` 绑定原库；切库后的旧闭包拒绝新写入，在途响应只回写和失效原库。日历显隐只有数据库 visible 字段一个事实源；写入失败不更新缓存、不关闭表单。备注加载失败禁止保存并允许重试，迟到备注不覆盖已输入的标题。
- 数据库 IPC 事务提交后以 `schedule:changed` 携带库名通知全部窗口，覆盖日历直接写入、待办同步及番茄历史修改；番茄结束直接写表时补同一通知。只失效对应库的目录、事件与来源查询，编辑中的备注快照不随通知重载；聚焦和 Activity 恢复仍刷新查询。合并数量通过主进程 COUNT 聚合，不拉取全部日程。
- `uiStore.ts` 只管理日期、视图、分区展开、当日面板、草稿和合并会话。偏好存入 tau-schedule-preferences，旧 calendar-store 的合法偏好先迁移再删除；不迁移数据库 ID 或记录。切库清除草稿、速览和合并选择，保活切页保留会话。useCalendarStore 与旧 useCalendarEvents 包装已删除；历史表升级和当前日历命令保留。
- 域外取日程：`useCalendarEvents` 依赖日程页 uiStore，域外不得使用；取某天日程用 `useEventsOfDay(day)`，日历角色用 `useCalendarRoles`（都不碰 uiStore，随 `schedule:changed` 失效）。

### 番茄绑定与跨域启动

- 主进程保存计时和背景音状态，只向一个已就绪的主窗口或辅助窗口发送播放指令。播放窗口关闭或重载时，另一个已就绪的窗口按声音的累计播放时长接手。没有可接手的窗口且仍需播放时才创建无界面的音频 WebContentsView，窗口接手、暂停、结束或取消背景音时释放。

- 会话可选绑定一条日历事件或一条待办：`pomodoro_sessions.bound_event_id / bound_todo_id / bound_title`。主进程 `PomodoroSessionTable.resolveBinding` 解析（待办来源事件反查待办），结束时 `refreshBinding` 取最新标题，对象已删则用快照。番茄写日历的标题只经 `pomodoroEventTitle`（结束写入与改时长重建同一规则）。
- 读取绑定须容忍悬空 id：移动端编辑待办会删除重建其日历事件。按待办聚合用 `bound_todo_id`（`pomodoro:summary-by-todo`）。
- 跨域启动（日程事件抽屉、待办抽屉）用 `features/pomodoro/components/FocusStartButton`：只经命令层 `startPomodoroSession({ presetId, target })` / `updatePomodoroBinding` 与共享 hook `useActivePomodoro`，不 import 番茄 timerStore；每次须选预设，主进程不自动挑。番茄页「专注于…」的选择是页面会话态，任何开始入口都带上。
- 日程渲染：`ledger.ts` 的 `absorbFocus` 把专注完整落在绑定事件内的番茄收进该事件画专注条（不设容差，超出即独立成块），绑定由 `usePomodoroBindings` 经 `pomodoro_calendar_mapping` 查得。

### 待办安排与日程编辑

- 任务型日程 = 用户日历里 `calendar_event.todo_item_id` 非空的事件，只经 `calendar-event:create-for-todo`（拖入）或 `todo:create-with-schedule`（快速添加写了时段）产生；`calendar-event:update` 整行更新**不改**该列。识别一律看 `todoItemId`，不按日历名；系统待办日历只剩截止 / 周期（标记）。
- 安排概况用 `useTodoSchedules(ids)`（schedule 域查询，随 `schedule:changed` 失效；待安排面板与待办详情共用），不要为此全量拉事件。
- 待安排面板左缘使用 `ResizeHandle` 调宽（220–480px，默认 248px），支持方向键微调与双击复位；宽度经 `uiStore.todoPanelWidth` 持久化在日程偏好中，缺省或非法值归默认、越界值夹紧。时间线与日程详情抽屉通过同一宽度 CSS 变量让位。
- 可编辑判定统一 `eventTone.ts` 的 `isEditableEvent`（非系统分组日历），表单与周视图拖动共用。拖动手势 `hooks/useEventDrag`：pointer + 指针捕获，阈值内仍是点击（`consumeClick` 判别）；进行中按 Esc 在 capture 阶段取消并消费，属于手势局部消费，不进 `useOverlayDismiss`。
- 待办拖入用 HTML5 DnD，类型常量 `TODO_DRAG_TYPE`（`features/todos/model.ts`），落点与回执集中在 `features/schedule/todoDrop.ts`。待办行的 dragstart、月 / 周网格与当日时间线空档接收的待办 dragover / drop 阻止冒泡，避免全局 react-dnd 取消原生拖动、覆盖 dropEffect 或处理未登记的拖动；dragend 仍正常传播以清理悬停。
- 月视图在网格容器接收待办拖入，按指针坐标确定日期（含邻月及日程覆盖层），松手即建当天全天安排，不改变当前日期或月份；悬停高亮在离开、落下及 dragend 时清除。`useScheduleTodo` 开始时间为 null 时创建全天安排，数字仍创建定时安排；`CreateTodoSchedule` 由命令封装、查询 mutation 与主进程共用，全天落库的起止时间为 null。成功回执包含「全天」及撤销，默认用户日历与跨库写入保护沿用现有协议。
- 删除日程走 `pendingDeleteStore`：隐藏 + Toast 撤销，到时或 ScheduleView 卸载才落库；过滤在 `useCalendarEvents` 里统一做。不得改回「先删再重建」（删除会连带备注 content）。
- 待办详情通过 `todo:update-item-type` 在一次数据库命令事务中切换类型并同步日历。切入周期时按任务 ID 复用已有规则，缺失时创建每日规则；切出周期时保留规则和打卡。
- 日程侧勾选完成待办后必须 `emitTodoMutation`，否则待办快照（待办页、待安排面板）不刷新。

### 提醒

- 截止任务与独立日程按去重后的偏移量列表保存提醒，预设、文案与拆合口径在 `@tau/shared/reminders`（移动端共用）。存储：待办首个提醒仍在 `todo_item.remind_before`（AI 工具、插件等只认单值的写入方照旧读写），其余在 `item_reminder`；日程全部在 `item_reminder`，全天日程以当天零点为基准（「当天 9:00」是负 offset）。改首个提醒的单值写入会经触发器清掉追加提醒，删待办 / 日程同样清理。
- 写提醒只走 `todo:update-reminders` / `calendar-event:update-reminders`（`tables/item-reminder.ts`），先写 `remind_before` 再写追加提醒；界面统一用 `components/ReminderMenu`（勾选不关菜单）。待办列表快照经 `extraReminders` 带出追加提醒，展示用 `todoReminders(entry)` 合并。
- 主进程 `todo-reminder` 每分钟扫描截止任务（含追加提醒）、周期与文档待办、独立日程（`todo_item_id` 为空，待办安排出的日程跟随待办）；通知正文由 `reminderBody` 生成，周期实例与只写了日期的文档待办按全天（「今天到期」），没有截止时间的写「待办提醒」。通知「查看」带 `reveal`，并向主窗口发 `reminder:open`，由壳层 `useReminderOpen` 打开待办页（`selectedId`）或日程页（`eventId`）。

### 文档待办

个人助理任务工具在 `task-assistant` 主进程模块与同名 provider 中承载，随主库和文档待办索引启动。独立待办写入主库，正文待办经内容层节点补丁落盘，共享正文沿用写入权限检查。写入按项校验、事务提交和幂等回执，跨正文与主库失败返回 pending 并恢复。工具与卡片操作支持 30 天持久化撤销，检查后续修改和原位置，不回写整篇旧快照。数据库、日程、正文编号经持久化高水位分配，不复用被删除对象的编号。批量为逐项成功，不承诺全局回滚。工具风险沿用既有权限模式。

正文勾选项可携带 `taskReminder`、`taskRecurrence`、`taskOccurrenceState`、归档与完成时间；它们随正文保存，索引的 `doc_task_attributes` 仅为可重建投影。文档待办关联安排走 `doc_task_calendar_link`，不创建隐藏的 todo_item。工具可按 taskId 增删改和移动同正文子项；正文自身编辑仍是主路径。周期单次身份固定原始日期，改期只改变安排日期；勾选周期正文任务只完成当天实例。副本分配新 taskId 并清除原实例历史。

- 正文里的勾选项（`check-list-item`）是唯一真相源，待办页读索引库镜像 `doc_tasks`：后台模块 `src-electron/main/modules/doc-tasks/`（BACKGROUND）订阅正文写入总线增量重算、连库对账，项目增删改名后只按已存原文重算归属；变化广播 `doc-tasks:changed`，渲染端 `src/hooks/useDocTasks.ts` 按库失效。抽取是纯函数 `src/entity/doc-tasks.ts`（`#项目名` 按完整标题、长者优先；日期正文写带年份的绝对日期，相对词以首次收集时刻为锚不漂移）。
- 勾选项身份是 `taskId`，归 `@tau/editor/extensions/list`：规范化补齐、重复时文档序靠后者换新；不经编辑器写入的正文由索引静默补 id。**不得用协作层 collabId 作身份，doc-tasks 模块不 import 协作代码。**
- 写回正文只经内容层 `ContentTable.patchNodes(db, contentId, patcher, { silent? })`：有编辑会话时 `patchSessionNodes` 在 Y.Doc 上就地 `setAttribute`（元素原位、与并发输入合并、不打断光标与撤销），否则改 JSON 落库并广播；共享内容拒绝写入。需要「按节点改属性」的新入口复用它，不要整篇 `updateContent`。
- 待办页：侧栏子项「文档中」= 页面参数 `id="docs"`（`DOC_TASKS_NAV_ID`），按文档分组；按日期 / 按项目议程把未完成文档条目并入对应段（行尾显示来源）。文档条目在待办页保留勾选、打开原文、转为独立待办、本文不收集入口；标题、日期、项目、删除可在原文或助理工具中修改，两者均回写正文。
- 打开定位 `EntityLocation` 增加 `{ taskId }`：`resolveLocationNode` 在任意嵌套层找到该勾选项，找不到退到首块；`useContentLocation` 与日记 `MomentItem` 共用。
- 数据层在 `src/hooks/useDocTasks.ts`（待办页与正文底部状态条共用，不放 features/todos）。用户选择（本文不收集 / 已转为独立待办）存主库 `doc_task_settings`，不进可重建的索引库；快照与状态条按它过滤。
- `patchNodes` 的 `text` 保留叶子补丁，`paragraph` 在完整段落计算最小编辑再映射到叶子与行内元素（保留格式及并发输入）。项目改名使用主库曾用名与正文归属提示，把 `#旧名` 改成 `#新名`；镜像只负责启动升级时补充此前记录，不再是改名依据的唯一来源。
- 编辑器扩展 `src/editor-extensions/doc-tasks/` 只装在 content kit：勾选项首段的 `#项目` / 日期经扩展装饰（`@tau/editor/api` 的 `DecorationSpec`，ER-055）渲染为胶囊；`#` 候选、相对日期按空格绝对化、胶囊菜单都是改原文文字。项目能力由宿主服务 `IDocTaskGroups`（`src/services/docTaskGroups.ts`）注入，扩展不依赖待办域。日期文案归 `src/utils/dayWords.ts`。
- 正文底部状态条 `ContentEditor/DocTasksStatusBar`：只对声明了编辑身份且可解析为卡片／文章／项目文档／日记来源的正文出现，白板文本和 Notebook 等孤立正文不宣称已收集。

审查修复后的约束（DT-011）：

- 连接正文的 Kit 经列表包 `ITaskIdSource` 让内容来源接管身份，预览不补 id；内容层补齐已有会话时使用稳定初始化键，定位和写回仍只认正文 `taskId`，禁止使用 `collabId`。冻结时暂缓。
- 项目旧名存主库 `doc_task_group_names`，按项目创建时间隔离 id 重用；正文 `taskGroup` 在词仍匹配时保护旧名复用，改词重新解析。连库与增量先恢复正文改名，再抽取归属，失败保留重试。
- 相对日期首次解析以正文 `taskDateAnchor` 固定锚点及带年份日期，安全时写回绝对日期。视图正在编辑时不自动改文字；镜像和胶囊消费同一正文语义，索引重建不能改变日期。元信息补齐不计用户操作，文字变化重算字数并走写入总线。
- `patchNodes` 的 `paragraph` 补丁在完整段落上计算最小编辑，映射到格式叶子和行内元素；不得整篇替换。身份静默补齐也通知视图刷新缓存，避免只读定位使用旧值。
- 调度按库隔离、合并有上限的一秒窗口，初始化补对账已有连接；失败或未补齐的正文不登记完成时间并重试。索引版本 2 首次强制对账。
- 所有 doc-tasks 命令固定发起库，IPC 等待前后校验窗口及连接对象；旧回调不能跨库。项目缓存按库和请求修订管理，切库／只读／停驻后的异步编辑不复活。
- 来源用批量轻表查询，日记带片段 id；已完成条目可打开，已转出项统一隐藏。转出读取当前正文并在事务内幂等登记，复用已转出子项，提交后通知原库日程刷新。
- 扩展装饰可声明 `subscribe(editor, invalidate)`，生命周期由核心清理；正文待办按段落计算完整 Range，胶囊校验 taskId 与原词，项目补全固定原输入范围并用提交守卫。

### 闪卡数据与制卡

闪卡的查询和写入统一在 `features/flashcards/queries.ts`：查询键按数据库分区，命令经 `bindDatabaseCommands` 绑定原库；卡组选择只读轻表；在途写入只回写原库缓存，切库后旧回调拒绝再写，跨窗口通知失效对应库。复习页挂载时按当前快照与页面时钟派生待复习队列，并将总数回写侧栏角标缓存；其余场景角标仍只读卡组轻表，不为计数加载全部卡片正文。快照加载失败记录所属数据库与原始异常（不记卡片正文）后抛给 react-query 管理重试；首屏失败展示具体原因与重试入口（不能只显示固定文案），已有快照的后台刷新失败保留当前内容。

卡片、文章、项目文档与漫步的手动/AI 制卡统一走 `services/flashcard-creation.ts` 的 `openFlashcardCreation`，由 AppShell 常驻的 `features/flashcards/FlashcardCreationHost` 承载选卡组、编辑、生成预览与草稿编辑，来源页面不挂弹窗。请求固定内容快照、数据库与可选取消信号；同一窗口仅一个制卡会话，关闭回传已保存记录；切库或插件停用只清理请求，不撤销已提交写入。生成请求按版本丢弃迟到流，重置、切库与卸载释放短任务。

插件 SDK 的 `context.flashcards` 经 `app/plugins/flashcards.ts` 注入：查卡组走 `flashcards:read`，直接创建与自动保存走 `flashcards:write`（异步准备后与每张卡写入前复核授权），`openCreate` 要求用户操作、窗口内保存由用户确认。AI 制卡只走通用 `context.ai.requestCapability("flashcardGeneration")`，无闪卡专用授权、缓存或模型分配分支；`generate` 只返回草稿，自动保存逐项返回 cards/failed，取消或拒绝授权停止后续写入。插件写入后必须经 `invalidateFlashcardViews` 刷新来源窗口原库查询（主进程通知排除来源窗口），批量部分提交后即使取消/失败也刷新。创建结果经 `services/flashcard-results.ts` 转 SDK 草稿结构：自定义引用用 `customContent`、已有正文用不透明 `contentRef`；插件输入经 `context.content.read` 核对正文身份与读取授权（本插件自有正文免业务权限）后映射内部 `contentId`，公共引用编码只在 `utils/plugin-content-ref.ts`。填空题的节点标识与唯一性由 `editorModel.validate` 统一校验。作者用法见 `plugins/tau-plugin-template/docs/flashcards.md`。

### AI 新建、关联、删除与移动文档

桌面 AI 默认在卡片、文章和项目文档三个工具组提供 `create_card`、`delete_card`、`create_article`、`delete_article`、`create_project_document`、`delete_project_document`、`link_to_project` 与 `move_project_document`。这些工具都声明 `write`，在异步解析 Markdown 前绑定会话资料库及取消信号。新建返回实体 ID 和正文 ID。卡片和文章使用已有创建、删除命令，项目文档经 `project:mutate-document` 在同一事务内校验目录并写入，成功后刷新活动原库的相关视图。

项目位置由项目 ID 和父文档 ID 指定，父文档 ID 为 0 表示项目根。移动以目标列表最终的零基序号定位，缺省追加。删除返回原位置和 `stillMounted`，移动返回最终位置。关联卡片或文章按目标子列表、来源类型及实体 ID 匹配已有引用并核对正文 ID。关联项目文档按目标子列表与文档 ID 匹配，复用同一条目和子树。首次关联追加到末尾并返回 `changed: true`，已有挂载返回原位置和 `changed: false`。移动拒绝陈旧源位置、重复目标和越界序号，移动和关联均拒绝新建环。目录与正文持有的细则见 [正文存储](/docs/architecture/content-storage.md)。

### 卡片库

AI 的「卡片工具」由 `mcp/providers/card-tools.ts` 默认注册：`set_card_pinned(cardId, pinned)` 显式设置或取消置顶，`update_card_tags(cardId, tags)` 整体替换标签（空数组清空，名称去首尾空白与重复项）；两者均声明 `write`，按现有工具权限审批。工具只接受卡片实体 ID，数据库与取消信号取执行上下文，经 `bindDatabaseCommands` 调用原库 `patchScopedCard`；只写对应元数据字段。成功后复用 `features/cards/cache.ts` 单卡并入原库缓存，仅原库仍为活动库时发布本窗口卡片更新事件，其他窗口沿用主进程广播。

`features/cards/queries.ts` 按 `["cards", databaseName, "all"]` 隔离缓存，仅数据库就绪时读取；列表走主进程轻表（content 为截好的预览块），单卡全文按需经 `["cards", db, "detail", id]`（预览弹窗、导出与演示动作）。写入与卡片创建/更新/删除事件按 id 单卡并入缓存（事件载荷即全量卡片，跨窗口按 id 回查后广播），不做整域失效。`cards:*` 命令在主进程校验数据库身份，元数据只提交字段补丁并在当前记录上合并，拒绝跨库或已删除卡片写入。CardDatabaseView 经必传 `onUpdateCard(id, patch)` 接入宿主写入；连接列数据走 `useContentLinksByContentIds`，筛选结果只用于列表展示；时间组用本地自然日/周一周/自然月。标签持久化为名称字符串，表格保存标签补丁时按列选项把选项 ID 转回名称，不能保存通用多选组件的 UUID。

卡片墙与表格共用预览：卡片数据就绪即可显示弹窗，`ContentEditor` 在正文会话就绪前显示 `Loading`；读取失败展示错误可重试；关闭预览保留正文/标题/标签到 Dialog `onAfterClose` 再清理，避免退场中高度塌缩。卡片墙的普通与置顶卡共用 `ContentPreivew`，默认静态展示前 3 块，单卡最多遍历 120 个节点、输出 1200 字符、深入 12 层；保留基础文字格式，媒体显示摘要标识，公式与代码展示源码，未知块保留可读子内容或占位。摘要不创建 Editor、不执行插件组件、不读取引用全文，快照变化直接更新；列表按 contentId 更新正文与字数不重拉。

视图与排序由 `features/cards/preferences.ts` 按库持久化；视图切换经 `usePageBreadcrumb` 挂标题栏面包屑。筛选只剩标签条件（卡片墙/列表/表格共用同一会话查询，数据库视图将其与内置筛选叠加、会话条件不写入用户视图）；卡片库不设页内搜索——语义检索走命令面板，空态文案引导同一入口。卡片详情页（card-detail，match params 按 id 去重，连接 chip 经栈机异参原位更新）数据 = `useCardDetail` 单卡全量（含 linkCount），正文由 ContentEditor 文档会话持久化，元数据即时 patch；显式连接不经卡片元数据，存主库 `content_links`（按 contentId 绑定），脉络浮层与 ⋯ 菜单都走 `content-links:add/remove`（原子双边）。播客由插件 `tau.podcast` 经对象动作与详情区块提供，宿主不再持有卡片、文章、项目文档的播客。

**卡片数据库视图**：`CardDatabaseView` 与专属链接插件只服务卡片页，通用 Database 留共享层。视图、筛选/排序/分组、列宽按库持久化（`databasePreferences.ts`，tau-card-database-views，库名去 .db 后缀；只读取当前版本，每个新库从默认视图初始化，不继承旧模板）；实例按库重建，旧实例迟到回调只持有原库动作不认领新库；跨窗口配置经 `view.receive/remove`、`views.reorder`、`column.resize` external 命令接入，不监听 props 覆盖内部状态。宿主经 `dispatch(command, "external")` 接入确认更新（`rows.apply` 提交字段差量、`rows.receive` 提交确认快照），变更事件携带 user/external 来源，保存回调只消费 user 事件。

### 脉络（features/context）

AI 的「内容连接工具」由 `mcp/providers/content-link-tools.ts` 默认注册：`add_content_link(fromContentId, toContentId)` / `remove_content_link(fromContentId, toContentId)` 直接按 `contents.id` 增删双向显式连接。两者均声明 `write`，数据库与取消信号取执行上下文，经 `bindDatabaseCommands` 调用 `content-links:add-by-content-id/remove-by-content-id`；主进程校验两份正文存在并规范化无向边。返回 `changed` 区分实际变更与无需变更，正文内联引用不经此工具删除；连接列表和脉络缓存沿用主进程按库广播失效。

卡片、文章、项目文档详情的元信息行挂 `ContextBadge`（文章经 ArticleHero 的 extraMeta 插槽），数据走 `useEntityContext(ref)` → 主进程 `entity-context:get`，分区与数据源：

- **连接**：content_links 显式连接 ∪ 正文内联引用（去重），内建于浮层、四种内容实体通用；添加/解除由脉络域的 `ContextLinksSection` + `ContentSelectorModal` 承载（四实体互连，按 contentId 排除自身与已连）。
- **被引用**：索引库 `entity_refs`，由后台 `entity-context` 模块连库对账、经正文写入总线增量维护。
- **共用正文**（含 Notebook 笔记投影）。
- **被关联**：按自身与共用正文身份查 `plugin_links` 入边（`to_created_at` 须等于目标当前创建时间，孤儿与自环不算），类型名与图标经 `useEntityKindMeta` 取插件声明；数字 ID 引用类型的创建时间查询在无业务依赖的 `tables/plugin-ref-kinds.ts`（脉络与 plugin-refs 共用）；移动端 `entity_context.rs` 的 `plugin_links_of` 同口径，改规则两端一起改。
- **来源 / 衍生**：主库谱系 `entity_lineage`，只记复制、从对话存下、剪藏等推导不出的事实，写入经 `recordLineage`，弱引用不级联删除；闪卡、投影、待办关联在查询时推导。
- **白板使用**：索引库 `whiteboard_refs`（按元素类型解析，连库对账 + 写事件防抖对账）。

「把 A 的内容复制/存成 B」的入口必须记谱系（共用正文投影不记）。插件写入（plugin-entities/plugin-links/plugin-transaction/plugin-data:restore）与正文连接写入已在脉络写事件白名单。变化广播 `entity-context:changed` 按库失效；点击经 `features/context/open.ts`；其他域加分区复用 `ContextSection` / `ContextRow`。

**外部材料**（摘录、PDF 标注、剪藏）：地址统一为 `MaterialRef`（`src/entity/material.ts`，由谱系端点 LineageNode 收纳、不扩 EntityRef），展示信息由主进程 `material:resolve` 解析，打开经 `services/open-material.ts`；材料转卡片记谱系 `excerpt_of`，源端删除后保留引文不可打开。摘录按提供方驱动：展示只用提供方名 · source_title · location（`entity/excerpt/display.ts`，主进程/索引/移动端同口径），打开交给 `services/excerpt-providers.ts` 登记的提供方，未登记回落 url；不按 `source_type` 写分支，新来源 = 新提供方（内置用保留名，插件用插件 ID），写入经 `ExcerptTable.syncSource / patchSource`。材料动作清单单一来源 `services/material-actions.ts`。新增材料类型同步四处：`MATERIAL_KINDS`、`tables/material.ts` 解析、`material-index.ts` 索引候选与 `search-details.ts`、`open-material.ts` 打开目标。白板元素指向正文实体存 `entityRef: {kind, id}`，直接持有正文存 `contentId` 并在 `src/entity/whiteboard-refs.ts` 为该类型加 case；改白板/引用解析规则必须把 `whiteboard-indexer.ts` 的 `WHITEBOARD_REF_VERSION`（引用索引 `REF_INDEX_VERSION`）加一，否则已索引数据不重解析。

**「相关」分区**（`entity-context:related`，浮层打开时才取）：节向量均值前 50 近邻，排除已有关系（自身/共用正文/显式连接/引用/谱系两端，清单在 `context-related.ts` 的 relatedExclusions），相似度阈值 `index_meta.related_similarity_threshold` 按嵌入指纹与向量规模重抽样，最多 5 条（标题 + AI 要点，不显示相似度，不计关联数）；内容行可直接添加连接，连接后因已有关系移除。

### AI 元信息与洞见

**正文元信息**：主库 `content_ai_meta` 按 `content_id` 存每份卡片/文章/项目文档正文的 AI 标题、要点、概念、主张（带 schema_ver 与生成时的 MinHash 指纹），只由后台模块 `content-ai-queue` 写入——功能槽 `contentMetadata` 配上即处理全部、清空即停，无其他开关；连库对账 + 正文写入总线静置 10 分钟，纯文本相似度低于 `DIGEST_RECOMPUTE_THRESHOLD`（`entity/text-digest.ts`）才重算；正文删除同事务删元信息，变化经 `notifyExternalWrite("content-ai-meta:changed")` 补发（载荷带 contentIds）。卡片标题一律经取标题函数：主进程 `contentTitles/contentTitle` 按批 LEFT JOIN（禁止逐条请求），渲染端 `utils/card-title.ts`；只用于标题场合（面包屑、连接行、数据库标题列、导出与窗口标题），摘要/预览仍取正文。AI 标题仅卡片使用（文章/项目文档用用户标题），不提供手动改；元信息变化由 `patchCardAiTitles` 原地补缓存不整表重拉。进度经 `content-ai:status`。

**洞见视图（文档层）**：详情页元信息行「✦ AI 洞见」（功能槽 `contentInsights` 没配不出现），点击后正文就地进入洞见视图，平时正文不出现洞见。接入统一走 `features/insights/useInsightsView` 的四件：`button`、`report`（正文上方报告卡）、`frame(children)`（定位容器、段尾淡注、气泡、逐条看操作条）、`editorProps`（decorate + leafWrapper）。分析只在点击或重新分析时由主进程 `content-insights` 做一次（本地向量宽候选 + 一次模型调用 + 原文片段逐字核对），结果与处理状态存 `content_ai_insights`；标记 = 编辑器装饰不改正文，「连接」把片段包成 content-link。点正文或开始输入即退出；Esc 经 `useOverlayDismiss` 分层退出。新实体接入照这四件接线，不在详情页自建洞见状态。

**主题与全局层洞见**：后台模块 `topic-insights` 沿知识地图「子主题 → 主题 → 全局」只读元信息分层生成，结果与处理状态存 `knowledge_ai_insights`；按变化量三档重算（<10% 不动、10–40% 增量、≥40% 或连续增量 3 次完整重写），全局每 6 小时最多一次，元信息覆盖率 ≥80% 才开始，地图过时先 `knowledge-map-builder.ensureFresh`。主对话的用户提问作为 chat-prompt 向量进索引库（只服务「问了但没写」，不进全文与检索结果，向量检索显式排除）。三个落点：① 知识地图标题行（报告卡在筛选行下，标记经 LinkGraph overlay 画覆盖层，页面参数 `insight` 打开即点亮）；② 今日页「继续」段 InsightCard（直接展开列表默认 2 条，每条带理由与证据——原话打开那次对话、笔记 openEntity 打开到命中块）；③ 项目详情回顾（项目名旁「✦ 回顾 / 结项回顾」，报告卡在当前文档上方，文档树条目的 ProjectReviewSlot 长出「可能属于这里」与「还薄」= 引用型条目，参数 `review=1` 打开即展开）。连接：两端都是卡片时主进程一个事务写 content_links；有长文时经 `services/insight-focus.ts` 登记一处再打开。主动作按类型：呼应/重复 → 连接；同一思路、缺一环、问了没写、还缺 → 写成卡片（`services/pattern-card.ts` 建空卡连上涉及的笔记，详情真正关闭仍为空则撤回）；矛盾与可以继续想 → 聊一聊（`services/insight-chat.ts` 停靠栏开对话预填提问与引用）。处理状态只有 open/linked/dismissed。vec0 按 prefixed_id 过滤不走索引，读一批笔记向量要合成一条 IN 查询，不逐个查。

**长文按节检索与定位**：长文按节切块（`entity/sections.ts`：出现两次以上的最高级标题断节，1200 字再切、80 字短节向后合并；卡片/摘录整篇一节，超 2000 字仍按长度切），嵌入文本带「实体标题 › 标题路径」；节信息存索引库 `content_sections`（按实体 + update_time 分版本，全文与向量各引用自己的索引版本，写入后清理无人引用版本）。检索按块多取再按实体去重；知识地图近邻用实体节向量均值查一次。切块口径变化必须升 `entity/chunk-version.ts`（拼入主内容指纹静默重嵌）；重嵌恢复以 `main_content_building_fingerprint` 记构建口径，仅全量成功才推进完成指纹，部分失败/中断增量续跑、保留成功向量。`openEntity(ref, { at })` 的 at 是顶层块序号，编辑器就绪后滚动与闪烁，越界退文首；日记先按 moment 定位条目；对话页参数 entry 是一次性导航意图（不在当前分支只提示不替用户切）；卡片/摘录/PDF 标注命中不带打开定位。对话 `:ref` 的 block 由 `@tau/shared` 的 remarkDocumentReference 输出。不提供「正文抽成卡片 / 选区转问题」类输出转输出入口。

### 创作模式

文章与项目文档详情页参数 `layout=compose`（省略 = 普通详情），元信息行 `ComposeModeToggle` 开关，切换走 `navigator.push` 栈机原位更新，编辑器不重挂（正文栏子树两态键控不变；正文栏宽度是全局偏好，窄窗收起白板）。素材板 = 一页 `white_board_contents` + 主库 `compose_boards`（按 content_id 绑定，存写作意图与「不要」），**不建 white_boards 行、不出现在任何白板列表**；正文删除经 `ContentTable.deleteContent` 释放，脉络「被使用」显示为「创作白板」并带 `compose` 打开回创作模式。召集资料由 BACKGROUND 模块 `compose-gather` 做（意图嵌入查节级近邻 + 概念补召回 → 槽 `contentInsights` 一次调用分组；`compose:gather/cancel/gather-phase`）；段落亮起只比白板资料（`compose:paragraph-similarity`，不调模型）；建板先把脉络连接摆成「已关联」（不记「不要」），召集同样排除已关联。白板 → 正文只有卡面「引用」小签（`features/compose/insert.ts` 插入/撤掉 content-link），无拖拽。两栏经 `features/compose/session.ts` 会话 store 共享状态；嵌入白板的宿主定制走 DocumentHostContext（allowDock、cardAccessory），白板包不认识创作模式。素材板资料不进脉络分区：经 ContextBadge 的 extra 插槽放 `ComposeBoardEntry`（`compose-board:summary` 计数）。检查连接复用洞见视图的 getSeed / reportExtra / targetAction / copy。项目文档详情（EditProjectItem）同样接入，其目录在创作模式下让位，白板栏在文档区右缘展开。

### 知识地图（features/knowledge-map）

全局页面 `knowledge-map`，入口在标题栏（`KnowledgeMapToggle`，详情页点击带 focus 节点键），不进侧栏；命令面板有页面命令。数据 `useKnowledgeMap` → `knowledge-map:get`（离线地图 + 节点展示信息），页面 `toGraphItems` 转 LinkGraph 的 GraphItem。节点 = 卡片、未删文章、非引用型且有正文的项目文档（共用正文只出一个）；边 = content_links 显式连接 + 引用索引 entity_refs；语义近邻有入度上限（防长文成枢纽）。图谱实例只按节点键、下标与有效连线做拓扑比较（标题变化不重建画布）；高亮差量提交，拓扑变化在现有实例上更新并保留位置与视口。筛选只降淡未命中；生长动画与里程碑在 `milestones.ts`。

### Database 共享层接入

查询生成的独立数据库与正文查询块使用公共 QueryDatabasePanel；通用包的 dataset.receive 原子接收列与行，allowViewEditing 允许只读结果配置列宽、列序与汇总，hiddenColumnIds 按视图保存。查询协议、只读边界与刷新见[实时查询数据库](/docs/architecture/query-database.md)。

**不受控边界**：`data/columns/viewConfig` 只是初始值，内部 store 管理编辑、选择与视图配置，不监听这些 props。查询只有一个执行入口：`core/projection.ts` 合并持久化 viewConfig 与会话 query（text/filters/searchResults/grouping），数据、查询或配置提交时计算一次投影，选择变化不重算；注册视图消费投影，键盘导航消费相同 rowIds/columnIds。分组由视图定义的 `grouping` 声明（缺省通用 groupBy；`"none"` 禁用；`"view"`/函数形态由视图自带），projection 不出现视图类型字符串。拖拽传记录 ID 不传过滤后索引；排序生效时禁止手动行重排。ViewTabs 工具栏：搜索折叠图标钮（清空+失焦收回）+ 筛选/排序/分组胶囊钮（激活计数），三面板保留暂存逻辑，日期分组带二级粒度。

**公式列**：`deriveFormulaRows` 在投影开头派生，四种视图与筛选/排序都消费派生行；store 行与保存回调不含公式值，行详情单独派生。表尾汇总消费筛选后 `projection.rows`，配置在 `viewConfig.footer`（宿主 normalizeConfig 白名单已登记）；字段经 `CellPlugin.valueType/toScalar/formatScalar` 参与运算，引擎不认识具体插件；桌面扩展经 hook 插槽 `useFormulaAssist` 提供对话模型（未配置则构造器无 AI 输入框）。

**行详情**：`RowDetailModal` 是 Dialog 双栏（左标题+正文，右属性栏：封面 = 第一个有图列，加载中/失败露出渐变底），容器 <960 退化为单栏（同一棵树经容器查询与 display:contents 重排，编辑器不重挂、草稿不丢）。入参只有 `rowId`，行数据从 store 实时读；四个视图经 `hooks/useRowDetail` 管开合（宿主可传 `onRowDetailOpen` 接管）；上一条/下一条（J/K 让行编辑与输入法）按 `projection.rowIds`，当前行被筛出不显示位置。属性实时保存（与表格单元格同草稿+校验+transformBeforeSave 协议）；文本主列标题失焦提交，其他主列沿用字段编辑协议；关闭/切换时组件卸载补存并写回所属行（rowId 组件自持）；无 `detailContentId` 的行正文在离开时才 `createPendingContent`。空属性折叠只折叠带 Editor 的字段，折叠集合进入行时定格。

**列表统计失效**：数据库列表行数与学习项目资料数由列表查询聚合——`commands/data-table.ts` 在携带 rows 的更新成功后失效 `["databases","list"]`；`commands/vibe-learning.ts` 在资料创建、笔记转资料实际新增、资料删除成功后失效 `["vibe-learning","list"]`（覆盖详情、内嵌表格与生成产物入口），笔记转资料落库即通知不等索引入队，失败不通知。

### 今日页面板与统计

**面板布局**：hero（问候与数字）固定非面板；内置面板登记在 `panels.ts`（固定 id/title/size/component，数组序即默认布局，ID 随库保存不要改名）。布局 = 有序 `{id, hidden}` 列表存主库 `home_panel_layout`（整份读写，乐观写失败回滚；保存过的顺序在前、未注册面板保留位置、新面板按默认序追加）。`HomePanels` 是 flex-wrap 流式容器：wide 占整行，compact `flex-[1_1_340px]`，同行等高不预设栏数；组件返回 null 外层不占位。编辑模式（「调整首页」按钮；编辑时 hero 右侧数字换成提示与「恢复默认」= 保存空布局 /「完成」，不另起提示条；Esc 退出）内容 `inert` 但不变淡。拖拽用指针事件（不用 HTML 拖放 API，Electron 里原生拖放可能起不来、连 dragend 都不来）：面板克隆成浮起卡片跟手（整行缩到 560px 宽），原位留 `[data-home-panel-slot]` 空位，拖动中的顺序是组件内 `preview`，其余面板经 motion `layout="position"` 实时让位（`FadeScroll layoutScroll`）；命中按布局位置 `offset*`（不受让位 transform 影响，紧凑面板看左右半边、整行看上下半边，让位后 10px 滞回防抖），松手才保存，Esc 取消回原序，退出编辑丢弃进行中的拖动，靠近滚动区边缘自动滚动；把手方向键移动并把焦点还给把手；隐藏面板区（点击恢复/拖回/拖进即隐藏，其上缘以下都算拖进）。回顾段保留自己的标题行与时间窗，懒加载滚动根经 `HomeScrollRootContext`。

**插件面板**：`context.home.registerPanel` 登记为 `RegisteredPluginHomePanel`（布局 ID `plugin:<pluginId>:<id>`），排在内置面板之后作默认序；宿主画 Panel 外框与标题，可选 `action` 画成标题行右侧的 PanelAction（回调出错只弹通知），插件组件包在 RecoverableBoundary、UiProvider、PluginComponentScope 里只渲染正文，正文容器为空时外层隐藏；运行时其他变更不重挂插件面板；插件停用后位置保留。

**漫步原文**：漫步页与首页牌堆的正文使用只读 `ContentEditor` 按 `contentId` 订阅当前正文会话，本地编辑与协作变化经现有文档订阅同步；会话就绪前显示 `Loading`，不展示抽取时的旧正文。足迹与抽取原因保留，正文变化不重抽、不重复记 seen；制卡从当前只读编辑器读取正文。首页只挂载当前牌与下一张牌的正文订阅。

**漫步牌堆**：`useTodayWalkDeck` 按 `["home","walk-deck", 本地日期]` 查询（跨零点自然换新天）；翻牌与重抽乐观写回缓存，落库走 `random-walk:daily-advance`（绝对 cursor）与 `daily-reroll`；当前牌首次露出 mark-seen。打开统一走 `features/walk/open.ts`；「从这里继续走」push `walk` 页带起点。池为空整块不渲染；`prefers-reduced-motion` 跳过动画。

**统计页**：`useStatsSnapshot(range)` 按 `d30/d90/year/all` 独立缓存——趋势/环比 = `getAllStatistic` + 日记全量快照差分（`utils/statistic.ts` 的 diffSeries，与今日页共用）；总量/构成 = 当日快照存量 + 日记字数 + 项目轻表字数（构成四分类，切窗口 keepPreviousData）；热力图/streak = `getCalendarHeatmap(今年)`；记忆保持 = 主进程 `flashcard:review-stats`（评分四档轻松/记得/模糊/忘记，保持率 = (normal+easy)/total）；专注节律 = `listPomodoroSessions` 渲染端分 24 桶聚合。热力图扫描在主进程每批 ≤1000 行、批次间让出事件循环、同年在途合并，右开区间按本地年。

**今日页数据契约**（`features/home/queries.ts`，types.ts 为契约源）：reviewDueCount ← 卡组 Σ dueCount；todos ← 未完成待办（逾期>今日排序取 3）；events ← 当日日程；recentEdits ← 卡片+文章日期范围渐进窗口（14→30→90→365 天凑满 12 即停）+ 文档/项目轻表 + 最新日记混排取 12；focus/weekly ← 番茄今日与本周聚合；todayStats/weekly/trend ← 全量快照差分；heatmap ← 全年每日操作数。并行 `Promise.allSettled`，单项失败降级空值不阻塞整页。数据入口一律 react-query（带 staleTime 与窗口聚焦刷新），`refresh()` 即 refetch。新增区块：types.ts 加字段 → queries.ts 分项函数 → 面板组件登记 panels.ts。

今日与回顾快照共用 `withSnapshotTimeout`，等待超过 30 秒才记录超时日志并拒绝；请求成功或失败后清除定时器，保留原返回值或错误。超时只结束等待，不取消底层 IPC 请求。

### 闪卡复习的职责边界与写入协议

- `features/flashcards/views/FlashcardsView.tsx` 负责页面编排；会话流程、快捷键、延迟删除和沉浸侧栏分别位于 `hooks/`。侧栏折叠由副作用管理，Activity 隐藏时恢复、重新激活时再次折叠。
- `components/review/` 按题面、答案、评分、AI 评判、资料抽屉与完成摘要拆分；编辑弹窗只管理表单生命周期，内容区与属性区独立成组件，初始化与校验集中在 `editorModel.ts`。菜单使用渲染函数直接返回 Menu 子项，保留组件库对声明树的键盘导航解析。
- 作答输入框隔离空格、字母、数字和撤销等按键，外层复习快捷键同时检查事件目标与当前输入焦点；空输入框也不触发复习撤销。问答保留 Ctrl/⌘+Enter 提交、普通 Enter 换行，填空保留 Enter 跳空/提交，输入法组合期间不提交；Esc 仍交给页面浮层仲裁。
- 暂停与移动在主进程写入成功后更新缓存；失败保留原状态。评分、撤销和暂停互斥，写入期间禁止跳过与结束；AI 评判通过请求版本丢弃换卡后迟到的响应。输入框不自行拦截 Esc，退场统一经页面浮层仲裁。
- `flashcard:submit-review` 在事务中更新排期并写入复习记录，返回卡片及 `undo` 凭据（记录 ID、主进程读取的评分前排期）。`flashcard:undo-review` 只接受仍指向最新评分的凭据，校验、删除记录与恢复排期在同一事务中完成，拒绝旧凭据与重复撤销。

闪卡制作与简答题答案评判共用 `llmUsageSettings.flashcardGeneration`，设置中只显示「闪卡」，判分的用量也归入该功能。提示词、结果类型与 JSON 校验由 `@tau/ai/flashcards` 与移动端共享。`user-setting.ts` 在设置加载及提交时幂等合并旧 `aiJudgement`：已有闪卡分配优先，未分配时承接旧判分模型，然后删除旧键；加载升级必须成功落盘才发布快照，失败允许重试，不保留运行时双模型回退。历史用量中的旧判分标识继续可读。

### PDF 列表、阅读页与阅读状态

- `features/pdfs`：列表页 `pdfs`（封面 / 列表排布，照抄 weread 书架结构）+ 阅读页 `pdf-detail`（params `pdfId`）。列表数据只走 `pdf:library`（Pdf 行 + 标注数 + 缩略图 + 本地文件是否丢失，主进程一次聚合）与 `pdf-index:status-batch`（只查已有索引库；不要逐个调 `pdf-index:status`，它会为没建过索引的文件新建库）；有文件在建索引时状态查询 3s 轮询。
- 阅读状态（`last_open_time` / `last_page`）只经 `pdf:record-open` / `pdf:record-page` 写，**不改 update_time**：阅读器以 `pdf.id + updateTime` 作重载键，用 `update-pdf` 写进度会让阅读器整个重挂载。页数由缩略图生成时顺带写入（`pdf:save-thumbnail`），`pageCount == null` 即「从未生成过缩略图」。
- 缩略图在渲染端用 pdfjs 生成（`features/pdfs/thumbnails.ts`，懒加载 pdfjs + worker），主进程落盘到 `<编辑器目录>/pdf-thumbnails/<库名>/<id>.webp`；列表页只为本地文件补生成，远程文件等打开阅读页、文件缓存到本地后再生成。
- 阅读器（`features/pdfs/reader/`）：embedpdf 引擎。`PdfReaderView` 由宿主注入文件（`usePdfFile`）与索引（`usePdfIndex`）——阅读页要与对话栏共用；`PdfReader` 独立使用（项目里的 PDF 条目，无对话，左面板开关放进 HUD）。版式：左面板与对话栏是纸面两翼，栏头同为 44px（左面板页签是文字按钮，不用 Segmented），阅读区是比纸面下沉一档的圆角「阅读井」（surface-hover 底 + line-2 内描边，上下留内边距），PDF 页面落在井里。页面上的交互在 `ReaderLayout` 编排，每页叠加层（书签 / 查找命中 / 跳转闪烁 / 区域标注框 / 页边笔记图钉 / 浮动工具条 / 笔记卡）经 `ReaderContext` 取状态；文本标注的工具条挂在引擎 `AnnotationLayer` 的 `selectionMenu`。阅读区视口不接边缘渐隐（井自带上下内边距）；左面板缩略图列表是引擎组件（ref 被它占用），经 `data-pdf-thumbs` 取元素接 `FADE_SCROLL_CLASS` + `useEdgeFade`；对话栏拖宽用 `@tau/ui` 的 `ResizeHandle`（与壳层停靠栏同一件）。**页内浮层必须带 `overlayProps`（`data-pdf-overlay`）**：引擎在页面元素上挂原生指针监听，只有登记过的排除属性才不会把点浮层当成页面点击（清掉选区、开始新划线）。
- 标注数据（`reader/data.ts`，react-query 按库分 key）：写后直接改缓存、标注数变化才失效列表；同一引擎标注的写入串行。引擎事件 ↔ 记录由 `useAnnotationSync` 同步（导入引起的事件跳过）；区域标注不进引擎，由叠加层画。颜色：文本标注以 PDF 对象里的十六进制为准（`COLOR_SPECS[*].pdfHex`，属于文件数据、不随主题），界面色块映射主题数据色 `tag-*`；外来颜色经 `colorFromHex` 按最近距离归档。新建只给高亮 / 下划线 5 色，旧的波浪线 / 删除线 / 粉色照常显示与编辑。
- 其他域引用 PDF 一律经 PDF 域：选择已有 PDF 用 `features/pdfs/components/SelectPdfDialog`，建记录用 `features/pdfs/queries` 的 `useCreatePdfRecord`，读单个 PDF 用 `usePdfDetail`，阅读用 `reader/PdfReader`——不要另建 PDF store 或卡片（项目域的 `usePdfsStore` / `SelectPdfModal` / `PdfCard` 已删）。
- 对话（`features/pdfs/chat/PdfChatPanel`）：`useScopedChat({ scope: "pdf-chat", domainRef: String(pdfId) })`，页面专属工具经 `usePdfChatTools` 注册到 toolScope；「问 AI」的引用经 `ChatContainer` 的 `composerAccessory` 显示成 chip、`prepareUserContent` 在发送时并进消息（`annotationModel.applyQuote`）。阅读页对话栏的开合是本机偏好（`readerPrefs.chatOpen`），经 `useOwnAssist` 接管 Ctrl/⌘+J。

### 驾驶舱列表排布与打开记录

- 项目 / 数据库 / Notebook 三个列表页共用 `features/shared/cockpit`：`EntityCockpit` 承载纸面、工具栏（`CockpitToolbar`：排序 + 视图两个「按钮 + Menu」）、网格时的「最近打开」续读行、全部区（网格卡或行式列表）、归档折叠段与新建 / 编辑 / 删除弹层；条目三形态在 `EntityCards`。模块只提供 `CockpitItem[]`（含 `createTime / openedAt / lastItemTitle`）、文案与身份色，不另写列表组件。
- 排布与排序是本机偏好，按 `prefsKey` 分模块存（`prefs.ts`，persist key `tau-cockpit-prefs`）；排序与时间展示是纯函数（`model.ts`），置顶在任何排序下都排最前。
- 打开记录各模块一条 `*:record-open` 命令，由详情页的 `useRecord*Open` 触发，**不改 update_time、不记 operation**：
  - 项目：`project:record-open`（进入或切换文档；不带 `itemId` 只刷新时间、保留上次文档），读取走 `project:open-states`（独立 queryKey `["projects","open-states"]`，记录后只失效这一项），`useProjectsSnapshot` 合并成 `openedAt / lastItemId / lastItemTitle`；从列表打开时有 `lastItemId` 就带上它定位。
  - 数据库：`database-item:record-open`（进入时），`database-item:list` 直接带 `openedAt`。
  - Notebook：`vibe-learning-project:record-open`（随 `VibeLearningView` 的 `opened` 变化：资料 / 笔记记为上次条目，其余只刷新时间），`vibe-learning-project:list` 直接带 `openedAt / lastItemTitle`。详情页恢复仍读本机 `vibe-learning-opened-<id>`，数据库记录只供列表展示。

### 文章 / 卡片库的列表排布

AI 的「文章工具」由 `mcp/providers/article-tools.ts` 默认注册：`set_article_pinned(articleId, pinned)` 设置或取消置顶，`update_article_tags(articleId, tags)` 整体替换标签；参数校验、标签清理与写操作声明和卡片共用 `entity-metadata-tools.ts`。数据库与取消信号取执行上下文，经 `bindDatabaseCommands` 调用 `articles:patch-scoped`，主进程校验库身份与文章存在性，并在当前记录上合并元数据；置顶沿用独立置顶命令，不改变编辑时间。成功且原库仍为活动库时回填文章详情、失效文章分页与标签计数，并发布本窗口文章更新事件；其他窗口沿用主进程广播，切库后的迟到结果不更新新库缓存。

- 通用控件在 `features/shared/list/ListControls.tsx`：`CommandMenu`（工具栏「按钮 + Menu」）、`LayoutMenu`（网格 / 列表）、`SortHeader`（列头排序，每列方向固定）、`ListTags`（两枚 + `+N`）。驾驶舱的 `CockpitToolbar` 与列表列头也用它们。
- 卡片库：`CardsViewMode` 增加 `list`（速切器顺序 卡片墙 / 列表 / 表格），`CardListView` 平铺行、定高虚拟滚动、列头吸顶；排序（创建 / 更新 / 字数 / 连接，置顶在前；连接数来自轻表 `linkCount`）是 `listModel.ts` 纯函数，在内存全集上排。行标题 AI 标题优先，没有时取首个非空块，摘要取其余块（`cardListText`）。点行打开预览弹窗，操作复用 `CardActionMenu`。
- 文章：工具栏 `LayoutMenu` 切排布，偏好在 `features/articles/preferences.ts`（本机，不分库）。网格仍按更新时间分月；列表平铺 + 列头排序（字数 / 更新 / 创建），排序经 `get-article-page` 第 5 个参数 `sort` 下推主进程（白名单映射 ORDER BY，非自有键回落 `updated`），**调用方必须显式传**——主进程包装层在参数尾部追加命令上下文。列表一页 30 条（网格 12），首屏未填满时直接续页。条目操作（置顶 + ⋯）收口 `ArticleItemOps`，网格卡与列表行共用。不提供标题排序：SQLite 按码位排中文，分页在主进程，前端无法补救。

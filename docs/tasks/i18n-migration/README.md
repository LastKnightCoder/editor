# 存量界面三语迁移

状态：进行中
目标：按完整功能路径，将宿主与官方维护组件的界面文案逐步迁移为简体中文、繁体中文与英文，保持既有业务行为和用户内容。

## 需求与已确定边界

- 语言为 `zh-CN`、`zh-TW`、`en-US`，支持跟随系统；港澳台与繁体文字体系匹配繁体词典。
- 词典使用独立 JSON 文件，按模块和语言拆分；TypeScript 只导入和注册。应用、公共包和插件分别维护自己的词典。
- 切换语言即时更新展示，保留输入、选择、页面与插件实例。未迁移部分允许保留简体中文，缺词按所属词典的默认语言回退。
- 用户正文、标题、标签、插件 ID、路由与命令 ID、数据库枚举、导出协议字段不因界面语言改变。用户已经保存的系统默认名称也不批量改写。
- AI 输出语言、语音识别语言、导出文档语言与界面语言分别管理；中文诊断日志、测试夹具和代码示例不当作界面文案盲目替换。
- 用户已确认按顺序实施，逐子批验证并提交。实施时不混入工作区其他任务的修改。

## 已有能力

- 本地词典声明 `defineI18n`、翻译运行时、React Hook 和可序列化消息引用已经具备。
- 应用语言选择、桌面导航及默认页面标题、壳层常用提示、外观设置已接入三语。
- 公共 Dialog、ConfirmDialog、Select 的默认文案已跟随语言，显式传入的文案仍由调用方翻译；其他公共组件按消费者需要迁移。
- 插件可以声明 `i18n: messages`；组件调用 `useI18n(messages)`，普通动作调用 `context.i18n.t()`，交给宿主显示的标题使用 `messages.ref()`。
- 插件模板与工作台示例采用 JSON 词典；真实官方插件仍需逐个盘点支持版本及界面入口。

## 技术方案

### 资源归属

功能词典就近放在 `features/<功能>/locales/zh-CN.json`、`zh-TW.json`、`en-US.json`，大型功能可拆成 `list.zh-CN.json`、`detail.zh-CN.json` 等子模块文件。公共组件词典归所属包，插件词典归插件的 `src/locales/`。

桌面和手机各自的词典跟随各自界面；已经由公共包承载的同一段界面只维护一份词典。不为了复用几句通用词而新增依赖应用 store 的共享包，也不把业务词典集中到全局应用词典。

采用稳定语义 key，如 `empty.title`、`delete.confirm`、`selection.count`。默认语言保留正确的现有语义，三语在同一个子批提交；句子使用完整模板和命名插值，数量使用复数规则，避免拼接词语。

### 替换边界

| 文案所在位置                   | 接入方式                                                                   |
| ------------------------------ | -------------------------------------------------------------------------- |
| React 组件及无障碍名称         | 使用所属模块的 Hook，在渲染时调用 t                                        |
| 导航、菜单、命令、页面等声明   | 已支持消息引用的字段用 ref；其他声明在消费边界解析，不在模块求值时缓存译文 |
| 用户动作产生的 Toast、确认提示 | 在动作发生时解析所属模块文案，保留原业务流程                               |
| 会持久化的后台任务或错误       | 保留稳定状态码与参数，在展示边界翻译；不把译文当状态标识或重写历史记录     |
| 日期、数字、相对时间、数量单位 | 使用当前 locale 和已有格式化能力；时间戳、时区、排序与业务统计口径保持独立 |
| 公共控件的自定义按钮及空态     | 调用方负责翻译；控件自带的默认文案由公共包维护                             |
| 插件生成或展示的内容           | 固定界面文案由作者翻译，用户内容原样展示                                   |

遇到尚未支持引用的公开字段，先记录当前消费者、输入输出与序列化边界，再决定就地翻译或扩展协议；不顺带重写整个注册系统。

## 分批路线

下面是优先级路线，不是一次性大提交。每个子批只推进一个可独立使用的页面或操作路径；开始子批时先核对实际消费者，再展开具体文件清单。

| 批次              | 子批与范围                                                                                           | 完成后的用户结果                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| P1 今日页         | 1A 桌面主视图、日期、加载与布局编辑；1B 桌面内置区块及回顾统计；1C 手机 HomeDashboard 与今日议程     | 能用三语浏览今日、调整首页及查看统计；日期和数字跟随语言，布局不丢失     |
| P2 常用内容       | 2A 卡片库列表、筛选与删除；2B 文章列表与详情操作；2C 日记；2D 项目与文档树。每一子批核对手机对应入口 | 从列表进入内容、筛选、操作、确认及成功/失败反馈形成完整三语路径          |
| P3 查找与编辑     | 3A 搜索及命令面板；3B 快速收集与新建；3C 编辑器工具栏、插入菜单、链接与媒体操作；3D 导入导出对话框   | 查找、新建和编辑的常用操作可连续使用，正文及导出内容语言不被界面语言改写 |
| P4 日程与学习     | 4A 待办；4B 日程与日期选择；4C 番茄；4D 闪卡；4E Notebook、PDF、漫步。每个功能单独交付               | 数量、状态、日期、复习提示及错误反馈有一致语义，业务规则保持原样         |
| P5 配置与服务     | 5A 剩余通用设置；5B 同步/存储/缓存；5C AI、图像、语音设置；5D 插件中心、安装、权限与管理             | 用户能配置与管理应用，服务名、账号名和第三方原始诊断保留正确边界         |
| P6 专业界面与窗口 | 6A 白板界面；6B 协作与发布；6C 独立编辑/Markdown/番茄/通知等窗口的逐入口复核                         | 专业工具与独立窗口的文案和语言来源一致；画布内容与协作数据不改变         |
| P7 真实插件与收尾 | 7A 一个常用官方插件的真实业务界面试点；7B 其余官方插件逐个迁移；7C 宿主遗漏、公共控件及文档对账      | 插件可按自身词典适配，支持状态清楚；宿主范围内的界面遗漏有处置结论       |

公共组件按当前子批的真实需要就近补齐。例如 P4 日程需要 CalendarPanel、DatePicker、TimeField 时，一起迁移它们的默认文案，不等到末尾统一处理。

真实插件的 SDK 依赖、最低宿主版本和能力可用性在各自子批确认。SDK 与插件发布属于独立发版动作，不因为文案迁移自动发布全部插件。第三方作者的词典不作为宿主迁移完成的前置条件。

## 每个子批的执行流程

1. **盘点用户路径。** 列出页面入口、内置区块、菜单、弹层、空态、加载、错误、Toast 和 aria/tooltip；同时确认桌面、手机和独立窗口的消费者。将共享数据层里的展示文案列入清单。
2. **建立三语文件。** 提取稳定 key，逐条编写翻译，核对占位参数、数量、日期与术语。标明哪些原始字符串属于用户内容、诊断或协议，不进入词典。
3. **按展示边界替换。** 组件使用 Hook，声明使用引用或展示时解析；排查模块级数组、Map、useMemo、页面缓存和后台状态里的旧译文快照。已有值与身份保持不变。
4. **执行工程检查。** 检查三语 key、插值与必要复数形式；运行对应类型检查、静态检查及直接相关的现有行为测试。涉及新资源加载或共享包时执行相应构建，涉及跨端协议时验证两端。
5. **回扫与验收。** 使用汉字检索帮助找遗漏，逐条解释剩余命中；同时核对英文硬编码、日期格式、aria 和隐藏状态。Agent 不做截图或视觉走查，由用户完成三语视觉验收。
6. **交付并更新台账。** 更新受影响使用文档、架构事实和本页进度，报告已覆盖路径、验证结果及遗留项，单独提交该子批。普通词典替换不逐文件请求确认；涉及新的架构分歧时先对齐。

## 子批完成标准

- 该子批列出的入口、状态和操作反馈均有落点；桌面/手机/窗口的适用范围明确，未覆盖的对应入口有后续子批。
- 三语 JSON 文案和参数一致；需要复数时按语言规则核对，不强求各语言的复数后缀机械相同。
- 语言变化刷新可见界面与派生菜单，不重挂编辑器，不清空输入、筛选、选择和首页布局，不重复执行插件激活或业务动作。
- 业务数据、协议身份、权限判断和业务规则未改变；不以中文搜索结果清零或词条数量充当完成标准。
- 类型、范围内现有测试、必要构建及架构/文档检查通过。新测试只针对参数/词典契约、状态保留、订阅生命周期或其他已有规则允许的边界，不测试固定 UI 文案与样式。
- 工程完成与用户视觉验收分别记录；语言长度、换行和按钮挤压由用户验收，发现问题回到对应子批修正。

## 首个实施子批：P1A 桌面今日主流程

### 主要入口

- `apps/desktop/src/features/home/views/HomeView.tsx`：问候、日期、加载、首页调整、恢复默认与完成动作。
- `apps/desktop/src/features/home/views/HomePanels.tsx` 与 `panels.ts`：布局编辑、内置面板名称和恢复隐藏面板入口。
- 首批触达的纯格式化或布局辅助函数，仅调整展示边界，保留布局 key 和存储格式。

### 接入方式与行为

新增 `features/home/locales/zh-CN.json`、`zh-TW.json`、`en-US.json` 与模块词典绑定。日期格式化使用当前 locale；问候按原有小时区间选择消息 key；面板名称展示时翻译，面板 ID 不变。插件面板继续使用插件提供的消息引用。

主流程：读取首页数据与布局 → 按当前语言生成固定文案和日期 → 渲染首页 → 用户进入调整模式 → 拖动/隐藏/恢复继续沿原存储协议保存 → 语言切换只刷新展示 → 完成调整保留布局。

P1A 完成不表示整个今日页已经完成；内置区块、回顾中的「字」「日均」「万」等数字口径与手机首页分别由 P1B、P1C 收尾。

### 验证

优先复用 HomePanels、PluginHomePanel、snapshotTimeout 等直接相关测试；日期/问候边界只有在新增真实转换逻辑时补必要用例。核对切换语言时首页调整状态与布局身份保留；三语词典参数、桌面类型、文档检查按范围执行。

## 进度台账

- [x] 已有基础接入、公共三种控件、外观设置与壳层常用提示，以及 JSON 词典整理。
- [x] 当前路径与格式化风险盘点，形成可评审方案。
- [x] P1A 桌面今日主流程：工程完成，待用户视觉验收。
- [x] P1B：桌面内置区块与回顾统计。P1B1 待办/日程/最近编辑工程完成（类型检查与 17 个相关行为用例通过）；P1B2 回顾统计、趋势与热力图工程完成（桌面/UI 类型检查、17 个首页与 23 个 UI 用例、桌面构建及官网检查通过）；P1B3 洞见和漫步工程完成（14 个相关用例、2 个翻译缓存回归用例、桌面与手机类型检查、桌面构建通过）。AI 内容、路由和处理身份保持原样；漫步共享元信息消费者已全部切换到接收翻译器的入口，偏好面板等其余漫步文案仍按 P4 收尾。
- [x] P1C：手机今日页、主导航入口、议程、任务摘要、最近动态和问答建议工程完成（手机类型检查与构建、15 个相关用例、三语参数与官网对账通过）；日程摘要改为返回数据，未改变日程判定规则。创建菜单、内容详情和其余聊天界面仍分别由 P3、P2、P5 迁移。
- [x] P2A：卡片库列表、筛选与删除工程完成，待用户视觉验收。桌面覆盖卡片墙与列表、分组与数量日期、预览元信息、侧栏标签筛选/重命名/合并/删除、条目菜单与删除反馈；手机覆盖卡片库、列表日期、标签编辑、关联卡片选择、详情菜单与删除确认/反馈。三语 JSON 同步，官网说明已更新。
- [x] P2B：文章列表与详情操作工程完成，待用户视觉验收。桌面覆盖网格/列表、标题搜索、标签筛选、月份分组、速切器、标题与元信息、详情菜单及封面/复制/删除反馈；手机覆盖文章列表、创建菜单、封面、详情菜单和置顶/删除反馈。共享排布菜单、Input 清空按钮与剪贴板反馈同步接入三语。
- [x] P2C：日记工程完成，待用户视觉验收。桌面覆盖日记流与统计、搜索、日期范围与日历、月份刻度、输入条、标签/颜色/清理、片段菜单、发布反馈、删除撤销和那年今日；手机覆盖日记流、日期导航、标签编辑/管理、片段动作、删除撤销与详情日期头。全部入口传原始类型与日期，标题在展示时跟随语言生成。
- [x] P2D：项目与文档树常用路径工程完成，待用户视觉验收。桌面覆盖项目列表、排序/归档/新建/编辑/删除、文档树添加与节点菜单、关联入口、重命名、文档元信息与操作反馈；手机覆盖项目列表、创建/归档/删除、层级导航/结构树、节点类型、子文档创建、引用来源与文档菜单。
- [x] P3A：搜索与命令面板主界面工程完成，待用户视觉验收。桌面覆盖类型/范围、分组、缓存命令与插件来源提示、历史入口、键盘提示、空态/失败/重试、结果兜底/时间与记录动作入口；手机覆盖搜索/历史、结果类型与兜底、时间/数量、分页/失败/空态。前缀接受简体/繁体/英文并保持原动作身份；切换语言保留查询、范围、选择及已加载结果。
- [x] P3B：快速收集与常用新建入口工程完成，待用户视觉验收。桌面覆盖卡片新建/保存反馈及快捷窗口启动/缺失反馈，待办输入条、日程快速添加及命令面板的日期/时段/周期预览；手机覆盖 ＋ 菜单、速记恢复/丢弃/清空/保存反馈、长按语音收集状态与打开/设置提示。下一实施项为 P3C 编辑器工具栏、插入、链接与媒体操作。
- [x] P3C1：手机编辑控件工程完成，待用户视觉验收。覆盖工具栏、样式/插入/媒体面板、代码/表格/源码附件条、公共链接编辑弹层、内容引用选择与预览，以及媒体输入/上传反馈；选区、命令、标记值和正文默认内容保持原样。下一项为 P3C2 公共编辑器与桌面。
- [x] P3C2：公共编辑器与桌面工程完成，待用户视觉验收。P3C2a 文字样式工具栏工程完成，待用户视觉验收；覆盖公共格式入口、紧凑分组、字色/高亮/渐变、下划线与样式文本、批注线程和行内公式，两端复用。P3C2b 内置块插入、通用/转换菜单及桌面引用选择与预览工程完成，待用户视觉验收；P3C2c 代码/媒体专用菜单及完整操作界面已完成；下一项为 P3D 导入导出；公共包不读取应用设置，插件自带文案保留作者所有权。
- [x] P3D1：通用内容导入导出工程完成，待用户视觉验收。覆盖桌面导入向导/记录/撤销、单篇图片/PDF/EPUB、Markdown 包/批量导出、单篇 Markdown/Word 反馈和独立窗口入口，以及手机外部 Markdown 预览/导入与已知错误反馈。
- [x] P3D2：高级视频笔记电子书导出工程完成，待用户视觉验收；生成流、草稿、格式/封面、元数据与多格式续导出保持身份。
- [x] P4A/P4B：待办与日程联动工程完成，待用户视觉验收；两端完整业务 UI、共享日期/时刻/范围选择与提醒、日期/周期纯显示及语义分类同批落地，保证模型展示函数退休与跨域消费者原子迁移。
- [x] P4C：两端番茄专注、预设/历史、桌面小窗/沉浸窗工程完成，待用户视觉验收；原生和定时通知载荷仍归 P6。
- [x] P4D：两端闪卡、卡组、制卡、复习与统计工程完成，待用户视觉验收。
- [x] P4E PDF/漫步：桌面完整阅读与漫步工程完成，待用户视觉验收；手机无对应生产入口。Notebook 单独收尾。
- [x] P4E Notebook：列表/资料/产物/生成/测验/后台任务与公共消息反馈工程完成，待用户视觉验收。
- [ ] P5—P7：设置/服务、白板/协作/窗口、真实插件与遗漏按计划继续。

P1A 验证：桌面类型与构建通过；HomePanels、PluginHomePanel、snapshotTimeout 共 17 个用例通过；三语 key/插值与复数形式核对通过；官网测试通过。持续时间格式化从 queries 移至 format，两个消费者已改用新入口；插件面板包装器保留动态标题且语言切换不重挂输入组件。

P2A 验证：桌面卡片/标签/连接相关 44 个用例、手机内容详情、菜单与面板 29 个用例、UI Tag 4 个用例，以及官网 69 个用例和 5 个发布检查通过；新增回归验证语言变化保留标签草稿、编辑节点和光标且不提交。手机/UI 类型检查与两端构建通过；桌面默认类型检查仅被另一任务未跟踪的 `src/feedback-project-whiteboard.repro.test.tsx` 两处未使用导入阻断，使用临时配置只排除该文件后，桌面完整类型检查通过，未修改项目配置。三语 key、插值与运行时数量形式、静态检查及启动/插件边界通过。

P2A 后续边界：新建弹窗、导入服务及导出对话框、编辑器命令和通用内容选择器归 P3；共享 Database 控件与卡片连接字段的分组显示需在公共包适配时处理，已有操作符、分组值与保存的视图名称不改写。手机没有卡片库标签筛选入口，本批不新增交互。原始服务错误、用户正文与标签以及生成文件的既有兜底名称保留原值。

P2B 验证：桌面 22 个、手机 29 个、UI Input 6 个相关用例，以及官网 69 个用例和 5 个发布检查通过；新增回归覆盖语言切换时文章标题草稿、输入节点、焦点及选区保留，且不触发额外编辑或封面动作。桌面、手机、UI 默认类型检查与两端构建通过；三语 key、插值、运行时数量形式、静态检查、启动/插件边界与文档检查通过。

P2B 结构与边界：两端卡片日期格式化分别提升至共享展示模块，全部原消费者迁入后删除原模块；文章月份与数量在展示时格式化，分页参数、排序、标签、月分组键与保存内容不变。手机置顶和删除失败接入既有错误展示入口，成功跳转与查询失效沿原流程。新建默认标题、闪卡参考名及导出兜底文件名保留原值；删除提示改用用户可理解的说明，不承诺并不存在的回收站入口。编辑器与大纲、创作/协作/演示/沉浸界面内部、导入导出弹窗按后续子批处理；手机没有文章标题/标签筛选入口，本批不新增交互。

P2C 验证：桌面日记 11 个、手机日记/导航/编辑相关 56 个用例，以及官网 69 个用例与 5 个发布检查通过；新增回归覆盖输入条草稿、标签、输入节点、焦点及选区在简体/繁体/英文切换时保留，且不会发布草稿。两端默认类型检查和构建、三语 key/插值/运行时数量形式、静态检查、启动/插件边界与文档检查通过。

P2C 结构与边界：桌面日期展示从 model 移至功能 format，快捷范围保留稳定 key，颜色字典移入 JSON，分组与日期算法不变。手机 diaryDate 参数改为原始 mode/baseDate，日记、首页、快捷创建、搜索和插件导航的消费者全部迁移；月份分组不再固化译文，日期键及跨年周规则保留。仅被测试消费的 formatDiaryPeriodLabel 与固定中文标题测试一起退役；日期键/偏移/跨年周测试保留，导航用例改为独立核对原始日期参数。正文、标签名称、默认数据和调色板种子不翻译；发布、标签串行写入、延迟删除及撤销规则保持原样，编辑器内部、语音与协作面板按后续批次处理。

P2D 验证：桌面项目树/文档切换/菜单/公共列表与重命名相关 42 个、手机层级/文档编辑相关 20 个用例，以及官网 69 个用例与 5 个发布检查通过。新增回归分别验证重命名草稿/焦点/选区保留且不提交，以及手机语言变化保留当前层级与节点 DOM、打开动作仍指向原文档与项目。两端默认类型检查和构建、三语 key/插值/数量形式、静态检查、启动/插件边界与文档检查通过。现有固定时钟日期用例改为显式传入语言，保留原业务口径；中文相对时间的空格随 Intl 输出调整。

P2D 结构与边界：公共列表文案归 shared/cockpit，模块数量从量词拼接改为完整数量回调，项目提供三语；数据库与 Notebook 消费者仅适配同一接口，模块文案按自身批次迁移。菜单构建器显式接收翻译，缓存依赖翻译函数；旧展示时间函数迁到 format 后原消费者全部更新，不保留旧入口。手机类型标签在渲染时解析，引用来源缓存保留原始标题，缺标题占位不进入查询缓存。文档树排序/展开/选择、节点/菜单键、拖拽、内容会话、默认新建名称和导出/制卡引用名保留原值；手机不支持的专用节点显示当前能力说明，不再使用开发阶段编号。通用选择器及导入导出弹窗归 P3，视频/PDF 内部归 P4，白板/画布内部归 P6，项目回顾高级报告界面列入 P7 遗留对账，AI 正文不当作界面文案翻译。

P3A 验证：桌面搜索 35 个、插件宿主相关 12 个、手机搜索 3 个用例，以及官网 69 个用例与 5 个发布检查通过。新增/扩展契约用例覆盖繁体和英文前缀查找而不新建、显式添加、缓存命令标签与三语别名、语言切换保留输入/范围/结果选择、查询反馈翻译不重发请求，以及手机结果/未提交输入保留。两端默认类型检查和构建、三语 key/插值/数量形式、静态检查、启动/插件边界及文档检查通过。

P3A 结构与边界：固定宿主命令和类型标签改为读取时解析，缓存仍只按稳定命令身份保存；宿主命令别名包括三语标题，页面词典仍由应用负责。前缀语法放独立 JSON，不随语言改写或移除既有输入；自然语言正文不自动翻译。查询缓存只存失败来源代码/原始原因及文档任务 completed 状态，提示在展示时格式化；警告按原问题身份通知，语言不进查询键、不重放警告。快速收集预览和常用入口已在 P3B 接入，其余日期/周期界面留 P4，解析词表不随界面语言自动替换；CatalogSearchTable/EntitySearchTable 与外部材料提供方返回的格式化 meta、默认实体标题及其余实体投影列入 P7 对账，不在搜索页按中文片段猜测替换。插件名称、类型和正文归提供方所有，现有工作区修订失效及迟到分页仲裁保持原样。

P3B 验证：桌面解析/快速添加/新建/搜索相关 55 个、手机草稿/控制器/页面/语音相关 20 个用例，以及官网 69 个用例与 5 个发布检查通过。新增/扩展回归覆盖新建预填与持久草稿保留、日期与周期星期顺序不被展示修改、速记恢复后语言变化不重建编辑会话、录音中切换语言不重启会话且只保存一次原文。真实本机正文绑定用例并行时触发 5 秒时限，控制器单独复跑 6 个用例全部通过，未调整断言或时限。两端默认类型检查/构建、三语 key/插值/数量形式、静态检查、启动/插件/白板边界与文档检查通过。

P3B 结构与边界：快速添加展示归 shared/quick-add，接收原始解析结果与显式时间/语言；原 describeQuickAdd 展示导出在两个消费者迁移后删除，解析器只保留数据与原有语法。待办项目/日历匹配、日期推断、时段裁剪、周期数据与默认新建名称保留原规则，新增输入语言语法属于独立功能需求。手机菜单动作键、600ms 保存防抖、草稿键/恢复、关闭冲刷、清空删除、语音手势与识别原文保持原样；动作反馈发生时翻译，捕获入口的未配置提示不改变服务状态判定。快捷卡片窗口仅迁移启动/缺失反馈，标题栏和完整编辑工作台归 P6；通用编辑器/语音编辑面板内部归 P3C/P5，各专用模块的创建表单随所属批次继续迁移。

P3C1 验证：手机编辑控件与引用相关 120 个、提示服务 10 个、公共链接 39 个用例，以及官网 69 个用例与 5 个发布检查通过。新增回归覆盖插入查询/焦点/选区、颜色命令值、链接输入与编辑器身份、引用保存元数据，以及提示请求/草稿在语言变化时保持原样且不自动提交。手机、桌面和编辑器包默认类型检查、两端构建、三语 key/插值/数量形式、静态检查、SDK 本地打包、启动/插件/白板边界及文档检查通过。

P3C1 结构与边界：手机控件独立 JSON 词典，缓存菜单与元信息读取时解析，插入搜索追加三语别名；展示键不作为颜色/高度/类型身份。内容引用的查询、校验、竞态仲裁与持久化标题维持原协议，类型和时间只改展示；插件标题保持提供方所有权。公共链接弹层通过现有 Provider 继承语言，未新增扩展 API、应用设置依赖或编辑器重建。手机提示仓库保留选项 getter，语言只更新提示宿主，取消与信号隔离规则保持原样。公共播放器、裁剪/媒体弹层、源码提供方动作及其余公共编辑器界面随 P3C2 迁移；录音/语音生成与服务设置内部随 P5，整理结构等剩余入口列入 P7 对账。

P3C2 调研入口：`ExtensionAssembly.getBlockPanelItems(editor)` 已支持按编辑器生成列表，`EditorMenuContext.editor` 可提供所属实例；优先复用现有签名。块菜单仍用中文标题合并图片/React 分组，且 `filterList` 每次更新重设 activePath，需先区分稳定内置身份与标签，保持打开菜单的选择。菜单标题函数按现有约定在打开时求值，适配内置动态标题时不能改变插件作者的调用语义；纯能力入口维持无 DOM 与应用依赖。

P3C2a 验证：编辑器格式/色板/选区/批注/行内公式相关 65 个用例、质量工具与架构边界 103 个用例，以及官网 69 个用例和 5 个发布检查通过。新增回归覆盖紧凑分组打开状态与输入、颜色操作的原色相值、批注回复草稿/焦点/选区/原线程提交、公式编辑光标与编辑器身份。桌面、手机和编辑器包类型检查、两端构建、三语 key/插值、静态检查、SDK 本地打包及启动/插件/白板/文档检查通过；用户视觉验收仍待完成。

P3C2a 结构与边界：在既有包内 JSON 词典增加展示资源，叶子组件订阅继承的运行时；紧凑工具栏保存消息 key，配置与组件类型不因语言变化重建。纯色板/渐变数据、CSS 取值、最近使用与正文标记值保持原样；批注的日期格式化显式接收 locale 与相对时间模板，时间分桶规则未变。下划线已消费的公共 `text-formatting/palette` 与 `/panels` 被旧导入规则误判为内核访问，本批按现有公开边界精确放行这两个入口，私有深引及其他内核入口继续拒绝并由现有架构用例验证。桌面特有内容引用选择器归 P3C2b，块级公式/媒体/源码动作归 P3C2c；本批不表示整个公共编辑器已完成。

每次开始新子批，只保留一个实施项进行中。进度记录包含范围、三语状态、工程验证、用户视觉反馈及下一子批；发现已完成子批的问题时回到原子批修复。

P3C2b 验证：公共编辑器菜单/插入/工具栏相关 70 个、桌面引用与真实扩展 41 个、手机块选择 29 个、插件契约/静态入口 14 个用例，以及官网 69 个用例与 5 个发布检查通过。新增回归覆盖显式分组、同名不误合并、父动作保留、异常分组不丢项、菜单函数只求值一次、语言变化保留子级选择/树身份/编辑器，以及引用筛选/焦点/选区/已选项/查询缓存不变且确认后提交原实体。桌面、手机及编辑器包类型检查、两端构建、三语参数、静态检查、SDK 打包及启动/插件/白板/文档检查通过。

P3C2b 结构与边界：`IBlockPanelListItem` 增加可选 id/group；纯组装按稳定 id 引用构树，保留 children 与父插入动作，缺失/重复/环的目标保留顶层并隔离失效关联。内置图片声明 id `tau.image`，行内图片配置 group；不再推断任何中文标题，未配置 group 的插件按自身声明独立显示，官方插件分组配置在 P7 随其接入处理。每个 Slate 实例在创建后绑定继承运行时，叶子标题读取当前语言；包内 JSON/纯运行时与 React Hook 分开，纯公开入口保持无应用依赖。内置菜单用私有消息声明冻结打开时的 key/参数，只有译文动态；插件标题函数与条件仍只在打开时求值。

P3C2b 桌面与交付边界：EntityPicker 绑定宿主运行时，原查询键/时间分桶/类型/排除与选择身份不变，失败展示与重试保留本次条件；原 entityTime 仍被白板插入记录的持久说明消费，本批只新增展示格式化，不改写该数据。引用正文、标题和插件外观保留原值，缺标题、类型、数量和时间在展示时翻译；`@` 面板不因语言重新搜索。已存在的 Portal 外部点击事故用例改用显式分组夹具，继续验证真实插件插入。模板作者指南同批说明配置；原模板 node_modules 的已发布 SDK 缺少先前 i18n 契约，原地构建因此失败，随后在隔离副本安装本地打包 SDK 后类型与 ZIP 构建通过，并验证 id/group 声明可编译；未发布 SDK 或插件。

P3C2c 验证：三个 Agent 分别完成代码/图表、图片/网页/书签、音视频/播放器并提交精确路径清单。代码域 20 个、图片域 74 个、播放器 40 个及音视频相关 31 个用例通过；根的共享提示/菜单/媒体提交 40 个、源码预览/触屏页 26 个、手机提示 10 个用例通过。新增回归覆盖文件名和书签草稿/焦点/选区、图表失败提示换语不重新渲染、播放与 OSD 反馈时序、默认队首提示宿主跟随发起编辑器，以及源码绑定/动作对象与编辑器身份。编辑器、桌面和手机类型检查、两端构建、六组三语资源/插值/复数校验、静态检查、SDK 本地打包、启动/插件/白板与文档检查通过。shared 单独 tsc 仍有既有四处 CSS/worker 环境声明错误，未扩大修复范围；两端消费者类型检查已覆盖本批播放器生产源码。

P3C2c 结构与边界：编辑器按 code/image/av/common 独立 JSON 注册，源码预览与共享播放器各归其包维护词典，独立使用默认中文。默认提示转发和排队保留 getter 与发起者运行时，校验在显示时重新计算，退出动画使用最后文案快照；语言不结算请求或重置草稿。源码动作通过 getter 读标题，菜单保留字符串 getter 的读取语义，普通函数仍只在打开时求值；没有新增公开配置项。播放器 OSD 存消息与参数，语言不刷新关闭计时，不换资源、位置、音量或速率。书签/网页独立 root 继承所属编辑器 Provider，退出后的最终卸载延至微任务。正文、源码、标题、媒体 URL、字幕、编程语言值、外观枚举及菜单命令保持原样；语音生成/录音工作台等专用业务仍归 P5，白板与独立窗口归 P6。

P3C2b 用户决策：保留分组能力，条目用稳定 id/group 显式关联；不能按标题判断，也不以移除分组替代修复。插件可使用相同字段；目标未安装时独立展示，不加标题匹配兼容层。

P3D1 验证：桌面导入 6 个、图片/PDF/EPUB 弹层 13 个、Markdown/批量导出相关 38 个用例通过；根的资源/正文真实往返与传输 11 个、手机解析/接收 single-flight 5 个用例通过。新增回归覆盖导入任务/勾选/草稿、导出预览/分页/元数据/格式、目录勾选与 ZIP 路径/正文，以及换语/重复文件事件不重读受控文件。两端默认类型检查和构建、六组词典参数/复数检查、静态检查、启动/插件/白板/文档检查，以及官网 69 个用例与 5 个发布检查通过。

P3D1 结构与边界：桌面向导与普通导出各有独立 JSON 词典，模块共享传输反馈和 CheckTree 展开标签按宿主语言展示。旧 unit 量词接口在四个消费者迁到稳定 target 后删除；导入数量使用完整句子。SCOPE_FILE_NAME 保留旧规范命名，范围预览按稳定 id 投影标签；实际文件名、目录/树、frontmatter、资源与互链、Word/EPUB/PDF/PNG 内容和元数据不随 UI 语言变化。已知导出失败附稳定 code、保留 Error.message，展示时解释；历史 warnings、解析诊断与源名称不改写。手机仅迁移真实支持的外部 Markdown 接收/预览/存入卡片、文章、项目，缺标题的展示与保存默认名分开；原错误码不变。iOS 原生接收的校验失败可能在事件前返回，是存量反馈缺口，本批不宣称这一路的拒绝消息都已可见。

P3D2 技术边界：高级视频电子书单独迁移弹窗、入口与自身错误反馈；保留写作风格/步骤/格式值、videoTitle 数据兜底、AI 的中文系统提示词/风格指令/输入提示、草稿正文与流式/取消协议。元数据语言/默认作者/文件名与记忆键不变；reset effect 不加入 t/locale。封面名称、错误格式摘要与续导出说明改为展示投影，保留原草稿会话、格式/封面选择与 resolver，不重复通知同一 rewriteError。

P3D2 验证：原生命周期/结果分类 6 个用例及新增真实弹窗集成 2 个用例共 8 个通过；覆盖英文界面发起原中文流、换语不重发/取消、真实草稿/选区、书名/作者/fr 元数据与封面字节、EPUB 取消后续导出 PDF 只执行一次、错误通知不重放。桌面默认类型与当前整端构建通过，三语参数、静态检查通过。未改 AI 提示、生成内容与记忆数据。

P4A/P4B 验证：日期/模型/跨域消费者 5 文件 34 例、待办桌面 27 例/手机 8 例、日程桌面 75 例及待安排面板 4 例/手机 35 例、公共日期 33 例、共享提醒 5 例/手机提醒与日期 4 例通过；根 GroupDialog 真实交互回归通过。覆盖换语不清空表单/任务/月份/过滤/编辑器/挂起日期、不重发查询或保存、不重排通知/延期删除/撤销。共享提醒默认中文在 120 个 offset/截止边界场景与 HEAD 原实现一致；Node 纯入口/提醒直载、SDK 打包及隔离模板类型/ZIP 构建通过。工程验证还包括两端类型/构建、词典参数/复数、静态与边界检查。

P4A/P4B 退役与数据边界：dayWords 仅保留纯计算、类别和非变异星期排序；date-format 显式收 locale，quickAddDay 合并后旧入口清零，model 的 dayWord/monthDay/WEEKDAY_CN/dateTimeWord/recurrenceText 展示转出全部删除。pastDayWord 无生产消费者，仅测试自消费，函数和对应文案断言正常退役，现用自然日/周界及周期排序非变异契约。日期/周一起始/DST/42格/15分钟与手机5分钟规则、全部ID/查询/存储键和planned既有选择范围不变。17色 name/hex 与7色代表值不改，旧label消费清零后退休。日历DTO没有可靠来源角色，公开创建/更新可指定系统groupId，因此isInSystemGroup不证明创建来源；保留原始名称，仅现行业务已识别的来源badge翻译，不扩大人类标题猜译。手机TODO已知码移入错误JSON，错误码/原始诊断不改。

P4C 验证与边界：桌面 7 文件 38 例、手机 3 文件 12 例通过；新增回归保留预设草稿/焦点/选区/计时实例与阶段，完成反馈不重放，手机归零只落库一次。两端词典/参数/复数、静态检查与当前整端类型/构建通过。纯展示从 model/range 拆出，缓存 meta 改 phase/range 语义，ID、计时、暂停/恢复、历史、预设名/资源值和“番茄钟”系统日历协议原值不变；定时/native 通知文本仍归 P6，不把语言放入排期依赖。

P3C 核心补齐：未知块/失败块占位、复制/拖放/保存反馈、默认编辑器名称与源码字段错误已迁移。核心 8 文件 34 例、源码页与绑定 31 例、失败载荷 4 例、公式编辑 4 例通过，编辑器/源码包类型检查和纯 Node 输入/formatter 入口通过。语言不重试失败扩展、不重报错误、不绑定或重提交源码；原错误、草稿和 Slate 属性/子节点保留。SDK 本地打包与隔离模板类型/ZIP 构建通过。

P4D 验证与边界：桌面 10 文件 45 例、手机 3 文件 15 例通过，覆盖复习队列/评分/会话时间点、翻面和提交锁，以及真实双编辑器的题目/答案/标签草稿。两端 JSON 参数/复数与静态检查通过；手机默认类型检查通过。桌面在本域完成时类型检查通过，后续整端检查的 Notebook 进行中错误单独跟进。未知诊断、用户题干/答案/卡组名、AI 输入输出、存储/查询/FSRS 规则不改；手机宿主插件制卡与公共判答展示同步补齐。

P4E PDF/漫步验证与边界：PDF 原 40 例及新引用序列化/阅读实例/批注草稿回归共 43 例、漫步含首页消费者 24 例通过；共享项目插入真实换语测试保留目标、不重取列表，确认后仍提交原内容与谱系。两端整端构建通过；本域静态/词典/参数对账通过。阅读实例测试保留真实文件/索引/注册逻辑，外部引擎与编辑器边界用模拟，不表示物理渲染或视觉验收。PDF 文件/标注/引用/原始默认名与漫步抽取/偏好/足迹/已见规则不变；余下 Notebook 继续并行。

P4E Notebook 验证与边界：原 8 文件 36 例、最终 9 文件 39 例通过；新增真实生成弹层、测验原答案保存、插件任务回调与工具 schema 协议验证。公共消息原 17 例、最终 18 例通过，覆盖语言变化不改变思考计时/正文/工具展开，也不重试已失败的渲染器。两端当前整端类型、桌面整端构建、消息包与纯注册入口类型、JSON 参数/复数、静态与启动/插件边界检查通过。模板按稳定 id 显示，内置任务用语义 phase、插件原阶段和 AI/工具输出不改；根获放行的专属资料选择 hook 只迁即时失败反馈。

P5C1 图片设置：两端账号选择、配置/校验及反馈工程完成。桌面 3 例、手机 3 例，以及共享草稿的上传/同步/TTS 原链路 30 例通过；已知码错误换语保留原请求、草稿/焦点/选区，修正后原账号/模型/URL/凭据只写一次，保存中不重放。两端类型、静态、三语资源对账通过。共享配置表单保留原 cause 与字段 key，必填/成功/离开提示展示时生成，不改插件 schema 或保存协议。

P5B Cache：桌面缓存查看/来源筛选/预览/单删批删/分类清空与自动缓存、剪藏开关工程完成。既有 3 例扩为 4 例通过，覆盖换语保留过滤/勾选和真实视频 DOM、src、时间/音量/速率，不重复读桶、删除或写设置。JSON 参数、静态/格式、整端类型检查通过；未将“剪藏时翻译成中文”目标改成界面语言，手机没有对应缓存页。

P5D1 桌面插件中心：发现/已安装/详情、安装风险确认、后台状态、更新与卸载工程完成。原 14 例加真实确认/搜索/偏好/单次安装换语回归共 15 例通过；版本合并/排序/动作与日期语义保留，旧显示导出消费者清零后退役。词典 key/参数/复数、静态/格式通过，本域类型清零；整端与并行 LLM 设置收尾后统一复核。手机中心/权限与真实插件词典按后续批继续。

P5B 上传/存储与设置入口：桌面服务选择/资源设置、手机上传目标/服务表单与展示状态工程完成。桌面 11 例、手机 4 文件 37 例、上传结果/编辑器提示 20 例、设置入口相关 6 例通过。覆盖账号/密码可见性/路径/光标/远程选项在换语时保留，主动保存仍写原值与未知字段；近期失败只取一次，原码/原诊断与历史持久记录不重写。手机中心入口及功能宫格使用独立 JSON，单选项显式 key 保留节点、未点选不写设置；旧 highlightStyleLabel 与相对时间显示导出消费者清零后删除。两端词典/参数/复数与静态检查通过；完整同步界面、通用外围继续单独迁移。

P5C2 LLM：桌面大模型/服务商/模型管理、功能分配、用量/设备/插件活动/内容索引状态及工具模式设置，手机大模型配置工程完成。原 26 例扩为桌面 21、手机 7 共 28 例通过；保留账号/模型配置、功能分配与用量查询范围/缓存，换语不重测/保存/查询。类型、静态/格式和词典参数/复数通过；手机服务定义只留功能 key，清零的 label/desc 退休；TOOL_PERMISSION_MODES 仍有工作台数据消费者所以保留原字段。嵌入模型/语音及实际工作台仍分批推进。

P5D2 手机插件中心：发现/已安装/详情/兼容/发行记录、安装/批量更新/卸载与开发安装工程完成。基线 5 文件 51 例、最终 53 例通过；真实管理器 JSON 草稿、焦点/选区/会话与读取次数保持，真实安装/任务目标换语不重装/取消。管理器已知原因按 code 展示，permission 按 ID 投影，不依赖旧中文句子；旧 INSTALL_CLOSED_REASON 展示制造清零退役。词典/参数/复数与静态/格式通过，本域类型清零；两端权限/设置/动作/页面宿主与 SDK 草稿接口另由 D3 收尾。桌面英文数量形式同步补齐 one/other。

P5C2 Embedding：桌面模型选择/激活/连接测试/下载/索引及确认反馈工程完成。原 6 例加换语状态/异步确认边界共 8 例通过，语言不重探测/下载/订阅或提前写 active；原始探测样本、服务状态与身份保持。桌面整端类型、词典/参数/复数、静态与格式检查通过；手机无对应入口。

P5B 同步：两端中心/服务切换/版本/整库覆盖/资源文件与桌面本地域工程完成。桌面 13 例、手机 4 文件 32 例、核心传输 26 例、手机 Hook 11 例及上传/错误相关 29 例通过；覆盖换语保留建库草稿/查询、进行中原进度对象、长按计时与原方向动作，不额外检查或重发。公共进度换为原始数值+kind，Rust 真实序列化契约通过，Node 读取同一原生载荷在三语/Hant 显示且载荷不变；百分比/锁/传输/重试/清单不改。旧本地字节显示 helper 消费清零后删除，原始诊断保留；手机同步/资源/provider 已知错误迁入 JSON，错误码与解析不变。三语参数/复数与静态/边界检查通过，整端构建随本轮集成执行。

P5D3 控件/SDK 联动：两端权限/动作/实体/页面/Provider设置与保存确认工程完成，README生成占位仍归SDK语义Reader收尾。桌面 9 文件 83 例、手机 10 文件 77 例；真实表单标题 getter 换语与手机上传 11 例保留输入/密码可见性/光标/远程加载。SDK草稿 6 例、独立辅助栏 7 例通过；默认按钮由宿主翻译，成功 feedback.message 惰性 getter 与失败原cause保留，不重save/probe、不因展示标签更新清空结果。notebookPlanImpact 与私有计数消费清零后退役，旧文案mock/译文断言改确认前/取消不创建、确认后传原计划的行为契约。两端类型/词典/参数与静态检查、SDK本地打包和隔离模板新接口编译/ZIP构建通过；作者文档在模板单文件提交并同步父指针，其他任务的模板/架构改动保留。

P5C3 ASR：两端语音输入/整理设置、桌面语音转录与共享字段/本次弹层工程完成。桌面 12 例、手机 ASR5+AI7 共 12 例通过；两端类型、三套词典/参数/复数与静态/格式检查通过。回归保留识别语言、整理要求/光标、账号切换在途、下载实例和订阅，换语不重新下载/调用或提前选用；原模型/设备/语言参数与服务进度原文不改。联动 AI 旧用例曾单次超时，隔离与再次合跑均通过，未扩大改写。实际录音/听写/转录工作台其余外层文案仍由对应子批迁移，TTS配置/试听/克隆独立进行。

P5A 关于/更新：两端关于/更新下载/发行记录、桌面后台设置与自动更新通知工程完成。桌面 3 文件 9 例、手机 4 文件 19 例通过；语言不重启检查计时/下载、不重放通知，保留原 code/diagnostic/cause 与公告载荷。releaseNotesStore 默认 title 已在4消费者核实后退役，只按版本/notes显示；事件通知采用创建时语言快照，不扩DisplayText/IPC或换语重发。两端类型、三语参数、静态与格式检查通过；日志正文和原始版本内容不翻译。

P5A 反馈/公共错误态：两端反馈表单、截图标注/压缩状态、独立反馈窗、公共错误页与报告控件工程完成。桌面 21 例、手机 4 例、Rust app_feedback 8 例通过；Root报告真实换语回归已纳入原7例，保留正文焦点/截图字节/请求ID/metadata、不重编码或发送，失败重试保持完整首次输入。代码/诊断通过IPC窄envelope或响应可选字段保留，服务端未知message与报告“【错误报告】”数据前缀不改；图片算法、质量与上限不变。两端类型、三语参数与范围静态/格式验证通过。

格式范围事故恢复：一条空文件列表的格式化命令误跑后，共925个非本任务路径按HEAD、格式前Git树及SDK文档归档逐字节证明并恢复；原业务修改未回退，剩余事故时间戳只落在当前迁移白名单文件。后续格式化调用先验证路径列表非空并显式传文件。

P5C4 TTS：两端配置/试听/克隆与手机卡片生成工程完成。桌面 9、手机设置/卡片 47 共 56 例通过；两端类型与两套词典/参数/复数、范围静态/格式检查通过，默认合成样本逐字节比对不变。纯binding可无DOM直载，旧CANNOT_INSERT_HINT消费清零退役，警告在原动作发生时按本域翻译；未给编辑器传跨词典ref。回归保留原文本/语言、草稿焦点、音频实例、选用/生成/克隆在途和原提交值，不重放动作；朗读持久标题与错误脱敏核心不改。

P6A1 白板宿主管理：列表/卡片/导航/创建编辑/标签/删除及关联选择器工程完成，17源码路径；原4文件21例、最终7文件24例通过，2个真实UI状态回归最终复核通过。展示Title/时间显式t/locale，旧displayTitle/relativeTime/fullTime消费者清零后退休，model稳定titleSearchText保留原CN默认名搜索/排序。queries的默认页名与服务不动，语言保留草稿/焦点/选区、筛选/勾选和在途确认。desktop类型、三语/参数/复数、范围静态/格式检查通过；A2外框/A3公共包另批，性能核心及BoardContent硬排除。

P7 提供方声明与官方试点：SDK新增作者Declaration与纯binder，Host按所属context一次绑定、验证并登记同一视图；默认ProviderForm<string>与宿主接口保持。原getter/receiver/同步异常/原Promise和业务字段不变，静态ref参数快照，owner隔离无全局缓存。SDK直接契约19例与Host组合28例过，四官方提供方WebDAV/S3/OSS/GitHub发布原测试共25例过，真实Host元数据3例与各仓协议AST/字典/JSON入包对账通过。GitHub发布已在隔离副本安装本地SDK通过type+ZIP构建，未安装原插件依赖、未发布SDK或插件；旧npm pin保留，使用新声明依赖本批源码宿主/本地SDK组合，发版另行处理。作者文档在模板独立提交、插件各自独立提交并同父提交更新指针；其他任务dirty host/index/文档只纳入本任务精确hunk。

P6A2 白板外框：19源码加Root远端失败展示4文件工程完成；6文件25例通过，1例原压力测试环境门控skip；desktop类型、chrome三语95语义key参数/复数、范围静态/格式通过。真实SheetBar/文档绑定/异常fallback/续共享操作回归保留草稿选区/历史/原operationId，换语不重绑、不重试renderer或重发。remote.test仅维护3处显式t接口；公共包/性能核心不动。

P5A Features/Onboarding：10源码工程完成；原纯模型5例及真实UI换语/乐观写入2例通过。旧模块级LABELS快照退役，preset显示字段只留labelKey，所有真实消费者同批迁移；IDs、集合/依附算法与数据保持，desktop类型/词典/静态检查通过。

P5A Browser宿主：13路径工程完成，直接4文件24例通过，最终Host5例复核通过；desktop类型、三语43语义key参数、范围静态/格式通过。scope显示表清零退役，2原生拒绝点仅追加可选码；换语保留权限/焦点/0042原码与查询、不重拉不裁决。配对主进程通知和扩展独立App语言源仍归后续批。

P5A 手机外观：27源码加RootOverview双helper联动工程完成；4文件20例及最后字体/runtime13例通过，mobile类型、三语38语义key参数、范围静态/格式通过。字体label/description与旧错误显示函数消费者清零退役；真实控件跨语言保留选择/焦点/下载/查询，不写设置、不重取字体；ID/字节/URL/样本与反馈metadata不变。

P5 Chat交互：17源码工程完成；desktop真实host11、chat-ui22、mobile composer/chat18共51例通过，两端类型、纯renderer入口/无DOM直载、三语参数/复数与范围静态/格式通过。真实host换语保留草稿焦点/选区、原问题ID与审批allow-session身份，不重发或重配置；浏览器扩展宿主及手机自有卡外层另批。

P5 Chat容器/输入：13源码工程完成；desktop27和chat-ui24共51例通过，desktop/chat-ui/纯renderer类型与无DOM入口、两套三语参数/复数和范围静态/格式通过。连接延时假时钟、真实输入焦点/选区及异步附件原payload保留，不因locale重排计时/保存；显式空placeholder/model优先。Sidebar队列/分支/编辑与实际会话外壳另批。

P6B桌面加入/昵称：7源码16语义key工程完成，原2例扩为4例通过；desktop类型、参数、范围静态/格式通过。待提交/失败跨语言保留DOM/光标/原邀请码，不重发加入；昵称草稿不自动写入，Esc取消、Enter仅提交trim原文一次。

P6A3-A公共工具栏：30源码连同@tau/i18n workspace依赖/lock工程完成；6文件52例、包类型/纯Node无DOM/JSX入口、白板边界、三语参数/复数与范围静态/格式通过。真实换语保留菜单factory次数/原动作、插件草稿选区、错误fallback及各runtime隔离、raw几何payload。7 creator仅退役固定hint及dead shapeName，build/default/name/手势算法和第三方显式hint原文保留；BoardContent/perf硬排除。

P6B共享状态：32路径工程完成，desktop模型/白板10例+remote既有8例、mobile状态/编辑19例通过；两端与collaboration包类型、三语39语义key/参数及范围静态/格式通过。旧label/sessionStatusLabel消费清零退休，原300+300+400ms与中途locale不重计时契约保留；17宿主白板kind和actions/tone/transient不变，不新增白板延迟。EditorStatusBar原400字阅读速率/计数不改，所有othersSummary调用同域UI context。

P7 SDK文档只读展示：18源码工程完成，原文档28例加真实Editor换语契约及中心11例共40例通过；两端类型及SDK纯类型检查、词典参数/静态检查通过。原synthetic中文正文退休，安全节点仅保留类型/原alt，不保留源URL；真实readonlyEditor/notice身份及解析结果跨语言不变，无img/video/audio/iframe/webview。旧固定UI文案断言移为语义媒体/HTML安全契约，原README/fence/链接过滤不变。

P5桌面Sidebar/Toast联动：22源码及RootToast5工程完成，7文件36例与Toast12例通过；desktop/UI包类型、三语参数/复数、纯binding无DOM及范围静态/格式通过。真实队列/编辑/会话管理与压缩任务换语保留焦点/选区/草稿/在途创建、同toast身份和原payload；getMessage不重放或重计时，resolve/reject清除旧getter。chatError仅存raw string或本域带原message的SidebarError，原clear时机/AI标题prompt/默认名/排序不改；共享prepareChatSession固定配置诊断后续统一码化，不按中文猜。作者UI文档单独提交同步父指针。

P6B手机加入：12源码工程完成；真实生产route/Router/Overlay回归2例和相关router基线3例通过，mobile类型、18语义key与20既有协作错误码字典对账/静态/格式通过。换语保留原码/焦点/草稿/失败及pending状态、剪贴板仅1读、runtime仅1retain/start，unrelated session不跳转，approved仅按原response.documentId一次replace；20中文错误原值机械对账，parse/fallback逐字节不变。

P6A3-B属性面板：22源码加Root5上下文/guard工程完成；集成后4文件27例、包type与作者边界均通过。属性161key三语参数/复数、范围静态/格式通过；真实输入/滑杆与Popover用fake RAF确定交互时点，换语保留草稿/选区/实例、不写属性。原颜色/主题/枚举/default/name和算法不变，不存在的SourceReadonly字段未人为制造。Root分离纯fallback/context后author闭包不加载Board或tools资源。

P5手机对话工作区：23路径工程完成，真实页面/输入/Skill共25例通过；mobile类型、三语参数/复数、native无DOM binding、范围静态/格式通过。真实换语保留录音连接/流式run与listener、输入焦点选区、异步图片和引用schema、Skill选择/目录次数、rename草稿与history查询次数；6个content prompt及10个home建议payload原字节审计通过。loadError空message维持无错误态，外部未知诊断保留；消息卡和实际speech工作台另批。

P5快捷对话与配置错误：7路径工程完成；真实发送流水线既有17例通过，desktop类型、三语key/插值/复数与范围静态/格式通过。原快捷输入用例扩为实际缺配置失败/切语/恢复配置/重试/在途发送，验证同alert与输入DOM、草稿选区、原diagnostic、原prompt及创建/发送次数；prepareChatSession稳定码保留原中文diagnostic，UI不按文案推断。

P6B桌面共享入口：7源码加Root服务退役2路径工程完成；真实共享入口5例及Root远端/宿主文档/停靠3文件22例通过（原环境门控1skip）。desktop类型、sharing三语27语义key参数、范围静态/格式通过。真实QueryClient换语保留查询身份/次数、筛选、焦点选区与pending失败重试，未知诊断保持原样；英文UI仍提交原文章默认标题，卡片默认title保持undefined，白板对象/roomID/payload不改。

P6A3-C1白板元素树：11源码及Root宿主4路径工程完成；4文件15例、包type/白板边界及宿主3文件22例通过（原环境门控1skip）；desktop类型、tree三语44语义key对账/范围静态格式通过。真实元素查询/重命名及自定义面板换语保留子树DOM/草稿/焦点/选区、不写文档；原默认名识别、插件getName/presentation、拖拽/层级/排序算法保持。

P5手机消息与引用：12路径工程完成；真实router/引用直接2文件15例、mobile类型、三语参数/复数、Node无DOM binding与范围静态/格式通过。换语保留同引用按钮/菜单action DOM/原目标/文字选择面板，不重读session/不editHistory/重发run；实际点击仅一次查询，saveAsCard解析/count/title/body、clipboard和delete/regenerate输入未改。

P6A3-C2白板演示：9路径工程完成；3文件48例、包type、白板边界、三语56语义key/参数/复数与范围格式/静态通过。真实创建草稿/帧/视口、放映中当前帧/激光/全屏单次与原3秒提示计时换语契约通过。sketchLevelLabel全仓消费归零退休，原SKETCH常量数据与演示manager/plugin/算法不改；只保留2个原effect lint warning。

P6B相对时间联动：16源码/测试加Room单调用联动完成；纯边界11例及导出往返/内容导出/日历展示直接3文件14例通过，三语/参数/复数和范围静态格式通过。relativeAge锁定原取整阈值与未来最近态，QueryStatusPill按unit判断最近结果，原30秒tick不重置；所有formatAgo消费者显式locale，不留默认中文接口。Room其余UI由协作Agent另批提交，源码精确hunk隔离保留。

P6独立编辑窗口：11路径工程完成；desktop类型/构建、三语32语义key参数对账与范围静态/格式通过，相关内容导出/真实往返/日历3文件14例通过。独立AST等价校验确认30组旧标题payload一致，所有JSX动作回调与useEditorDocument加载/保存/bus代码保持，driver仅display label退为数据defaultTitlePrefix；无新增纯展示文案测试。显示title与document.title可换语，export title/正文/默认名不改。

P6A3-D1白板提示/预览：11路径工程完成；4文件26例、包type/白板边界、19key三语runtime/参数和范围格式/静态通过。真实未知元素往返与错误renderer不重试、URL pending任务换语不解码/插入第二次、同图片DOM/src与自定义/显式空alt均保留。发现并修复图片关闭×冒泡导致一次点击onClose两次，真实回归已锁一次关闭；CreationPreview无固定文案未动算法。

P6B桌面房间/成员/退出：23路径工程完成，原14基线扩为19例通过；desktop类型、room三语109语义key参数与范围静态/格式通过。5真实契约保留Nav节点/焦点/session对象、成员确认设备与pending单请求、owner pending阻止结束/同步后原id一次退出、邀请码cache/query与code不重读/复制/轮换、同媒体player及资源解析单次；所有Doc/kit/presence依赖不加locale，2外域工厂仅稳定video/audio参数。历史面板另批。

P6系统平台名称：14路径工程完成；desktop类型/构建、启动/插件边界与范围静态/格式通过。独立AST对照证明9个消费者的动作回调与所有effect/memo依赖原样，无memo捕获译文；原常量导入消费者清零退休，不写锁标签或映射的测试。Skill/Markdown/Workspace其余界面文案仍按各域迁移，能力装配不读语言。

存量UI复核：AST初筛4450个生产文件，分别记录JSX/显示属性/反馈候选与数据/诊断，候选需逐项判别，不能据其数量宣称覆盖率。后续仍需收束Skills/MCP、Markdown/浏览器扩展、项目/共享内容工具与独立工作台；showcase/devtools样例与真实产品UI分开评审，默认名/提示词/协议/用户正文不机械替换。

P6A3-D2A白板常用菜单：13路径工程完成；7文件59例、包type/白板边界、menus31key三语及范围静态格式通过。独立AST对照8插件除展示/反馈表达式外协议与动作保持，反馈计数变量一致；真实RichText目标/正文/事件mode与手写合并/撤销换语契约通过，key/参数仍只在工厂打开时冻结。Mind/CopyPaste、媒体与导出另批。

P5桌面对话工作目录/停靠：10路径工程完成；真实QueryClient+传输边界2例、desktop类型/构建、17key三语参数与范围静态/格式通过。fake timer换语保持info/branch缓存对象、在途checkout状态和原cwd/branch单请求，完成后沿原onSettled刷新；同文外部诊断仍属原始Error，只有缺诊断的本机失败携稳定类型。新测试仅锁缓存/异步写入与错误归属契约，不断言UI文案。

P5手机工具展示：19路径工程完成；5文件31例、mobile类型/构建、三语key/参数/复数、无DOM纯formatter和范围静态/格式通过。公开ToolInteractionHost异步边界保留审批pending、分页/other草稿、preview真实缓存；真实router保留原同步broker协议与choice/request身份。6日期parity覆盖短日期/全天exclusive，独立AST确认parseObject/prettyJson/parseLocalText/isOverdue/humanizeToolName/startOfDay及LOCAL正则原样。旧SPECS/SOURCE_NOTE/WEEKDAYS label消费者清零退出，无兼容；RawData/图片prompt/url/fileName和AI载荷不改。

P6A3-D2B脑图/剪贴板：7路径工程完成；5文件36例、包type/白板边界、menus-structure51key三语runtime及范围静态格式通过。真实概要生成跨locale产物正文相等（不锁默认词值），页面标题getter打开只读一次/ID动作不变；独立AST对照非UI协议/默认正文/算法保持，正规化差异仅显示/反馈和明确Board参数穿透。

P5 MCP列表/快捷入口：11路径加Root Toast4工程完成；插件MCP真实Host/registry/store及配置解析24例、Toast12例通过，desktop/UI类型及desktop构建、三语/插值/复数/范围静态格式通过。已有插件场景新增真实换语契约，保留搜索DOM/焦点/选区、卡片与工具注册集合、providerStates引用，之后原ID启停仍生效。纯statusText旧签名/TSX导出消费者迁完退休，UI不把译文存进MCP模型；详情/表单/内置目录显示继续下一批。

P6B手机房间/成员/退出：17路径工程完成；既有editor13/share guard3与真实locale7共23例通过，mobile类型/构建、room91语义key三语参数与范围格式/静态通过（保留原7条fast-refresh warning）。真实多持有者按页面顺序挂载后验证notice仅消费一次，换语不重放通知/启动错误、不多start/retain/release；确认/菜单/邀请码与Share guard保留原target/title/content/banner/source/expectedRef，未知诊断与默认昵称数据不改。历史独立子批继续。

P6A3-D2C白板媒体/反馈：14路径工程完成；5文件20例、包type/白板边界、44key三语runtime、Node纯feedback owner/参数快照与范围格式静态通过。真实preview事件链保持同img/src/Board/ext与读取次数，默认caption可变而用户中文caption保留；file-drop同Toast/单上传、Export自产kind/未知raw、video自定义同名label通过。独立5插件AST对照非UI协议保持，原名字/URI/default/body/上传导出动作不改。导出弹层与节点附属UI另批。

P5 MCP详情/配置/导入：13路径工程完成；已有插件MCP/解析24例及真实ServerForm状态1例通过，desktop类型/构建、forms三语参数/复数与范围静态格式通过。换语保留同输入DOM/焦点/选区、密钥掩码与原值、无效JSON和未提交draft，修正后仍生成原名称/description/带空格参数。旧校验文案断言维护为issue语义契约；独立AST证明emptyDraft、pairs、草稿/存储转换、序列化、敏感键和transport描述11函数原样，协议/缓存/日志正文不改。

P5手机实际听写：24路径加Root原始诊断JSON工程完成；10文件78例中77通过，另聊天composer8例通过；唯一toolbarVoiceMode:66左右顺序布局断言在改动前基线已失败，相关toolbar源码/测试未触及，未删断言或转skip。mobile最终类型/构建、三语参数/复数/范围静态及实际Node无DOM分类烟测通过。真实fake timer保留录音实例/startedAt/选区、quiet10s、overlay原timer lease/portal/caller hint；EN界面仍按原ja-JP识别配置，未知含中文配置字样的诊断不跳设置。旧helper/regex消费清零退出，原生参数/计时器体/速记正文/coach生命周期AST对照保持。

P6B历史：16路径工程完成；共享模型13基线、desktop历史2、mobile历史2及既有editor13通过，两端最终历史各2复跑与双端type全绿，三语desktop46/mobile35 key参数/范围静态格式通过。真实Query/预览/恢复契约保持筛选焦点、同readonly viewer/正文缓存、原operationId/sequence；mobile compare=true只由prepare触发，确认/重试保同detail与headRevision，在途不重发。旧Panel显示helpers/CHANGE_LABELS/errorMessage消费清零退役；历史原因/标题/正文/actor/target版本ID原样，未动网络/models/Rust。

P6A3-E1导出弹层：6路径工程完成；3文件15例、包type/白板边界、export19key三语对账与范围格式/静态通过。独立AST严格对照初始化/reset/选择/尺寸/Slider和截图-下载-恢复选区保持；真实在途换语只capture一次，同Blob/filename路径与控件配置保留。选择null属性原归一化为缺省的行为不改，回归按原selectedElements与空框选语义验证。

P5 MCP显示目录：10路径工程完成；真实MCP/配置/表单3文件26例通过，desktop类型/构建、三语参数与范围静态/格式、启动/插件边界通过。新增真实场景验证内置名称/说明/可用性跨语更新，保原检索/焦点/选区与同卡片DOM，不多调用工具factory；原tool数组/声明不变，用户服务器即使与内置ID相同也保原配置。独立AST证明所有启停/保存/导入/删除/重连/log/scoped source函数与memo/effect依赖不变；共享AI定义不翻译，显示key旧字段消费者清零退休。

P6A3-E2节点/字段：20源码加Root editor4路径工程完成；4文件20例、包type/作者边界、nodes24key三语复数参数与范围静态格式通过。真实草稿/revision/单报/选区/订阅、NotePeek observer不重读、外框输入不重建且失焦才提交通过；旧Column显示3例4断言随helper退役，其余16布局算法例保留通过。Root纯公开路径用原生Node实际无DOM导入并格式化EN/TW保原diagnostic，统一core JSON import attributes，原实现不复制。Audio吞掉的reject/RichText readiness异常与默认正文不改。

P6A3-F白板域收口：11路径加Root guard1完成；公开author→owner桥→runtime→panel真实3文件39例及原1个预览benchmark门控skip，包type/作者边界/20key三语与范围检查通过。name getter原receiver/无提前读、普通值快照、create getter时点/单激活及输入实例保持；图片同img/resource/data。全组件136文件与全生产AST审计已分类合法默认name/概要/诊断/日志/导出像素/原取消哨兵，未发现自产UI漏项或标题身份key。

P6B协作UI审计收口：13路径完成；mobile32例、双端type、三语参数/范围静态格式通过。真实content组件/guard保binding、issue/cause、2秒调度/清理/授权/一次warning，未带码同文诊断不猜译。全域92生产文件非空AST审计剩88节点均为原诊断/日志/默认昵称/写入标题/带码原诊断，0 JSX自产UI和0待审fallback；未扩服务/models/默认名。

P5手机录音卡：21路径完成；原2文件8例增强后3文件11例全绿，mobile type/构建、三语参数/复数、Node真实标记及范围静态格式通过。真实finishing同Promise/标题/选区/先flush后discard、转录移动节点后单probe/create/transcribe/prepare/不abort、恢复顺序与确认同DOM保持；默认标题/regex/Persistence/正文构造/marker与Native-ASR参数逐字节或AST对账未改。

P5共用视频转录：12路径完成；baseline4文件14至final5文件18全绿，desktop type、三语参数/纯binding实际标记、范围静态格式与协议AST通过。下载/ASR options与ja语言、原raw progress、llmConfirm同对象/DOM/确认目标、optionsRequest、Pi流及保存等待均不因locale重开；原消息/字幕/词时间戳与回调参数不变。4条host自产服务进度尚需稳定DTO闭环，未误记迁完，观看界面另批。

P5 Skills目录/详情：11路径加Root平台getter1完成；3文件10例、desktop type、96key三语复数参数与范围检查通过。真实Readonly Editor onInit/DOM/实例、抽屉分区/IPC、agent metadata/tokens跨语言保持；原README/YAML/default name/AI内容不译，SOURCE_LABEL与warning.text消费清零退出。S1删除反馈额外改为getMessage读取当前垃圾桶名称，同一push/任务不变；MODE_OPTIONS尚有S2旧消费者，按分批冻结边界留到S2消费清零后删。

P6浏览器扩展Phase1：26路径加Root lock/架构2完成；扩展7文件43例、desktop Host/module12例、两处type和WXT构建通过，57key三语参数/范围检查通过。metadata更新不重连/握手/onReady/20s心跳，迟到设置/存储快照不覆盖新值，三root/controller/editor/草稿/选区/query身份保持且第三方lang不变。Note旧Markdown fixture按当前原生节点拒旧契约修正，真实Header/保存断言保留；授权happy test由实际pairing后显式推ready去fixture timer竞态，原token/hello断言保留。原实现极快ready先于deriveSas后可能被pairing覆盖的窗口未改认证状态机，未误记已修。依赖offline filtered install仅新增本workspace importer，3处无关peer漂移逐字节核实后回退。正文/库/笔记主体与manifest元数据继续独立批。

P5 Skills工作台：9路径完成；4文件14例、desktop最终type/静态/三语参数复数与协议AST通过。真实草稿/光标/编辑器/未保存确认、生成流与导入token/勾选跨语保留；S1解冻后rg仅定义再删MODE_OPTIONS，SOURCE_LABEL等旧显示表全消费清零。全12生产模块/120 AST项审计无自产UI或译文标题身份残留，合法模板/AI/默认名/regex/诊断/文件URL示例保留。

P6浏览器Note：7路径完成；note-app3/原模型6共9例、extension type、13key三语参数与范围静态格式通过。真实保存pending跨语同Editor/draft、单save RPC与原URL/pageTitle/节点，完成仅打开原cardID；Header/blockquote与保存结构断言保持，未改kit/URL/保存协议。

P6浏览器Library：14路径完成；原7至9例、extension type、79key三语参数/范围检查通过。真实rename草稿/光标跨语不发RPC，非文本草稿仍可打开原note iframe，locale不重挂/重查/改节点；null/空串数据边界及原排序/QueryClient/query身份保留，旧Sidebar/SORT/COLOR显示map清零退役。

P6浏览器actions：13路径工程完成；原ui/annotation9至10例、extension最终type、57key三语参数/范围静态格式通过。真实NoteEditor草稿与原annotation目标跨语不自动保存，菜单/selection不重复触发动作，iframe同node/src；真实Quick请求/PROMPT/PAGE_TOOLS/网页/标注/任务守卫保持，chat缓存错误另独立语义批继续。

P7 MCP声明：SDK新增PluginMCPDeclaration，默认PluginMCPDefinition<string>与旧字符串/receiver快照保持；同owner的Ref参数快照、双owner隔离、切语不重新登记与停用后最后展示契约通过。SDK17例/desktop18例通过，SDK类型与desktop构建通过；真实外部MCP界面/readonly名称/URL草稿光标与工具执行身份、连接次数/配置存储保持。Host/index/官网与desktop插件分篇只交本任务hunk，模板作者文档独立提交并同步指针；实际工具描述/参数/调用与授权不变。

知识地图K1/K2共19源码完成；4文件28例、desktop type、12+70key三语复数参数与原AI/几何/动作/hooks/key AST对照通过。真实同graphItems/hits/currentIds/preview、pending分析/同气泡svg/camera/原discussPrompt保持；全15模块审计无自产UI或译文身份残留，合法AI正文/prefix parser保留。

工具卡R1A/R1B/R2A共27源码完成；read3例、activity相关21例、todo3例与各域type/三语/协议AST通过。真实Image→Provider→ChatContainer placeholder→原ref/发送IPC保持同输入/草稿/光标，发送仍原hidden text；研究tab/interval/scroll、知识详情原快照/按需读取、Todo详情ID/刷新与原动作保持。todo/constants.ts被退役且提交验证文件缺失，其余算法不改。

伴读Chat14/Native4/Bootstrap2共20源完成；chat相关22例、bootstrap既有15例、extension type与WXT产物验证通过。真实composer/quote/model与选项跨语不发送、同按钮发原request；原token/Quick/PROMPTS/PAGE_TOOLS/AI/段号数据不变。3资源产物与token三语可解，命令ID/热键/zip/权限/URL保持；最终58文件非空AST无固定中文JSX，49字面量合法data/诊断与2HTML中性回退分类保留。

查询UI9路径完成；原9+新真实参数/AI/写队列3共12例，desktop type/65key三语/范围检查通过。实际QuerySession/Worker/AI在途跨语不重启或取消，原request一次应用、原expectedRevision/definition单保存；12模块AST剩8为AI请求/持久名/带码诊断/运行诊断，无固定中文JSX。

手机Skills7路径完成；原13+真实UI2共15例，mobile type/40key三语/范围检查通过。真实QueryClient/data/偏好store/Router/BottomSheet/Markdown保原metadata与筛选展开，无重读目录/正文或写偏好，用户选择仅按原skill.id写一次。

项目回顾/PDF6路径完成；既有回顾4例、desktop type/三语复数参数/范围检查通过。独立AST证明原讨论prompt、addChild/openEntity payload与全部effect/memo/callback依赖保持，纯UI未补锁文字测试；视频与网页专属大界面另批。

P6 Native媒体进度：41路径加Root ASR/desktop文档2完成；桌面12文件39例、source4、ASR14、shared1通过，原Windows环境门控10skip保留；desktop/ASR类型、三语21 producer-code非空审计、纯binding实际标记/范围静态格式通过。真实Native→ASRTask→structuredClone IPC→commands验证fraction-only一次完整到达，唯一行为修复为删除原message truthy门槛，无合成timer/重试。0/25/29/98/100真实数值回调AST执行保MarkItDown30+percent*.3/Vibe整数，字幕/文件名/原stage/bytes/空message/unknown保持。4枚新增有意envelope unused改最小void后静态绿，native/下载/取消参数与调度不改。

工具卡R2B：7路径完成；已有2文件4例、desktop type、53key三语与协议AST通过。展开/失效反馈跨语不重query，原parse/minute/title/action/entity/data/hooks/key保持；UTC自然日DST/leap12矩阵与4非法原值透出验证通过，原文案断言维护为time.dateTime协议契约。

手机MCP9路径完成；原协议/生命周期17例至真实form2共19例、mobile type/80key三语/范围检查通过。真实Router/guard/表单/写队列保原input/caret/name/url/headers，保存/连接各单次且原id/transport保持，未知诊断不清草稿；删除confirm同node/目标，空headers继续省略不覆旧值。全aiCapabilities15模块AST固定中文JSX0，剩1为保原message的typed失败诊断，SDK工具数据不译。

工具卡R2C八路径完成；3文件6例、desktop type/33key三语/原parse/query/state/request/write/invalidation/receipt/key及共享日期body对照通过。真实QueryClient/任务传输边界验证pending换语不重query/write/UUID，已有同toast更新语言不重push；纯日期helper原生Node导入与非法原值透出通过，Calendar仅提取helper/import。

项目视频十一源完成；原10+新真实观看/笔记3共13例、desktop type/三语/范围检查与协议AST通过。同VideoPlayer/video/track实例保currentTime/volume/rate且不重转录，标题焦点/选区/Editor不卸载不重查保存；英文摘录仍空title+原句/秒时间戳。empty/user/默认title矩阵证明导出/AI数据与旧值一致，全部原effect/Controller memo/字幕序列化/quoteContent/range保持；共享观看与白板独立继续。

提醒前端10路径完成；既有Sheet1与新增真实生命周期4共5例、mobile type/39key三语/范围检查通过。跨语不request/write/reschedule，权限原reject，排期语言与异步窗口为创建快照；AppContext每render新对象仍不重复listener/drain，完成→cancel_owner顺序保持。Native动作/渠道/稍后文案尚待可选UI快照持久协议，不误记迁完。

手机reading18/context9共27源完成；reading原107至109与入口6共115例，context19例、mobile最终type、70+28key三语/范围检查通过。实际菜单同node/selection且仅点击执行、展开排序不写正文与单步undo、摘录在途不重发，Badge→SnapSheet不重查且先关后按原target跳转；Outline旧label表清零，原data catalog/计数合并/查询deps不改。

影音watch10/chapters9/legacy12加Root日期收束5完成；watch10例、chapters2例、legacy10/原1skip，desktop type/三语及AST对照通过。真实quote原>视频格式/prompt、视频/字幕modal草稿焦点/编辑器/订阅、章节挂起AI与insights坐标保持；原formatDate对新函数54个输入逐个默认输出一致。Root统一editor日期consumer并清零删window-format与死词条，不新增并行formatter；原默认文件/AI标题与时间戳序列化保持。

Markdown F1十二源加Root copy-service1完成；原3文件35至4文件36例、desktop type/44key三语/协议AST通过。实际CodeMirror/useTextFileSession仅隔离IO，保CRLF草稿/history/selection/冲突按钮，原2read/1watch不多save/rebind，keepMine原path+draft一次写。copy既有传输/真实往返11例过；MarkdownFileView仅4 action补id，后续正文UI另F3继续。

项目WebView十一源完成；既有Hook/runner5例、desktop type/build与三语参数/范围静态通过。实际Hook语言订阅回归保progress/complete handler引用、pending与status读取次数，无重复start且原HTML/URL/title/translateToChinese=false完整；原节流尾帧/取消迟到消息仍被丢弃。独立AST证明所有持久/解析/AI数据调用、effect/memo/callback依赖与webview/editor身份props原样；确认仅换展示kind，不改action/目标，原解析文档/笔记n默认数据和aborted哨兵保留。

工具卡R3十四源完成；全renderer13文件53例、desktop type/89key三语/协议AST通过。真实双Editor三语copy全MIME逐值相等，HTML无本域UI/sr-only，真实insertData回原完整fragment/bold；同实例/选区/序列化和反馈pending不重发。31生产模块/74 AST项审计无自产UI或译文身份残留，合法AI hidden context/4模板value/诊断/原合成copy text保留。

影音surface19/selector11共30源完成；surface原4文件10至12/原1skip+实际EditorKit命令1共13pass，selector真实基线1至迁后1pass，desktop types/三语/AST通过。实际命令/插件身份不自动play-pause-capture、原ensure/quote/args保持，getLabel receiver/工具身份不触locale emit；modal/resolver挂起跨语不cancel/analyze/reset，defaultVariant/焦点与原provider/title/cover/url/ref完整。Known native下载失败另DTO闭环，不误归unknown。

Markdown F2九路径完成；原10至11例、desktop type、29key三语及原路径/IO/drag/defaultname对照通过。实际延迟重命名跨语保同NameInput、焦点/光标与单次beforeMutate，目录过滤与路径边界原契约保持。

Native通知十四路径完成；真实前端21例、mobile type/lint、48key三语通过；Android离线生产Kotlin编译成功。Swift旧/新/坏ui往返、类别稳定隔离/重启并集及真实前端→SDK嵌套桥接契约通过，iOS13 codec typecheck与插件语法通过。完整iOS App/插件链接未执行（本地无Tauri/SwiftRs simulator预构建模块）；未作设备投递验收。

在线视频失败十五路径完成；四文件21例、desktop type、三语与原8分类诊断逐字对照通过。真实Native handler→structuredClone→commands覆成功/已知失败、重复任务取消/HTTP/cache identity；原normalize旧导出消费清零退出，UI重投影保任务和原始未知cause。

远程视频失败十九路径完成；desktop基线11至13、shared1至2例通过，desktop type/范围静态/三语runtime与Node无DOM实际烟测通过。真实Native→structuredClone→commands保原文件名/成功值、HTTP与缺参数English原message，unknown/Abort仍原reject；100ms原进度时点由fake timer验证。跨语不重cache/status或重通知，原fallback src及下载参数/清理与App memo[]保留。

手机协作设置六路径完成；新2草稿/在途/原值落盘与既有settingsModule1共3例、mobile最终type/lint和22key三语通过。真实useCollaborationRuntime/store/BottomSheet/Router保同输入焦点/光标，跨语不start/retain/release/submit；服务器成功前不persist，成功后只写原trim昵称且保其它设置字段。

手机外壳与导航二十七路径完成；启动/面板8例、详情选择/协作工具栏15例、mobile type与shell构建通过，三语语义key/插值/复数由真实runtime对账通过。失败页跨语保原始路径诊断/同重试按钮且只点击后单执行；ready AppShell无locale Hook，现有业务effect依赖与存量错误解析保持。范围lint仅原AppShell cards与Pan hooks/FastRefresh三warning，未扩大修复。

Markdown F3十四源加Root Core/README二路径完成；全窗口9文件49例、desktop与editor包type、三语及协议静态对照通过。真实Host下短/长未同步反向原生选区原先回跳，隔离语言订阅与aria标签后保原，既有同Slate/代码控制器/源码/撤销与转换失败不重读契约保持。全35生产文件/64 AST项审计仅合法默认名/复制alt/raw诊断，无固定UI残留。

演示模式八源完成；已有cameraPlan/sections六例、desktop type/build与32key三语语义/插值/实际runtime复数通过。独立AST严格对照四UI全部非展示handlers/hooks与timer/observer/navigation不变，SlideFrame/sections/cameraPlan/frame逐字相同；纯UI改动未补锁文字或样式测试。

发布设置九路径完成；全发布原10例通过，usePublishConfig原1至新增真实在途契约2例通过，desktop type/build、43key三语runtime与范围静态通过。真实QueryClient/setting保同request/providerConfig/配置草稿，跨语不重查模板/目标或重check；完成仍归原请求。独立AST对照全部发布request/存储/连接动作/faviconIO/原生选择参数、模板字段与ProviderFormView binding/自动检测effect保持。

来源标签与手机占位十二源完成；desktop3文件21例/原1skip、mobile2文件14例及双端type/范围lint/三语runtime通过。三注册者AST除getLabel和import全等，原工具身份/effect deps/白板会话性能原样；手机provider id/match/数组不变，已追占位仅用于渲染无写入/导出路径。

白板宿主图片网页十四路径完成；旧组装3pass/原1skip加新5真实契约共8pass/1原skip、desktop type/lint和47key三语通过。真实Dialog/Input/白板session/Shared Webview验证草稿caret、同preview/signal/单submit、原HTML字节与文件名/local来源、失活目标不写及同iframe/src/resolver只一次；10生产源审计无固定中文JSX。

白板影音外壳十一源完成；真实异步状态2加原组装3共5pass/原1skip，desktop type/lint与三语runtime通过。实际Selector/白板api挂起传输后换语不再次选文件/写入/关闭，原File与board参数保持，loading只创建一次、完成dismiss同ID；AST除显示/读取器外整源码全等。

Compose C1九路径完成；原2文件6至3文件8例、desktop type、24key三语与原kinds/order/handlers/query/action/keys/模型AI静态对照通过。真实IntentCard/Popover跨语保同草稿/光标/焦点/选中kind，不start/skip/save；显式提交仍原trim intent与EntityRefKind，Layout原宽度prefs及正文白板不变。

远程影音URL八路径完成；原/迁后4例、desktop type/lint、三语runtime及AST通过。真实表单跨语保URL草稿/焦点/选区、同alert且不submit，确认后仅原trim；HTTP(S)音频和原允许ftp的视频差异契约仍通过，全部真实consumer接口保持。

发布执行十二路径完成；全发布三文件11例通过、store增强后原4至5例通过，desktop最终type/build、实际三语runtime与范围静态通过。真实在途store换语保同run/progress handler且只一次执行、不提前通知；缺模板与外部同文异常分开归属。独立AST对照原发布/导出/目录参数、全部callback/effect依赖、250ms debounce与常驻handler保持；纯耗时函数Node无DOM导入与旧14边界输入默认输出逐一相等。范围warning仅原store测试空函数/unused与useRun cleanup ref四条。

TTS工作台十一源完成；原2例加真实全流程契约先基线3至迁后3通过，desktop type/lint与Node无DOM已知/未知/cause烟测、三语runtime通过。生成挂起→同audio→添加挂起跨三语保voice/输入caret/Blob/MIME/URL/currentTime/volume/rate，synthesize/getVoiceList/dispose各一次，无额外pause/revoke/submit；AST证明effects/loadVoices/play/cleanup整段与原上传数据参数保持。

Document A十五路径完成；既有相关16例与新4真实契约共20通过（旧16首跑在普通源修改后，不称改前基线），desktop type/lint与40key三语通过。真实白板session/QueryClient保搜索caret/选中行、不重查/释放/放入；Suggestion逐字段保旧reason/summary/key/kind/title/ref且无新flag。旧entityTime零消费者删除，9输入×沪/纽约含DST对照数值与相对时间事实一致；11生产源无固定中文JSX，余4为原持久原因数据，原pickSide FastRefresh warning保留。

Compose C2八路径完成；全域4文件10例、desktop type与32key三语/协议静态对照通过。真实public Whiteboard/ComposeCanvasLayer/QueryClient与查询保同Board/订阅/任务，不重搜或摆放且原deadline不重置；实际Slate引用/取消/历史、ToastHost action跨语保同回调与数据，显式undo仍按原frame ID/article42恢复。全15生产/20 AST项仅合法持久默认值与诊断。

Document B十四路径完成；原Reader9+materials12共21基线至增强22例通过，desktop type、31key三语与范围检查通过。实际Reader/store/prefs/board保同阅读纸与编辑器承载/回调、dock和800ms日记尾调用，切语不提前flush且仅保存原latest内容；ContentEditor沿旧连接器stub，不宣称内核验证。10生产源剩3中文均原invariant/持久quote/PDF默认名，原act/PDFjs/queryFn及lint warnings保留。

共用insights九路径完成；原10例至两文件13例通过，36key三语与原controller/effect/memo/AI/装饰/selection/connect/focus及mini-graph/queries/leaf静态对照通过。真实pending任务只一次、同mark/popover/decorator，实际compose copy消费和未同步反向native Range保持，讨论仍原中文prompt与targets。本域类型无错；当时整端日志仅外域DocTasks Translator调用WIP，后续联动类型统一收口，不误记当次全端绿。全9生产/17 AST审计无自产UI漏项。

发布选择器二十路径完成；恢复后直接三文件9例通过，真实项目scope pending、只读预览未同步反向原生选区、英文缺省标题检索后跨语保持命中/草稿/caret与原ID动作。40个状态/effect/callback/virtualizer声明和所有key保持，loader/selection writes/scope codec逐字相同；实际旧新converter对照保tag/content/ref/ID/顺序与原请求，缺省仅移入UI词典。三语runtime、类型/构建与范围lint已通过。

VideoHost二十二路径完成；7直接文件29至31例及真实Bili/YT ZIP双窗口Chromium功能验证通过，最新联动desktop type0。15个canonical消息与JSON逐字对账，三语runtime/Node纯入口证明host/cache两envelope及三UI投影、伪code不猜译/unknown TypeError/显式空值保原与额外cause/stack/url不传。旧result/error/errorName wire字段全消费者及script清零退役，plugin-local仅必要一行，自有范围lint/diff通过。

DocTasks七路径完成；原doc12与element definitions1基线/最终通过，最终含Blank联动14例通过；13key三语/参数、范围检查及最新联动desktop type0。候选/日期/动作协议原样，旧warning保留，不为无消费者命令引入runtime。

Blank七路径完成；既有真实Editor配置增强契约与DocTasks/element合计14例通过，13key三语/参数、范围检查和联动desktop type0。草稿/焦点/caret跨语不写，显式保存单次保原节点值；暴露的旧div-in-p结构warning未借本批扩修。

附件九路径完成；editorVoid原26基线至联动27例通过，真实Dialog/同File/上传开关/inflight跨语保原onOk参数；15key三语、scope lint/diff与desktop type0。渲染数据根无新locale订阅，原上传与插入守卫保持。

ProjectList九路径完成；navigation/markdown原3例基线至最终通过，现有导航例改vi.waitFor替代真实sleep并保全部原断言，新增跨语真实QueryClient卡片/结果身份与不重查契约；5key三语、范围检查与desktop type0。

## 当前子批任务

- [x] Investigate/Triage/Understand the problem：高级电子书、待办/日程与日期/提醒依赖已盘点并按独立文件域并行落地。
- [x] 交付 P4A/P4B 联动：两端待办/日程、公共日期/提醒、纯日期显示与来源语义、共享分组弹层同批验证提交；原数据/协议/业务算法保持。
- [ ] 持续并行（进行中）：P5通用设置、对话与输入组件已分批验证；白板公共UI、协作状态与对话外壳并行，Root收束已验证子批、跨域语义接口与剩余入口。

## 收尾与退出

全域迁移完成或明确停止后，当前接入事实沉淀到架构文档、作者用法保留在相应包或插件指南；将可复用操作沉淀为开发指南，删除本任务目录并更新 docs/README。文案遗漏或验收待办未有结论时不宣称全应用完成。

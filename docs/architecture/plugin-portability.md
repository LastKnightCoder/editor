# 跨端插件宿主

## 范围与分发边界

桌面、Android 和 iOS 共用一个 SDK、一套作者模板和格式 3 的 web-v1 包。公共 API 与作者约定以 [SDK 跨端契约](/packages/plugins/docs/portability.md) 为准；本页描述客户端装配。当前作者契约使用 SDK 0.37.0/UI 0.4.0，对应模板的最低宿主版本为桌面 0.59.2、Android/iOS 0.2.3。中心通过人工上架审核与 /v2 分发，具审核权限的作者本人经已绑定仓库 CI 发布可自动批准；作者负责平台适配和测试，审核者不承担平台测试或验证记录。平台开关独立于客户端安装能力，线上配置以[门户运维手册](/apps/plugin-portal/infra/运维手册.md)为准。正式构建只接受固定中心安装，拒绝任意开发来源安装。

可信插件与宿主共享 JavaScript、React 和 DOM；摘要、模块白名单、API 能力与数据授权不构成恶意代码沙箱。同线程同步死循环只能在后续启动恢复，不能承诺抢占或后台常驻。

## 中心数据边界

逐 API 的实际宿主支持与作者适配要求以 [SDK 支持矩阵](/packages/plugins/docs/api-support.md) 为准。作者与上传严格校验词表；客户端的 readPortablePluginManifest 只放宽未来能力名读取。未知 required 在求值前拒绝，未知 optional 保留但不授予能力，对账审核清单时不得删除；未知结构、profile 和权限继续拒绝。模板与中心共用发行校验，移动非空权限在运行前再拒绝。客户端能力随对应客户端版本分发，不能由中心部署推断客户端已升级。

仓库内 `@tau/plugins/center` 提供中心/宿主共用的清单联合类型、目标摘要、结构化兼容原因与客户端接口。兼容纯函数仅检查平台、客户端/API/包版本、profile 和能力；调用方仍须核验发布状态、来源和权限。旧格式只投影为 desktop，无真实 host 返回 unchecked，不回退到最新但不兼容的版本。该入口不随作者 SDK tarball 暴露。

宿主请求的 profile 名和能力名分别校验：profile 使用小写字母、数字、点和连字符；能力使用小写字母开头的字母数字标识，保留 sourceEditor、editorCodecs、runtimeStyles 的大小写。规范化只去重和排序，不改名或映射版本后缀。

门户 `PortalApi.center` 提供 /v2 HTTP 适配与查询 hooks，沿用错误信封与取消信号。/v2 的平台计数、选版、发布状态与格式 3 审核契约见[门户协议](/apps/plugin-portal/docs/协议.md)。旧公共 v1 过滤格式 3；客户端真实失败不会回退旧接口或模拟成功。显式 mock 可注入测试发布记录，不生成可安装 ZIP。

移动 `services/pluginCenter` 与 `features/plugins/data/center-queries` 通过固定操作的 Tauri 命令访问中心，不把请求 URL 或宿主版本的决定权交给页面。原生使用实际平台、应用版本和能力；禁止跳转并限制响应大小，保留结构化错误。默认 origin 固定，调试构建可指定 HTTPS 或本机 HTTP；release 构建忽略调试来源。中心安装只接收 pluginId/releaseId，原生 resolve 后下载、暂存，TS 对账规范化清单与审核记录，原生提交前再次 resolve。来源记录包含 origin/releaseId，普通开发 commit 不能提交中心包。

## 桌面宿主

`DesktopPluginProvider` 给 PluginHost 注入同一环境源；应用根部的 Provider 覆盖主窗口、辅助窗口与静态内容。平台由宿主明确为 desktop，输入精度由 any-pointer 媒体查询更新；布局由插件容器决定。作者环境只含 platform/input，宿主兼容能力独立传入 PortablePluginHost。兼容校验读取桌面构建版本与移动原生 package_info 版本，不写死测试版本。语义 navigation 入口复用 DesktopPluginRuntime 的页面/侧栏模型，和旧 sidebar 条目使用不同内部身份；页面注销、激活失败、停用都会回收入口。贡献统计包含 navigation。

真实页面经 `features/plugins/pages/plugin-page.page.tsx` 承载。实例上下文管理状态提供器、活动状态、浮层退场与离开守卫；PageProvider 的通用守卫在导航前检查，异步结果过期不执行旧导航，不引入插件业务依赖。页面无效时卸载作者组件，保留宿主的不可用提示。

桌面 0.59.1 从 v2 获取本机兼容版本，下载前后核对精确 releaseId、摘要与清单；PluginUpdates 复用原目录、事务、备份及来源恢复，首次安装仍默认停用，内容插件启用后完整重启生效。格式 3 的读取保留原始清单，复用平台能力检查与共享求值/节点等级投影；正式页面和独立内容进程使用同一产物，主进程不执行作者代码。正式扫描/启用/内容启动拒绝非固定中心来源的跨端包。

未打包 Electron 仍可通过显式 `TAU_PORTABLE_PLUGIN_DIR` 读取隔离开发目录，`.enabled.json` 为开发者选定的 ID 数组；该目录不进入正式安装事务。格式 3 正式内容包保留原始清单参与博客分发，开发来源仍不能发布；静态消费者不激活应用生命周期，渲染协议保持 1。

## 移动宿主与页面

正常 AppShell 在当前数据库作用域挂载 MobilePluginProvider，不依赖桌面 runtime/store。包清单通过 react-query 获取；切库先完成旧运行时清理，再恢复文件事务、校验包、冻结静态内容、激活页面与命令。包验证与装配失败记录到管理界面，不伪造兼容或回退另一个来源。

“我的”仍是 settings Tab；插件入口作为 props 插槽进入 SettingsPage 的独立插件功能区。pluginPage、pluginSettings、plugins 均由移动 definePage 自动注册。页面身份与标量参数规范化使用 SDK 规则，返回、转场、保活与 LRU 使用原 router。停用/更新按新会话生效，不替换打开的正文实例。

页面的活动状态与系统后台状态分别处理。作者应在操作时持久化数据，不依赖 deactivate 一定执行。启动标记位于本机 localStorage，仅用于发现上次插件启动未结束并跳过该次加载；包文件与业务 KV 不放 localStorage。

移动管理页消费 `features/plugins/data/usePluginManager`，查询、动作可用性与原生变更由控制器统一编排。动作在调用时复验清单和会话，不只靠按钮禁用；操作互斥，清数据固定工作区，切库/卸载使旧回调失效。启停等操作使用原生 managementEnabled；development 只表示开发来源安装资格，JSON 入口还要求前端 DEV。正式构建只运行来源记录与固定中心 URL 匹配的包；启用和恢复同时检查持久撤回记录。取消或失活后的迟到暂存结果不提交。

中心安装由 `app/plugins/center-install` 按应用 QueryClient 保存任务，所有页面通过同一个订阅式 hook 消费；Activity 隐藏、路由深入和页面卸载不会取消中心任务。取消操作终止原生等待响应/读取数据的过程，失败重试仍使用原 releaseId 并重新核验。此机制不承诺进程被系统终止后继续下载；原生事务仍负责保留旧包与恢复文件状态。

已安装清单分别提供 currentVersion、pendingVersion、centerSource、撤回原因和状态刷新失败标记。首次仅有 next 时 currentVersion 为 null，不冒充已安装；固定中心新装包默认保存启用意图，下一完整会话生效，更新保留已保存意图，损坏的 enabled.json 不会默认启用。权限说明不等于授权。Android/iOS 原生宿主提供 browsingEnabled/installationEnabled，正式安装仍由中心复验平台分发与发布状态；非移动宿主不能安装。

中心包在启动及应用回到前台时核验发布状态。已有中心包的会话监听文档可见性、窗口 focus 和 Tauri 原生 focus；考虑 WKWebView 可能缺失前台事件，同时每 30 秒进行可见状态核验，后台不主动刷新，切库/卸载释放监听与定时器。原生按 origin/releaseId 保存撤回/禁用记录，确认撤回不会被后续 available/not_found 覆盖；断网保留既有记录，状态文件损坏时不装配中心包。前台获知不可用后回收页面并把节点写入策略设为 none；保留当前静态内容至下一会话，原文不删除。该机制不抢占主线程死循环，也不回滚已提交数据。

## 原生文件事务与数据

移动原生中心选版与 TypeScript 编辑器运行时共用 apps/mobile/plugin-capabilities.json，能力属于宿主配置，不进入作者环境。原生请求覆盖前端传入的宿主声明，安装与实际加载继续独立复核；清单只登记真实接入的功能，不从 SDK 完整词表自动授予。

Rust 在应用私有目录 `.editor/portable-plugins/<id>/` 保存 current、staging、next、backup 和设备本地 enabled.json。开发来源描述包含 id/version/url/size/sha256；仅接受 HTTPS 或本机 HTTP，不跟随重定向；同 ID 不跨来源 origin 接管。下载限额、ZIP 总量/文件数、越界、重复路径、符号链接、入口与完整性清单均在原生侧校验。支持模板的单层插件根目录 ZIP。

下载完成先留 staging，前端重复校验目标平台、最低客户端版本和能力，再提交为 next/pending。下一次完整插件会话切换文件：先记录 switch 日志，再保留旧 current 为 backup、将 next 改为 current；中断后恢复。取消清暂存/待生效包；恢复备份只恢复代码，并在下一会话生效，不回退私有数据。安装与启用意图属于设备，不从同步自动授予。

私有存储复用主库 plugin_kv，不新增 schema。TS 适配器固定发起库并检查实例 signal；Rust 核对活动库后打开该固定库连接，后续切库也不会把写入转移到新库。单值限 1 MiB，JSON null 与缺失分开。已发出的同步原生写入可能完成于原库，取消不撤销已提交数据。卸载包默认保留私有数据；独立清除操作要求插件已停用并确认，只删除当前工作区的该插件 KV，不删除其他工作区或正文。

## 正文与公共交互

普通正文及其预览使用 mobileContentPlugins 的同一快照，Markdown 转换使用同一 codec。Kit 缓存按快照对象失效；闪卡等其他场景不自动加入插件扩展。键盘位置的 InsertPanel 将插件 blockPanel 显示在插件分组，按 title/keywords 搜索；图标沿用组件契约。执行前恢复打开面板时的选区，插入后保存新选区并关闭面板回到键盘，原实例失效或只读时不执行。指定 allowedKinds 的轻量插入面板不自动加入插件项，插件项不混入内置最近使用记录。

SDK 的支持等级投影由桌面与移动共用：none 不装配；render 去掉编辑行为与插入/命令贡献；edit 提供编辑。IElementEditingPolicy 将限制同时传给标准 UI、useElement/useSourceBlock 与 captureElementSubmission，拒绝后的旧提交不能因后来变为可编辑而复活。同一个 extension 混合 render/edit 时，宿主保守撤下该组命令与插入入口；需要独立插入时作者应拆成多个 extension，节点身份不变。未知节点保留原数据。

公共 SourceBlockEditor 按每个 EditorKit 的宿主服务选呈现方式，不在运行时切换全局实现。源码输入统一使用 CodeMirror 的 textarea 通道，在按键命令前同步待输入值，避免移动 contenteditable 延迟回读与快速回车竞争。触摸浮层经 UiProvider 自有的 Portal 容器挂到正文 DOM 之外，隔离按键、输入法、输入及剪贴板事件，避免 React Portal 冒泡触发外层 Slate 热键；页面隐藏时回收 Portal 并取消未保存草稿。草稿只在保存时提交，取消/返回不写入；外部源码变化时禁止覆盖，隐藏/卸载/只读通过提交守卫终结旧操作。普通块外框提供触摸菜单入口，菜单复用标准上下移/删除等命令。真机键盘手感不由此声明为已验收。

UiHostProvider 只接受平台中立的 dismiss 登记函数。真实 Dialog/Drawer 在打开时登记，关闭/隐藏时注销，锁定或关键模态消费返回而不关闭。UiProvider 继承当前 Portal 容器；插件页面使用局部 PortalScope，避免浮层遗留在其他页面。公共 UI 不引用应用路由；模态层级边界保证同批打开时，宿主返回也先交给子模态。

博客 ContentRenderer 独立注入 web/只读环境并订阅输入变化，不依赖 activate；加载器读取原始格式 3 清单并只求值静态贡献。

## 派生数据消费者

移动端的前端导入、导出与正文预览使用插件 codec；Rust 的列表摘要、搜索摘录和部分关联摘要仍只递归抽取 text/children，不解释插件源码字段。因此插件源码不进入这些移动检索结果，管理界面明确提示；原始 JSON、同步与协作投影保留节点字段，不在 Rust 执行插件 JS。未知节点的 Markdown 保真仍由编辑器通用封装承担。

## 验证入口

`plugin-validation` 模式保留正常 AppShell，只注入行为验证器；独立应用标识复用专用测试应用，输出 dist-plugin-validation。验证器调用正式原生安装服务，随后从真实“我的”页打开计数器、在正常卡片正文编辑 ABC；报告写入隔离测试库的 validation.host/report。普通构建不包含自动验证器或固定包来源。

旧 `plugin-spike` 仍是独立验证壳，仅用于历史最小实验；其 localStorage 双包、替换入口、历史重置和文本编辑面板不是正式路径。正式宿主复现见 [接入校验指南](/docs/guides/plugin-portability-hosts.md)，旧壳复现见 [spike 指南](/docs/guides/plugin-portability-spike.md)。

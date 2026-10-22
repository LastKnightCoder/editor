# 跨端插件宿主

## 范围与分发边界

桌面、Android 和 iOS 共用一个 SDK、一套作者模板和格式 3 的 web-v1 包。公共 API 与作者约定以 [SDK 跨端契约](/packages/plugins/docs/portability.md) 为准；本页描述客户端装配。生产插件中心仍使用原格式 1/2，不发布 npm，也不接受格式 3。移动生产构建没有安装入口，Rust 安装/启用命令拒绝 release 构建；平台感知分发和商店审核另行实施。

可信插件与宿主共享 JavaScript、React 和 DOM；摘要、模块白名单、API 能力与数据授权不构成恶意代码沙箱。同线程同步死循环只能在后续启动恢复，不能承诺抢占或后台常驻。

## 桌面宿主

`DesktopPluginProvider` 给 PluginHost 注入同一环境源；应用根部的 Provider 覆盖主窗口、辅助窗口与静态内容。平台由宿主明确为 desktop，布局和输入由媒体查询更新。兼容校验读取桌面构建版本与移动原生 package_info 版本，不写死测试版本。语义 navigation 入口复用 DesktopPluginRuntime 的页面/侧栏模型，和旧 sidebar 条目使用不同内部身份；页面注销、激活失败、停用都会回收入口。贡献统计包含 navigation。

真实页面经 `features/plugins/pages/plugin-page.page.tsx` 承载。实例上下文管理状态提供器、活动状态、浮层退场与离开守卫；PageProvider 的通用守卫在导航前检查，异步结果过期不执行旧导航，不引入插件业务依赖。页面无效时卸载作者组件，保留宿主的不可用提示。

未打包 Electron 可通过显式 `TAU_PORTABLE_PLUGIN_DIR` 读取开发目录；`.enabled.json` 是开发者选定的插件 ID 数组。主进程只读文件、拒绝链接并校验摘要，不执行作者代码。前端在首次 EditorKit 创建前冻结内容贡献，页面由真实 PluginHost 激活；独立内容渲染进程接收同一开发快照，转换/索引使用相同 codec。该目录不进入生产插件目录、来源记录或中心协议。启用跨端开发内容包时拒绝正式博客发布，避免输出没有分发协议的资源；原有桌面包的博客路径不变。

## 移动宿主与页面

正常 AppShell 在当前数据库作用域挂载 MobilePluginProvider，不依赖桌面 runtime/store。包清单通过 react-query 获取；切库先完成旧运行时清理，再恢复文件事务、校验包、冻结静态内容、激活页面与命令。包验证与装配失败记录到管理界面，不伪造兼容或回退另一个来源。

“我的”仍是 settings Tab；插件入口作为 props 插槽进入 SettingsPage 的独立插件功能区。pluginPage、pluginSettings、plugins 均由移动 definePage 自动注册。页面身份与标量参数规范化使用 SDK 规则，返回、转场、保活与 LRU 使用原 router。停用/更新按新会话生效，不替换打开的正文实例。

页面的活动状态与系统后台状态分别处理。作者应在操作时持久化数据，不依赖 deactivate 一定执行。启动标记位于本机 localStorage，仅用于发现上次插件启动未结束并跳过该次加载；包文件与业务 KV 不放 localStorage。

## 原生文件事务与数据

Rust 在应用私有目录 `.editor/portable-plugins/<id>/` 保存 current、staging、next、backup 和设备本地 enabled.json。开发来源描述包含 id/version/url/size/sha256；仅接受 HTTPS 或本机 HTTP，不跟随重定向；同 ID 不跨来源 origin 接管。下载限额、ZIP 总量/文件数、越界、重复路径、符号链接、入口与完整性清单均在原生侧校验。支持模板的单层插件根目录 ZIP。

下载完成先留 staging，前端重复校验目标平台、最低客户端版本和能力，再提交为 next/pending。下一次完整插件会话切换文件：先记录 switch 日志，再保留旧 current 为 backup、将 next 改为 current；中断后恢复。取消清暂存/待生效包；恢复备份只恢复代码，并在下一会话生效，不回退私有数据。安装与启用意图属于设备，不从同步自动授予。

私有存储复用主库 plugin_kv，不新增 schema。TS 适配器固定发起库并检查实例 signal；Rust 核对活动库后打开该固定库连接，后续切库也不会把写入转移到新库。单值限 1 MiB，JSON null 与缺失分开。已发出的同步原生写入可能完成于原库，取消不撤销已提交数据。卸载包默认保留私有数据；独立清除操作要求插件已停用并确认，只删除当前工作区的该插件 KV，不删除其他工作区或正文。

## 正文与公共交互

普通正文及其预览使用 mobileContentPlugins 的同一快照，Markdown 转换使用同一 codec。Kit 缓存按快照对象失效；闪卡等其他场景不自动加入插件扩展。插入面板消费插件 blockPanel，执行前恢复原选区，原实例失效或只读时不执行。

SDK 的支持等级投影由桌面与移动共用：none 不装配；render 去掉编辑行为与插入/命令贡献；edit 提供编辑。IElementEditingPolicy 将限制同时传给标准 UI、useElement/useSourceBlock 与 captureElementSubmission，拒绝后的旧提交不能因后来变为可编辑而复活。同一个 extension 混合 render/edit 时，宿主保守撤下该组命令与插入入口；需要独立插入时作者应拆成多个 extension，节点身份不变。未知节点保留原数据。

公共 SourceBlockEditor 按每个 EditorKit 的宿主服务选呈现方式，不在运行时切换全局实现。触摸方式复用 CodeMirror，草稿在保存时提交，取消/返回不写入；外部源码变化时禁止覆盖，隐藏/卸载/只读通过提交守卫终结旧操作。普通块外框提供触摸菜单入口，菜单复用标准上下移/删除等命令。长按拖拽和真机键盘手感不由此声明为支持。

UiHostProvider 只接受平台中立的 dismiss 登记函数。真实 Dialog/Drawer 在打开时登记，关闭/隐藏时注销，锁定或关键模态消费返回而不关闭。UiProvider 继承当前 Portal 容器；插件页面使用局部 PortalScope，避免浮层遗留在其他页面。公共 UI 不引用应用路由；模态层级边界保证同批打开时，宿主返回也先交给子模态。

博客 ContentRenderer 独立注入 web/只读环境并订阅布局、输入变化，不依赖 activate。格式 3 应用包尚未进入博客分发；已有内容插件可消费该环境。

## 派生数据消费者

移动端的前端导入、导出与正文预览使用插件 codec；Rust 的列表摘要、搜索摘录和部分关联摘要仍只递归抽取 text/children，不解释插件源码字段。因此插件源码不进入这些移动检索结果，管理界面明确提示；原始 JSON、同步与协作投影保留节点字段，不在 Rust 执行插件 JS。未知节点的 Markdown 保真仍由编辑器通用封装承担。

## 验证入口

`plugin-validation` 模式保留正常 AppShell，只注入行为验证器；独立应用标识复用专用测试应用，输出 dist-plugin-validation。验证器调用正式原生安装服务，随后从真实“我的”页打开计数器、在正常卡片正文编辑 ABC；报告写入隔离测试库的 validation.host/report。普通构建不包含自动验证器或固定包来源。

旧 `plugin-spike` 仍是独立验证壳，仅用于历史最小实验；其 localStorage 双包、替换入口、历史重置和文本编辑面板不是正式路径。正式宿主复现见 [接入校验指南](/docs/guides/plugin-portability-hosts.md)，旧壳复现见 [spike 指南](/docs/guides/plugin-portability-spike.md)。

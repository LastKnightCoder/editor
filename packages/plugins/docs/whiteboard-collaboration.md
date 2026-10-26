# 白板协作插件

从 `@tau/plugins/whiteboard` 使用 `defineElement`、`defineWhiteboardExtension` 和 `useWhiteboardAPI`。此作者入口面向已绑定协作文档的画布；旧快照的转换、首次共享和完整业务类型适配由宿主负责，不在插件加载时执行。

本页对应 SDK 0.45.0。0.44.0 及更早版本的路径写入接口不能直接用于当前宿主：将 `schemaVersion/migrate` 改为 `dataVersion/previousVersions`，将路径操作和 `apply` 改为稳定 ID 命令，业务数据使用 `updateElementData`，文本使用 `getTextBinding`。这不是字段的机械改名，须按下文的数据与历史语义逐项适配。

SDK 安装成功只证明作者依赖可取得。插件仍只声明 desktop，并将最低宿主版本设为实际通过组合验收的桌面发行版；不要以 SDK 版本或 Worker 已部署推断客户端已经支持。

## 声明与版本

```tsx
const source = defineElement({
  type: "example.board.source",
  dataVersion: 1,
  collaboration: { textFields: ["source"] },
  resources: [{ path: "cover", kind: "image" }],
  render: ({ element }) => <text>{String(element.data.title ?? "")}</text>,
});
```

`textFields` 和资源路径都相对 `element.data`。字符串字段使用公共 `EditorTextField`，不能通过普通数据补丁覆盖。资源只声明发现位置，不自动上传、下载或授予访问权限；资源地址不能同时声明为文本字段。对象和数组按普通原子 JSON 保存，不提供通用 Map、任意引用槽或任意嵌套富文本声明。

`data` 是独立业务命名空间，可使用 `id`、`type`、`text`、`children`、`geometry` 等名字，不会改变元素外层身份或几何。仍禁止不安全 JSON 属性；已声明的文本字段必须通过文本句柄修改。

`previousVersions: [{ element, access: "read" | "edit" | "none" }]` 只登记直接列出的精确历史契约。相同版本号不代表相同契约；owner、领域、结构、字段或资源声明不匹配时保真占位。read 使用历史版本渲染和只读上下文，允许读取文本句柄但拒绝写入。缺失或不可识别版本仍保留载荷、文字根和契约，宿主可执行通用移动、整体复制、删除与撤销。

宿主不提供数据版本转换函数。`previousVersions` 只声明历史数据的读取和编辑权限，新内容使用当前版本。

## 最小数据入口

| 入口                                                      | 行为                                                                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `getSnapshot()` / `getElement(id)`                        | 返回只读数据；快照包含 pageId、children，元素包含 id/type/data/geometry 等公共外壳，不暴露契约 ID 或字段根 |
| `updateElement(id, patch)`                                | 只接受 name、完整 geometry 和 style；不能替换 data 或改变身份/子树                                         |
| `updateElementData(id, patch, { unset?, historyGroup? })` | 只修改自己的可编辑版本，未指定字段保留；删除使用 unset                                                     |
| `getTextBinding(id, field)`                               | 按精确版本的 textFields 读取，编辑使用观察 revision 与增量；共享宿主历史                                   |
| `submit(commands, { historyGroup? })`                     | create、set_node、set_data、move_node、remove_nodes 身份命令，一批失败零写入，返回 createdIds              |

创建命令使用 `{ type: "create", element: { type, data, geometry }, parent: { kind: "page" | "element", id }, beforeId? | afterId? }`；同一次提交原子登记契约和节点。移动使用稳定 ID 与互斥锚点，不能传数组路径。普通返回值只表示本机接纳，不表示耐久落盘或服务端确认；保存状态由宿主统一展示。

普通数据命令、手势和文本输入共用该画布视图的历史；`historyGroup` 只用于本机分组，不是跨 await 的事务。`getTextBinding` 在组件生命周期内取得并复用，卸载时 dispose，输入控件可登记 registerInput 供关闭前冲刷。Activity 隐藏会回收普通 effect，不应在重新激活后复用已经 dispose 的句柄；可在每次激活时重新取得，或按宿主的插入期持有方式管理。`replace` 不能冒充共享条件替换；异步整段结果交宿主的整文档修订条件入口，冲突或结果未知保留提案，不能重读新值后悄悄重试覆盖。

`captureSubmission` 检查作用域、目标存活与权限，不是内容修订 CAS。旧观察 revision、文档只读、失活、切库、插件激活实例更换和远端投影期间的回写均被拒绝。命令、工具与事件按真实插件归属隔离，嵌套插件 ID 不继承父插件写权限。

## 创建工具与宿主能力

创建 build 和自定义手势 begin/move/end 均收到同一受控 API。创建只返回本元素类型的单个元素；不能夹带路径 operations、宿主字段或他人类型。预览也检查归属，异步结果会再次检查生命周期。加载工厂只登记贡献，未完成装配不能写文档。

桌面为作者提供按插件/工作区绑定的 `IPluginStorage` 和明确的上传、媒体探测、下载及当前文档资源解析能力；不继承任意文件读取或正文写服务。取得的能力引用仍受生命周期检查；资源解析只接受当前文档的托管标识，不能借此读取任意本机路径。私有 storage 不是白板协作状态，也不进入房间历史。

schema 只做本机提交前的同步反馈，不改写远端数据，也不能作为服务器业务校验的承诺。插件代码与画布仍在同一 JavaScript 环境，受控接口不是代码沙箱。完整数据流见 [白板架构](/packages/whiteboard/docs/architecture.md)。

## 与宿主产品操作协作

宿主的跨页移动保持元素和文字身份，复制与可编辑导出保留精确契约；缺失插件也能复制原载荷。复制到另一文档时，托管资源必须重新取得源读取与目标写入权限，并登记为目标资源；外部正文引用不会因此共享。普通加载、远端更新和绘制不执行插件迁移。

演示、页名、板内正文与画布命令进入同一宿主历史；外部正文保持自己的编辑会话和历史。作者 API 仍是原身份命令、普通补丁和文本句柄，宿主的批量导入、正文复制、实体定位和资源文件能力不进入作者接口。

## 容量与支持边界

冻结 profile 为 whiteboard-w1-v1：一文档最多 64 页、5000 个保留元素、1024 个富文本根、150000 个保留富文本节点；Yjs 编码状态最多 8 MiB。一次命令最多 256 项、512 KiB UTF-8 JSON，单个数据补丁最多 64 KiB。删除、撤销和旧位置记录仍可能占用预算，边界外整批拒绝，不截断源码或丢弃未知字段。各项上限不能同时耗尽，也不代表界面流畅度保证。

仅桌面托管白板装配此作者 API；移动端、浏览器扩展和博客未提供白板协作作者宿主。主进程网络门禁与迁移命令的验证，不等于普通界面已经开放分享或迁移；插件不自行调用主进程 IPC。作者无需实现恢复包、迁移日志、资源回收或第二套文本/历史系统。

提交前验证：精确 v1/v2 分发与缺插件保真；中文/emoji 增量输入；本人撤销与远端编辑；隐藏/卸载后异步结果失效；资源声明与跨文档权限；预算拒绝后原内容不变。只通过编译不能证明协作行为正确。

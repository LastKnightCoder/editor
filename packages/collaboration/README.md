# 协作协议与稳定节点模型

正式正文协作的服务与持久化见[协作架构](/docs/architecture/collaboration.md)。本包的 NodeTree 是已实现并经内存测试的稳定节点候选，尚未切换正式房间或执行存量迁移；不能将候选能力视为已发布的白板协作。

## 节点、删除与位置

NodeTree 将节点记录、正文和声明的共享字段保存在稳定节点池中。移动只更新位置引用；正文和源码字段不因移动复制或换根。

正文拆分/合并由 TextSegments 保存持久分界和片段归属，文字仍留在原共享容器。撤销拆分恢复继承归属；合并转发使晚到的片段进入幸存段。选区用原文字相对位置解析当前归属，相同格式的相邻片段只在投影中合成文字叶。局部输入按受影响片段使节点快照失效。

- 一次 insertNode 为其初始子树保存同一创建身份，并在 node-tree:creations 登记可见性。完整初始化和可见性在同一次 Yjs 事务中发布。
- removeNode 只标记指定节点；removeNodes 接收调用方已经观察到的 ID 集合，先完整校验，再以同一删除身份标记各目标，不在接收端重新扩展子树。
- isDeleted 统一判断创建可见性和删除标记集合。不同删除命令独立，撤销一个标记不清除其他删除意图。
- 父节点不可用的存活节点、父子环及合法并发合成的超深父链在读取时形成确定性的恢复投影，不改写共享关系。普通移动不全局修复恢复区；涉及恢复祖先或放到恢复节点之后时，只物化该操作需要的祖先/前置锚点。

编辑器的 remove_node 使用实际观察到的子树集合；解包或合并已移走子节点后，只需标记被移除的外层节点。领域命令负责决定删除集合，公共模型不推断业务意图。

## 公共撤销入口

对 NodeTree 必须使用 tree.createUndoManager({ trackedOrigins, captureTimeout? })，不直接把节点池交给普通 Y.UndoManager。

公共历史在 stack-item-added/updated 时排除该事务的初始化时钟区间，保留同事务中的创建可见性、旧节点修改和后续用户编辑。网络更新本身不被裁剪，初始化不会拆成半次发布。撤销创建隐藏初始子树，重做恢复可见性；节点记录和文字根一直保留，迟到的远端编辑仍能合入原根。

该入口使用当前固定版本 Yjs 的 StackItem/DeleteSet 及事务时钟接口；升级 Yjs 时必须运行节点历史、移动、源码字段与实际编辑器回归。历史和文档的销毁仍由拥有者负责。

本候选的可见性格式与旧 deleted 布尔原型不兼容。缺少创建身份或删除集合时明确拒绝读取/写入，不能自动猜测转换旧候选缓存。正式启用前仍需完成协议版本、基线转换和服务端门禁；本包不自行迁移真实数据。

## 多富文本根与历史归属

new NodeTree(doc, { rootId }) 为同一 Y.Doc 打开独立根。省略时为 content，沿用 node-tree:nodes/root/creations；其它根使用 node-tree:roots:<rootId>:nodes/root/creations。rootId 是宿主保存的稳定标识，最多 128 个 ASCII 字符，首字符为字母或数字，其后可用点、下划线和短横线；不能随页面、标题或字段显示名变化。

当前正文拆并候选的 segments 同样使用各自根前缀并纳入历史作用域；内部片段格式尚未作为正式存储协议发布。

所有根共用 node-tree:contracts 字典；节点身份在各根内唯一，根 ID 与节点 ID 共同寻址。constructor 只建立本机作用域，不把同一 JSON 重新编码成新的协作基线；远端或重启后仍从确认的二进制状态恢复。

tree.createUndoManager 返回 NodeTreeHistory。其它同文档根经 attachUndoManager 加入同一宿主历史，禁止跨文档、裸 UndoManager、整个 Y.Doc 或已释放历史。历史按捕获时作用域记录，后挂入的根不会追溯加入之前的操作；关闭视图不移除历史仍需引用的根作用域。

tree.dispose 释放该包装器的观察者和缓存，不删除共享类型、不销毁 Y.Doc 或历史。宿主最终销毁共享历史；借用方仅释放自身来源。本地插入与移动先检查整棵子树的逻辑深度，超限不写入。根数量和全部根保留节点的总量由 [model-limits.ts](./src/model-limits.ts) 约束，不能通过拆根绕开节点额度。

## 契约格式与预算

契约格式 2 统一由 [content-contracts.ts](/packages/db-schema/content-contracts.ts) 规范化、计算 SHA-256 和验证。editor-node 使用 kind/isVoid/textFields；格式内 structuredFields 固定为空，不提供作者声明或合并逻辑，以保留共同契约格式的摘要兼容；whiteboard-element 使用声明式结构，普通作者只声明字符串文本与资源，白板不开放 structuredFields、Map 或任意富文本字段语言。

一个字典可同时保存两个领域；富文本 NodeTree 只接受 editor-node 契约。版本 1、缺领域、摘要不符或同领域同归属同类型同数据版本不同契约均拒绝。真实文档加载端必须先验证契约字典与文档信封；NodeTree 不是不可信网络数据的完整验证器，不自动升级旧缓存。

冻结样例见 [whiteboard-w1-v1.json](/packages/db-schema/fixtures/whiteboard-w1-v1.json)。节点契约预算、资源预算和白板准入预算分别由中立契约模块、content-resources 和 model-limits 导出。assertWhiteboardBudget 验证宿主计算的用量；assertWhiteboardDataPatch 只做普通补丁的纯校验，不代替实际提交、实体授权或服务端总大小检查。W2/W5/W6 接线时仍须在各自事务边界执行这些规则。

## 白板纯数据模型

[WhiteboardModel](./src/whiteboard-model.ts) 在同一 Y.Doc 内管理多页、稳定元素池及位置引用序列。它不依赖画布、React、插件执行代码或持久化服务；不是现有 Board/WhiteboardAPI 的替换实现。

- 页顺序采用 pageOrder 引用与每页 placement；元素采用每父级 Y.Array 引用与原子的 parent/token/fallbackPageId。移动仅换引用，不能重建元素、正文或源码根。页和元素 ID 由宿主模型生成；受控画布创建可提供宿主已分配的元素 ID，模型检查文档内不复用，删除后仍保留。
- 字符串正文与声明的 textFields 使用稳定 Y.Text；富文本 body 使用公共 NodeTree 的独立 rootId，同一契约字典同时容纳编辑器和白板契约。换页不改变根 ID，外部正文实体不在这个模型里复制。
- createUndoManager/attachUndoManager 使用公共 NodeTreeHistory；初始化时钟过滤与创建可见性登记复用公共机制。白板和各富文本根可进入同一宿主历史；删除携带明确观察集合，撤销一人的删除不会清除另一标记。
- 读取先按删除/创建可见性筛选，再按收纳、环、深度投影。环按最小 ID 切一条投影父边；恢复根按 ID 排序进入 fallback 页恢复分区，原页不可用则进入文档恢复区。读取不写共享关系，真实所在页从有效父链计算。
- submit 先在隔离候选执行整批并检查预算，再执行已通过的批次；失败不写真实文档或历史。它返回本机新建 ID，不代表落盘或服务器确认。普通 data/style 按顶层键合并，嵌套 JSON 和完整 geometry 原子竞争。
- receive 串行验证增量候选，缺依赖返回 pending，不物化正文或记历史；候选完整后校验契约、结构、稳定根和预算。排队字节与缺依赖材料有界；takePendingUpdate 供宿主显式取回尚未接纳的材料保全。applied 只表示内存状态接纳。
- dispose 释放模型观察者及持有的 NodeTree 包装器，不销毁 Doc 或宿主历史。构造器只适用于可信/已验证的 Doc；外来基线从空 Doc 经 receive 验证。关闭前，宿主须保全失败增量和 takePendingUpdate 返回的数据，模型本身不提供耐久保证。

候选物理分区为 whiteboard:meta/title/pages/page-order/elements/orders/strings/creations；富文本沿用 node-tree:roots:<rootId>:*，契约字典仍为 node-tree:contracts。meta.profile 固定 whiteboard-w1-v1；这是候选模型标记，不能代替正式协议、documentId、epoch 或权限门禁。页名是共享文本，元素 name 是普通属性；geometry 使用有限页坐标、非负宽高，不在纯模型里猜测 UI 最小拖拽尺寸。

模型按 W1 常量检查保留页/元素、全部公共富文本根/节点、逻辑层级、JSON、补丁、批次和编码状态预算；未编码的空根也占根额度。预算超限的合并候选整体拒绝，不能裁剪任一端内容；线上统一准入与拒绝分支恢复仍须接服务端和会话。8 MiB 是编码状态而非堆内存，当前完整候选预检未作交互延迟或长会话容量承诺。

原始 Yjs 集合及 text/richText 返回值仅给可信宿主集成使用。submit/receive 的检查不是 Y.Doc 全局写防火墙；画布文档绑定通过 preflight 将本地正文编辑纳入总预算，通过 NodeTreeHistory.beforeChange 与 preflightHistory 守门撤销/重做；插件仍使用冻结的 EditorTextField 和 ID 命令，不能获得这些原始根。视图引用复用和手势由白板绑定负责；外部实体、耐久日志、网络授权与真实迁移不由本纯模型接线。

preflight 接收可信绑定的纯候选写入函数，验证后由绑定对真实根执行相同意图；该回调不得包含 I/O、事件派发或插件任意副作用。候选关闭 GC，以保留真实历史仍持有的已删内容；编码预算因此不会因候选提前回收而低估。preflightHistory 复制当前历史时钟集合，并先恢复 Yjs 编码合并掉的结构边界及 redone 链，再模拟撤销/重做；失败发生在真实栈弹出之前。这是当前固定 Yjs 版本的本机预检，不能用来持久化或跨进程恢复历史。

## 白板协议与接纳

`whiteboard-document` 适配共享协议 3，`document-adapter` 与正文共用验证/投影/资源入口；`document-operations` 提供持久编辑回执和整文档修订条件提交，`document-sync` 在发送前保存提案并隔离被拒或过期代次。调用方必须提供事务持久化和鉴权传输，不能把 provider 连接状态当作业务回执。完整边界见 [协作架构](/docs/architecture/collaboration.md)。

# @tau/whiteboard 架构文档

详解 `packages/whiteboard/src` 的架构、插件体系、数据流、渲染与交互原理，以及扩展与调试指南。桌面业务扩展在 `features/shared/whiteboard`，独立示例在 `examples/whiteboard`；装配与生命周期见 [包说明](/packages/whiteboard/README.md)。本文的 IBoardPlugin 是内置扩展复用的私有策略，不是对外插件协议。通用容器来自 `@tau/ui`。

## 一、项目概述

### 1.1 技术栈

| 技术                          | 版本                                                       | 用途 |
| ----------------------------- | ---------------------------------------------------------- | ---- |
| React 19.2                    | UI 组件                                                    |
| TypeScript                    | 类型安全                                                   |
| ahooks                        | useCreation/useThrottleFn/useLocalStorageState 等高阶 Hook |
| eventemitter3                 | 事件总线                                                   |
| immer                         | Draft/finishDraft 管理不可变数据                           |
| lodash.curry                  | 事件处理绑定                                               |
| zustand（仅上下文外部组件用） | 侧边栏等其他状态                                           |

### 1.2 核心特性

1. **插件化架构**：IBoardPlugin 抽象事件处理/渲染/命中/吸附等能力，可自由组合。
2. **多元素类型**：几何形状、箭头、富文本、卡片、图片/视频/音频、思维导图、嵌入网页、Frame、Whiteboard 引用、列布局等。
3. **视口与吸附**：网格、缩放、平移、参考线与吸附（支持能力控制与子元素联动）。
4. **历史记录**：操作归并，undo/redo，预处理规范化操作。
5. **演示模式**：帧序列管理、只渲染当前帧元素。
6. **右键菜单 & 资源弹窗**：插件可扩展菜单项，触发选择器弹窗。
7. **性能优化**：视口内元素过滤、简化渲染阈值、事件节流、局部重绘参考线。

---

## 二、核心架构

### 2.1 组件分层

- **入口组件**：`WhiteBoard.tsx`
  - 创建 `Board` 实例，注册插件列表。
  - 通过 Context 提供 board、selection、viewport、boardState。
  - 绑定全局/局部事件（鼠标、键盘、指针、粘贴、拖拽、滚轮、窗口 resize）。
  - 管理侧边栏、工具栏、属性面板、状态栏、右键菜单与资源选择弹窗。
  - 无 document 时监听 board `change` 事件回调 `onChange`，注入资源来源 `setResourceSource`。

- **核心引擎**：`Board.tsx`
  - 维护 `children/viewPort/selection/undos/redos` 与快照。
  - 事件总线 + 插件事件分发。
  - `apply` 在普通模式应用 Operation 并记录路径历史；文档模式将内容交给 document 绑定，预览与本机状态不写共享模型。
  - 渲染入口 `renderElement/renderVisibleElements`，按元素类型调用插件 render。

- **UI 组件**：`components/`
  - `BoardContent`：SVG 根，渲染网格、箭头 marker、元素、选区、参考线。
  - `Toolbar/AttributeSetter/Sidebar/StatusBar`：工具与信息面板。
  - 各元素组件（Arrow/Image/Video/Audio/Webview/Frame/WhiteBoard/MindNode/Column 等）。
  - `ContextMenuLayer`：聚合插件菜单项并渲染。
  - 资源选择器：Card/Image/Video/Audio/Webview/WhiteBoard。

- **服务与工具**：`utils/`、`services/`
  - `BoardOperations`、`BoardUtil/PathUtil/MindUtil/FrameUtil` 等操作工具。
  - `snap/SnapGeometry` 吸附纯几何、`snap/SnapGaps` 等距吸附、`snap/SnapManager` 吸附会话（`board.snap`）；`ViewportUtil` 视口判断。
  - `ResourceUsageTracker` 统计外部资源引用；`CapabilityService` 元素能力开关。
  - `PresentationManager` 管理演示序列。

### 2.2 初始化流程（入口 `WhiteBoard.tsx`）

1. 渲染期通过 `useCreation` 构造 Board（纯对象，无外部副作用），注入初始数据/视口/选区/演示序列/只读标记；提交期（布局 effect，只执行一次）再连接文档绑定、装配显式 extensions 与可选的宿主服务注册表（`services`，D-134），完成后才挂载画布 `WhiteBoardCanvas`。被丢弃的渲染（挂起、出错重试、StrictMode 双渲染）因此不残留扩展实例、不占用文档绑定；扩展集合与文档绑定在实例生命周期内固定。
2. 使用 `useSyncExternalStore` 订阅 `board.change`，获取 `children/viewPort/selection`，并订阅演示模式状态。
3. 绑定事件处理器 `useEventHandlers`（包装 board 事件分发）和节流指针移动。
4. 渲染各扩展注册的工具、属性面板和界面层；笔记与资源业务由各桌面扩展监听。
5. 隐藏时暂停交互与扩展副作用，真正卸载（容器脱离文档）时移除监听、释放扩展资源并销毁 Board；StrictMode 的模拟卸载与 Activity 隐藏不销毁。

---

### 交互内核（interactions/）

```
Board（数据内核：Operation / undo / 事件总线；阶段 A 未改动，后续阶段参考线与可见性过滤已接入 capabilityService 能力查询）
└─ interactions/InteractionManager（手势唯一裁决与路由层）
   ├─ SelectingState    点选/框选（组合内嵌拖拽阶段）   ← 原 SelectPlugin 指针部分
   │   └─ DraggingState 拖拽移动、吸附、容器拖入/拖出    ← 原 MovePlugin 指针部分
   ├─ PanningState      右键拖拽平移 + 右键菜单触发      ← 原 ViewPortPlugin 指针部分
   ├─ KeyboardMoveState / ViewportMoveState（继承 ContinuousArrowMoveState）
   │                     方向键移动选中元素 / 平移视口    ← 原 MovePlugin + ViewPortPlugin 键盘部分
   └─ claimPointerGesture 声明的自定义手势
       └─ MindDragInteraction（思维导图拖拽）           ← 原 MindPlugin 的 return false 抢占
```

关键机制：

- **双轨过渡**：内核未接管的事件仍走原插件广播；广播被插件 `return false` 中断时内核同样不开新手势。
- **仲裁时序显式化**：pointerdown 广播前先询问命中元素插件的 `claimPointerGesture`（自定义手势）；广播后按 SelectingState → DraggingState → PanningState 顺序仲裁（原注册顺序的显式化，不再依赖插件数组顺序）。
- **消费语义**：手势状态的处理器返回 `true` 表示事件已被处理，Board 跳过插件广播（原 `return false` 的内核化替代）。
- **插件瘦身**：MovePlugin 已删除；SelectPlugin 仅保留键盘命令（mod+a / delete）；ViewPortPlugin 仅保留滚轮与缩放快捷键；MindPlugin 保留拖拽状态机并通过 `claimPointerGesture` 声明接管。

### 文档绑定数据流

画布可接收稳定的 WhiteboardDocumentBinding。宿主通过 `@tau/whiteboard/collaboration` 将已验证的 WhiteboardModel 绑定到页面；模型是内容真源，Board.children 是渲染投影。普通值模式仍使用原路径历史和 onChange，两个模式不会同时维护同一份内容历史。

文档模式的路径命令经过 BoardOperations 路径跟踪后编译成 ID 命令；手势期间只改本机预览，结束统一提交。富文本框、图形及脑图的公共 Editor 接入同一节点文档和历史；字符串输入复用 EditorTextField。候选预算预检和撤销守门在真实写入/栈弹出之前执行。

投影经 publishDocument 更新选择与渲染引用，并在选区引用变化时发布 selection:change，通知期间不接收重入的内容写入，不触发资源增减事件、旧整页保存或加载迁移。取消、只读、切页与远端变更清除未提交预览。创建预览尚未进入文档，当前预览对象不查询文档节点是否受支持，仍按已安装扩展定义检查版本；正式元素继续校验文档契约。绑定销毁不销毁宿主共享模型；主进程持有、保存和网络由宿主实现；内置类型字段由 prepareBuiltinWhiteboardTypes 明确映射。具体接入与类型映射见[包说明](/packages/whiteboard/README.md)。

### 作者契约与作用域

作者入口使用 dataVersion/previousVersions，与编辑器共用 `@tau/db-schema/data-versions`；文本接口的唯一类型位于 editor/text-field-contract。纯数据宿主从 `@tau/whiteboard/contracts` 准备目录，不加载绑定或执行工厂；UI 绑定从 `./collaboration` 获取。目录不修改文档，首次创建用公共规范化器准备的不可变契约在同一事务中登记并创建节点，创建撤销只隐藏创建登记。

作者 API 是独立冻结对象，不继承宿主对象原型，不暴露路径 apply、Y.Doc 或字段根。普通载荷、文本与创建校验真实 owner、精确契约和 edit 权限；宿主通用外壳操作保留缺插件的移动/整体复制/删除/撤销能力。read 版本使用历史渲染定义与只读上下文，文本可以读取但不能修改。投影通知及工厂装配期间不允许作者写入，schema 不反向修复远端状态。

创建工具、预览、自定义手势与异步结束统一使用所属扩展 API；返回值限定本类型单个元素，不允许夹带路径操作。命令、工具与事件按真实插件归属仲裁，不能通过共享命名空间前缀调用其它插件。组件文本绑定复用宿主历史，字段冲刷接入保存/关闭屏障。完整作者用法见 [SDK 白板说明](/plugins/tau-plugin-template/docs/whiteboard.md)。

### 完整类型投影与历史

宿主契约覆盖 richtext、geometry、arrow、mind-node、column、frame、handwrite、image、video、audio、webview、document 和 whiteboard。每种类型显式区分 dataProperties、transientProperties 和固定正文槽；同名未知契约不能套用当前映射；只读示意图也从精确契约选择定义，不按类型名或 schemaVersion 猜测协作版本。正文用编辑器同一版本目录，新节点所需契约随用户写入登记，普通安装不转换已有正文。

测量缓存按原始几何尺寸校验，尺寸变化后重测；列布局和脑图排布只改变投影。画布移动保存用户指定几何分量，自动布局拖出保存发起者所见几何，远端投影不调用写入。分段笔迹以内部稳定子记录保存采样点，父元素投影生成轮廓，拖动/缩放不改写已保存段。

演示序列和帧有独立身份、删除标记与位置引用。帧目标集合是一次选择意图，按整体竞争；不同帧独立更新。播放按文档页顺序定位第一个仍有目标的页面，只显示该页可见目标；空帧不改变视口。保存顺序引用不随撤销物理删除；公共历史对竞争导致无法还原的属性保守保留，一次 undo/redo 只处理当前步骤，不继续撤销较早的文字。

无损传输读取当前投影，重新分配页面、元素、正文及演示身份；普通 data、未知版本与固定外部引用保真。只有精确匹配的宿主契约才能解释内部连线/分组。候选分段执行受原命令预算约束，最终以一次增量进入历史，并转交初始化保护范围；初始化载荷不会随创建撤销消失。资源权限与字节读取由宿主完成，失败不部分写入目标。

## 三、数据模型

### 3.1 BoardElement 与能力

- `types/board.ts` 定义 `BoardElement` 通用字段：`id/type/name/groupId/children` 与能力控制 `resizable/autoHeight`。
- 富文本外观优先读取 `variant/tone`；没有时由旧版 `background/topColor` 只读换算（这两个字段随画布投影，不改写存量数据），都没有时使用透明样式。设置样式时不删除未知字段。渲染、尺寸测量与缩略图使用同一解析函数。脑图的旧主题 ID 读取时映射到当前 `MIND_PALETTES` 配色，未登记值回落默认配色。
- 旧值模式元素的 `schemaVersion` 仅参与版本识别与保护。加载、粘贴、插入均不转换数据，不再声明或校验升级函数；版本不匹配时保留原数据并按未知元素处理。
- 当前工具由 activeTool 模型表达：`tau.select` 为显式选择工具（非创建模式哨兵），创建型工具激活后在画布按元素声明的 `create` 规格手势创建；旧创建类型枚举与字段兼容层已删除。
- `IElementCapabilities`（`types/capabilities.ts`）由插件声明：是否吸附、是否参与参考线、是否可随子元素移动、箭头连接点策略等，`CapabilityService` 统一查询。

快捷键与剪贴板写入口通过 captureSubmission 检查当前文档冻结状态，不等待宿主 readonly 属性更新；输入框与可编辑区域保留自身按键和剪贴板行为。方向键持续移动在冻结时终止并回退未提交预览，焦点转入输入框后仍处理松键以结束已有手势。右键菜单在内容或选区变化时关闭，旧菜单动作同时检查生成时的上下文与菜单代次，不能对新状态执行旧操作。

### 3.2 ViewPort 与 Selection

- `ViewPort`：`minX/minY/width/height/zoom`，由 `ViewPortPlugin` 管理缩放和平移。适应选区只改变视口，不延迟写回旧选区；新动画或直接视口操作接管后，旧动画停止，销毁后不再提交动画帧。
- `Selection`：`selectArea`（框选锚点+焦点）与 `selectedElements` 列表，更新统一走 `SelectTransforms`（全选命令 `tau.selection.select-all` 亦然，见 4.5）。

### 3.3 Operation

- 操作类型集中在 `types/operation.ts`（插入/移动/设置属性/删除/视口/选区等）。`set_node` 只修改当前节点属性；`properties` 或 `newProperties` 携带 `children` 时，无论开发或生产环境均抛错，整批不提交。结构变化通过 insert/remove/move 表达；普通属性修改的 metadata 只记录当前节点。
- `Board.apply` 通过 `BoardOperations.applyOperations` 执行，记录 `metadata.changedElements/removedElements/insertedElements/hasChanges`。
- 无 document 时，操作在路径历史中按 1 秒窗口归并，最大 100 条；文档模式只使用宿主 NodeTreeHistory。撤销与重做命令的可用性统一经 Board.canUndo/canRedo 查询：文档模式读取绑定历史并检查冻结状态，普通模式读取画布本机历史；快捷键不直接访问本机历史栈。
- `set_sketch` 修改页级画风 `board.sketch`（进历史，变化时 emit `sketch:change`），见 5.1。
- 写入校验：扩展定义带 `schema`（Standard Schema v1，仅同步返回）时，`Board.apply` 在 applyOperations 产出新树之后、状态提交之前校验变化元素的 `element.data`（按旧/新树元素引用比较剪枝，未变子树不校验）；不合规抛 `WhiteboardValidationError` 且整批操作不应用。undo/redo 重放不校验（提交时已校验过）；加载不执行转换，原始数据保留；粘贴路径捕获校验错误后放弃本次粘贴。

### 文档安装边界

首次发布与退出共享由宿主从确认投影构建独立候选，保留页面、元素及正文节点的逻辑身份，重建共享根。首次发布只包含选定页面的当前内容，不携带删除历史或恢复区；旧增量不能套入新根。

安装候选、固定指纹、幂等回执与失败重试由宿主管理，白板绑定不转换历史格式或自动合并另一基线的草稿。协议与首次发布流程以[协作架构](/docs/architecture/collaboration.md)为准，本机日志与安装流程见[桌面架构](/docs/architecture/desktop.md)。

### 3.4 文档版本

- 快照 `WhiteboardSnapshot.version` 必填，保存永远写当前版本（`WHITEBOARD_DOCUMENT_VERSION`，现为 2）；旧数据缺失或非法由 `getDocumentVersion` 归一为 1。版本 1→2 结构相同，不做全表升级。
- 版本高于当前应用支持时画布强制只读、绝不触发 onChange（`api.readonlyReason = "document-too-new"`）；主进程写库兜底拒绝用旧版本数据覆盖库内更高版本（`white-board-content.ts` 内同名 `getDocumentVersion` 对账）。

---

## 四、插件体系

### 4.1 扩展声明与内部元素策略

对外使用 defineWhiteboardExtension，create(api) 返回 elements、commands、tools、inspectors、menus、hotkeys、ingest、layers 及生命周期回调。api 提供只读快照、受控提交与宿主服务访问：扩展在 `requires` / `optional` 中声明服务标识（`createServiceId` 产物），装配时 requires 缺失即拒绝该扩展（reason `missing-service`），扩展作用域内经 `api.getService` / `api.tryGetService` 获取（只能取声明过的 id，未声明抛错；主 API 不提供服务访问）；宿主经 `WhiteBoard` 的 `services` prop 传入 `createServiceRegistry` 构建的注册表。组件通过 useWhiteboardAPI 获取同一接口。

下述 `types/board.ts` 中的 IBoardPlugin 仅供内置扩展复用既有交互实现，不从公共入口导出：

- 事件处理：鼠标/键盘/指针/粘贴/拖拽/滚轮等（Board 层按顺序分发）。
- 几何能力：`isHit`、`moveElement`、`getBounds`、`getArrowBindPoint`、`isElementSelected`。
- 渲染：`render(board,{element,children}) => ReactElement`。
- 菜单：`getContextMenu(context)` 返回 `PluginContextMenuItem[]`，按 `priority` 排序。
- 能力声明：`getCapabilities()`。

### 4.2 内置元素策略（由 `extensions/builtins.tsx` 与桌面装配组合）

| 插件                    | 作用                            | 关键点                                                                                                                                                 |
| ----------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ViewPortPlugin          | 视口滚轮缩放/平移、右键默认行为 | 缩放/全览快捷键与命令在 tau.interaction 扩展（`extensions/interactionCommands.ts`）；右键拖拽平移、方向键平移在交互内核 PanningState/ViewportMoveState |
| CopyPastePlugin         | 复制/粘贴/剪切                  | 依赖选区，支持剪切删除；复制走原生 clipboard 事件，不进快捷键仲裁                                                                                      |
| CardPlugin              | 文本卡片元素                    | 基于 CommonPlugin 尺寸/命中/箭头连接点                                                                                                                 |
| GeometryPlugin          | 矩形/圆角/菱形/三角等           | 多形状绘制与 resize                                                                                                                                    |
| StickmanPlugin          | 人物（火柴人）                  | 只存姿态 key 与形体/着色/翻转，图形由 `utils/stickman` 现算；按比例缩放（四角手柄），跟随手绘，见 5.2                                                  |
| RichTextPlugin          | 富文本块                        | 编辑态控制，选择时禁止删除等                                                                                                                           |
| ArrowPlugin             | 连线与中心连接                  | 处理箭头绑定点、marker                                                                                                                                 |
| Image/Video/AudioPlugin | 媒体渲染与资源选择              | 右键菜单触发选择器，beforeSave 清理无效资源                                                                                                            |
| MindPlugin              | 思维导图节点                    | 折叠左右子树、整体吸附 RootOnly                                                                                                                        |
| PresentationPlugin      | 演示序列管理                    | 创建帧、进入演示模式过滤元素                                                                                                                           |
| WebviewPlugin           | 网页 iframe/预览                | 右键插入/替换                                                                                                                                          |
| FramePlugin             | 容器元素                        | 子元素移动与参考线联动                                                                                                                                 |
| WhiteBoardPlugin        | 引用/嵌入其他白板               | 支持 reference/create                                                                                                                                  |
| ColumnPlugin            | 列布局元素                      | 子列容器/可重排                                                                                                                                        |
| FileDragDropPlugin      | 外部文件拖拽导入                | 处理图片/视频/音频/白板文件                                                                                                                            |

> 备注：`CommonPlugin` 抽象了通用几何类元素的命中/resize/箭头连接点等逻辑，其子类直接复用。选中元素的拖拽/吸附/参考线手势不在插件中，由交互内核 `interactions/states/DraggingState` 承接（原 MovePlugin 已删除）；HistoryPlugin / SelectPlugin 已删除，撤销重做与全选/删除的快捷键硬编码迁入 `tau.interaction` 扩展的命令与快捷键。

### 4.3 插件事件分发与白板事件分层

Board 在各事件入口通过 `bindHandler(eventName)` 收集插件实现的 handler，过滤空值后按顺序执行 `executeSequence`。只读模式或演示模式部分事件会短路。

事件总线分三层：**内核事件**（`extensions/events.ts` 的 `WhiteboardKernelEvents`，共 13 个：change、value:change、selection:change、viewport:change、sketch:change、readonly:change、element:change、element:insert、element:remove、element:move、element:move-end、element:flash、active-tool:change）只有内核能发，扩展只能经 `api.on` 监听，数据类事件（value/selection/viewport/element:change/insert/remove）的载荷替换为冻结快照，`element:flash` 的公开触发入口是 `api.flashElement(id)`；**扩展事件**形如 `<命名空间>.<名称>`，扩展只能 emit 自己命名空间（扩展 id 第一段）下的事件，任何扩展都可以监听，`tau.*` 归内置扩展；**内部事件**带 `internal:` 前缀（creation-preview-change、create-gesture-start、create-gesture-cancel、context-menu），只在包内使用，订阅与发出都在运行时抛错。会触发界面操作的事件统一为 `tau.*` 扩展事件（如 `tau.modal.open`），驼峰旧名不保留。

### 4.4 右键菜单扩展

- 插件实现 `getContextMenu` 返回菜单项，Board 聚合排序后交给 `ContextMenuLayer`；右键浮层经包内 `internal:context-menu` 事件打开。
- 菜单项可 emit `tau.modal.open` 扩展事件，对应扩展的界面层（如导出、媒体 URL 弹窗）监听后弹出选择器（图片/视频/音频/Webview/白板）。

### 4.5 快捷键仲裁

- 快捷键是扩展贡献：`hotkeys: [{ key, command }]`（is-hotkey 键串，按 event.key 匹配）；内置的 shift+数字组合因键盘布局间 event.key 漂移走包内键码通道（按 event.code 匹配，仅内置扩展可用，`extensions/hotkeys.ts` 的 InternalContributions.hotkeyCodes）。
- 仲裁在扩展运行时（`extensions/runtime.tsx` 的 onKeyDown）：按「tau 优先 + 装配顺序」收集全部键匹配条目，第一条 enabled 的命令拦截（preventDefault + stopPropagation）并执行；命令 enabled 不满足时不拦截按键，全部不可用则放行给后续事件链。输入法组合、编辑上下文、元素编辑中与演示态整体不响应——撤销/全选因此在编辑态让位给正文编辑器（编辑器自带 slate-history）。
- 宿主保留键不可声明（装配即拒绝）：mod+k / mod+p（命令面板）、mod+j（停靠栏）、alt+left / alt+right（前进后退）、escape（浮层退场）。
- 内置清单见 `extensions/interactionCommands.ts`（tau.interaction）：撤销 mod+z、重做 mod+shift+z 与 mod+y、全选 mod+a、删除 delete/backspace、缩放 mod+= / mod+-、全览 mod+o / z、shift+1 全部 / shift+2 选中 / shift+0 复位缩放；回车打开文档（enter → `tau.document.open`）在 `tau.document` 扩展。
- 快捷键显示文字只有一个来源：`api.getShortcut(commandId)`（`utils/hotkeyFormat.ts` 的 formatHotkey + detectHotkeyPlatform 按平台格式化）。
- 遗留：思维导图节点键盘导航仍靠 document 监听器抢先注册 + stopImmediatePropagation 阻断后续监听（`useMindNodeKeyboardNavigation`）；方向键移动与演示翻页是模式内交互，留在交互层。

---

## 五、渲染与视口

- **渲染入口**：`BoardContent/index.tsx`，SVG 视图盒子 = `viewBox(minX,minY,width,height)`。
- **可见性过滤**：`board.filterElementsInViewport(elements, expandPixels)` 生成可见树，`renderVisibleElements` 递归调用插件 render。
- **层级拆分**：箭头按是否中心连接拆分（`useElementsSorting`），避免遮挡。
- **网格/参考线**：`Grid` 按 `gridVisible` 渲染点阵（点距固定 `DEFAULT_GRID_SIZE` = 20，同为吸附步长）（两层 `<pattern>` 平铺、节点数恒定，缩小时按 `dotGridLevel` 翻倍点距，D-111）；`ReferenceLines` 显示吸附线，线条直接订阅 `board.snap`，只包含吸附后真正对齐的线；网格可见时吸附改为取整，不画参考线。
- **选区与标记**：`SelectArea` 绘制框选，箭头 Marker 由 `ArrowMarkers` 统一定义。
- **简化渲染**：`simplifiedRenderZoomThreshold = 0.3` 写入 `BoardStateContext`，子组件可根据 zoom 降级绘制。

### 5.1 手绘模式

- **数据**：页级画风存在页数据 `data.sketch: PageSketch = { mode: "sketch" | "normal", level }`，缺省普通；元素可带 `sketch: ElementSketch`（`mode / level / seed` 覆盖，未设置跟随页面）。思维导图只读根节点的覆盖，整棵树共用。形状另有 `fillStyle`（`solid / hatch / cross / scribble`），普通模式一律按实色渲染。
- **状态**：`Board.sketch` 由构造参数 `initSketch` 传入，`SketchTransforms.setPageSketch` 生成 `set_sketch`；组件经 `usePageSketch()` / `useSketch(element, owner?)` 订阅并合成生效画风（`utils/sketch/resolve.ts`，除手写外的元素都跟随；手写本来就是墨迹）。
- **引擎**：`utils/sketch/` 纯函数，输入几何 + 样式 + seed，输出 `SketchPath[]`（`role: ink | wash | lines`，可带 `clip` 与 `dashMask`）。墨迹为 perfect-freehand 变宽填充多边形；摆动按弧长连续，端点移动不跳变；seed 缺省由元素 id 派生，同一元素永远同一笔。
- **渲染**：`components/SketchPaths` 把输出渲染为声明式 `<path>`；`SketchRect`（圆角矩形墨迹框）与 `SketchStroke`（无端点手绘线）供画框、分栏、文本底板、导图复用；形状走 `Geometry/SketchGeometry`，连线走 `Arrow/SketchArrow`。都按几何与样式 `useMemo`，平移不重算。
- **虚线与流动**：虚线 = 连续墨迹 × 沿中心线描的粗虚线遮罩；虚线流动只给遮罩的 `stroke-dashoffset` 加 SMIL 动画，墨迹不重算；实线流动沿摆动后的中心线跑流动点（画布底色描边，无滤镜）。
- **文字**：生效画风为手绘的元素，文字容器加 `handTextClass(sketch)`：`font-tau-hand` + 该档位的 Shantell Sans 随性度（INFM 0 / 40 / 90）。连线标签加在 Editor 自身上（尺寸测量克隆的是 Editor 节点）。
- **字体**：内置 Shantell Sans + 小赖 SC（`src/assets/fonts/hand/`，`scripts/build-hand-font.py` 生成，小赖按 unicode-range 分 43 片按需加载、每片独立 family）；导出时 `utils/bundled-font-embed.ts` 把已加载分片读成 data URL 经 snapdom `localFonts` 内嵌（`file://` 下 snapdom 自己 fetch 不到）。
- **媒体元素**：图片 / 视频 / 网页 / 音频 / 白板引用在内容之上叠一层墨迹框（不接收指针事件）。
- **多选**：`MultiSketchPopover` 经 `utils/sketch/batch.ts` 生成只改 `sketch` / `fillStyle` 的 `set_node`，导图归到根节点。
- **入口**：状态栏「画风」（页面模式 + 默认笔触）；属性条「笔触」（`AttributeSetter/SketchPopover`，视频 / 网页 / 音频 / 白板引用用只含笔触的 `MediaSetter`）。

### 5.2 人物（火柴人）

- **数据**：`StickmanElement = { type: "stickman", pose, body, tint, flip? }` + 通用 x/y/width/height/sketch。`pose` 是姿态 key，`body` 为 `classic`（经典）/ `bean`（豆豆）/ `glyph`（象形），`tint` 为 `mono` / `color`。不存 SVG，未知 pose（更高版本写入）保留数据、画虚线占位框。
- **姿态**：`utils/stickman/poses.ts` 的关节骨架（头 / 颈 / 髋 / 四肢）+ 道具图元（线 / 多边形 / 矩形 / 圆 / 点 / 文字），坐标为姿态局部画布；豆豆躯干占位大，个别姿态带 `bean` 关节覆盖。新增姿态只改这份数据，单测会遍历全部姿态 × 形体 × 画风。
- **引擎**：`buildStickStrokes`（姿态 + 形体 + 着色 + 翻转 → 中间笔画，与画风无关）→ `renderStickPrecise`（圆头圆角描边）或 `renderStickSketch`（墨迹，复用 `utils/sketch` 的 inkOutline / loopStroke / wobble，`wobble` 的 waveScale 缩短波长适配小尺寸）。翻转只镜像坐标，文字字形不镜像。
- **颜色**：墨色 `--tau-ink-1`；纸色填充（遮挡画板、气泡）取 `--tau-bg-surface`；着色为主色 / 标签色与纸色 `color-mix`（不透明），多人按序号轮换。全部是主题变量，深浅主题无需第二套素材。
- **入口**：工具栏「人物」（`Toolbar/Stickman`，分类 + 姿态图块，单击画布放置，自然尺寸居中）；属性条换姿态（保持缩放比例、底边中点不动）/ 形体 / 着色 / 水平翻转 / 笔触。形体与着色记在 localStorage（`StickmanUtil`），新建沿用。

---

## 六、交互与变换

### 6.1 选区与删除（交互内核 + tau.interaction）

- 点选/框选/拖拽手势由交互内核 `interactions/states/SelectingState` 处理；移动时框选匹配 `board.isElementSelected`；抬起时处理多选/单选并清空参考线。
- 全选（`tau.selection.select-all`，mod+a）与删除（`tau.selection.delete`，delete/backspace）是 `tau.interaction` 扩展的命令 + 快捷键（原 SelectPlugin 已删除）；演示态与编辑态由快捷键仲裁统一让位（见 4.5）。
- 选区更新通过 `SelectTransforms.updateSelectArea` 触发 `set_selection` Operation。

### 6.2 移动与吸附（交互内核 DraggingState）

### 6.2 移动与吸附（能力系统 + SnapManager）

- 判断命中元素并决定是否移动选中集（Frame 子元素容器移动时跳过避免双移；整体回放到全部运动元素含箭头；Alt 跳过吸附；结束 board.snap.end()）。
- **能力声明**：插件通过 `getCapabilities` 返回 `IElementCapabilities`，`CapabilityService` 查询：
  - `shouldParticipateInRefLines`：是否参与参考线显示/吸附。
  - `shouldElementSnap` & `getSnapCapability(type)`：吸附行为，支持 `SnapBehavior.RootOnly`（如 mind-node root）。
  - `shouldMoveWithChildren`：容器移动时是否携带子元素（Frame）。
- **吸附流程**：纯几何在 `utils/snap/SnapGeometry.ts`，会话在 `utils/snap/SnapManager.ts`（`board.snap`）。
  - 移动：DraggingState / Mind 根拖拽把运动包围盒（多选取并集）交给 `board.snap.move`，得到一次 `dx/dy` 后整体回放到全部运动元素。
  - 缩放：`board.snap.resize` 只吸附正在拖动的边；等比缩放只吸附主轴、另一维按比例回算；`axes` 可限定轴（固定高度元素只吸 x）。
  - 吸附点：x 取左/中/右，y 取上/中/下；每轴只取最近的偏移，阈值 `SNAP_THRESHOLD_PX / zoom`（8 屏幕像素）。
  - 等距（仅移动）：`SnapGaps` 先在候选中求相邻间距（每个候选只与该轴正方向、垂直方向有重叠的最近邻配对，按候选快照缓存）；运动包围盒可居中于间距内、或接在一对元素前/后复制间距。与对齐偏移一起比较取最近，相同时对齐优先。测距线只画吸附后真正等长的间距，并沿等长且首尾相连的间距扩展整条序列。
  - 参考线：只画吸附后真正重合的坐标，同坐标合并为一条线，跨度覆盖所有对齐点；`ReferenceLines` 直接订阅 `board.snap`。
  - 候选：首次调用时拍快照——视口内、参与参考线、排除运动元素及其子孙；视口变化时重拍。
  - 网格：网格可见时（`board.snap.setGridSize`）改为对网格取整，不画参考线，与对象吸附二选一。
  - 生命周期：交互结束调用 `board.snap.end()`；另有窗口级 pointerup/pointercancel/blur 兜底清空，参考线不会残留。
- **按键控制**：Alt 关闭吸附。

---

### 6.3 缩放与视口（ViewPortPlugin + hooks）

- 创建工具待用时仍允许滚动平移与 Ctrl 缩放；仅实际创建手势进行中或演示模式下暂停视口滚轮操作。文本工具待用时空白画布显示文本光标，不代表正文或浮层覆盖。
- 鼠标滚轮缩放（阻止默认滚动）；按钮与快捷键缩放走 `tau.viewport.zoom-in/out` 等命令（tau.interaction 扩展，见 4.5），`ViewPortTransforms.fitAllElements` 计算包围盒并留白 `FIT_VIEW_PADDING`。
- 普通滚动由画布容器捕获阶段按起点锁定归属：从画布开始，途中经过正文仍平移；从正文开始，途中离开仍滚动原正文，顶部、底部、横向或无溢出也不切给画布。实际正文 DOM 在挂载时登记、重建或卸载时注销；起始节点失效即解除归属。`wheel` 无标准结束事件，以超过 200ms 无新事件划分下一轮，惯性事件持续刷新归属；Ctrl 滚轮解除普通手势归属并交给画布缩放。宿主浮层保持独立滚动，正文的 overscroll-contain 阻止原生滚动链扩散。画布平移不丢弃连续位移，100ms 限频仅用于固定步长缩放。
- `useViewPortControls` 提供 `handleZoomIn/Out/To` 与 `handleFitElements`，入口组件暴露 `fitAllElements` ref。

### 6.4 复制/粘贴/拖拽

- Copy/Cut/Paste 通过 `CopyPastePlugin`，监听按实例根节点仲裁；粘贴时克隆选中元素并偏移。
- `FileDragDropPlugin` 处理外部文件（图片/视频/音频/白板）拖拽导入，调用对应插件插入。

### 6.5 编辑与富文本

- RichText/MindNode 等插件在进入编辑态时会把元素 id 写入 `board.isEditingElements`，删除/移动等操作会被阻止。
- 属性面板 `AttributeSetter` 通过上下文读取选中元素并更新其属性。

### 6.5b 连接点归属仲裁

（`utils/ConnectPointOwner.ts`，store 经 `BoardStateContext.connectPointOwnerStore` 下发）：同一时刻只有一个元素显示悬停连接点、只有一个元素成为拖动箭头的落点目标（选中元素的连接点常显，不受仲裁）。

- 各元素经 `useDropArrow` 把包围盒注册为候选（悬停与落点共用）；规则：指针在元素内部优先于只落在外扩感应区；同为内部取面积最小（嵌套落到最内层），同为外部取距离最近。
- 悬停：指针变化时统一选出 owner，感应半径 `ARROW_CONNECT_PROXIMITY_RADIUS`；指针停在连接点上或从连接点拖出箭头时锁定 owner；owner 变为空时延迟 `ARROW_CONNECT_PROXIMITY_HIDE_DELAY` 清空，切换到其他元素则立即生效。
- 落点：`arrow:update` 时各元素调用 `resolveAt(currentPoint, ARROW_DROP_PROXIMITY_RADIUS)`（同一点结果缓存共享），只有归属元素显示落点并上报 closing。
- `useDropArrow(element, { container: true })`（Frame）：内部空白不参与，只在距边框 ≤ 感应半径时命中，且不提供 `center` 连接点（悬停与落点都不提供；已有的中心连接箭头不受影响）。

---

### 6.6 创建手势（元素 create 声明 + 交互内核 CreatingState）

- 创建方式由元素定义的 `create` 声明（`gesture: "click" | "drag" | 自定义手势`，附 constrain/defaultSize/minSize/build/after/stay/cursor/hint）；状态机、Shift/Alt 约束、预览与提交统一由交互内核的 `CreatingState` 驱动，插件不再各自监听指针。
- 创建预览走 `board.creationPreview`（`internal:creation-preview-change` 事件），不进入 children、快照、onChange 与历史；取消时播放 120ms 退场。
- 工具经 `api.setActiveTool(id, options)` 激活（参数即 `activeToolOptions`），未注册 id 抛错，只读画布忽略非 select 设置；订阅切换用 `onActiveToolChange`。
- Esc 依次取消进行中的创建手势、再退回选择工具；创建后默认选中并回到 `tau.select`（画笔 stay 保持；框架/分栏松手时收纳候选）。
- 组件层判断「是否处于创建模式」用 `useActiveTool() !== SELECT_TOOL_ID` 或 `board.isCreating()`。

---

### Board.apply 六步详解

1. **预处理**：`BoardOperations.applyOperations`（纯函数）深拷贝数据 → 过滤无效操作 → 插入操作按深度排序 → 逐条执行 → 返回 `data` + `metadata`（changed/removed/inserted/hasChanges）+ `executedOps`。
2. **资源追踪**：`ResourceUsageTracker.track(metadata, resourceSource)` 统计新增/删除资源（图片/音视频/白板引用）。
3. **状态更新**（immer Draft）：若 children/viewPort/selection 有变化，更新 draft。
4. **参考线**：apply 不再维护参考线数据，吸附候选由 `board.snap` 在交互开始时按需快照。
5. **历史记录**：若 `updateHistory=true`，使用 `executedOps`（或 preprocess 结果）入栈，1 秒内合并；超过 100 弹出最旧。
6. **事件广播**：完成 draft 后 `finishDraft` 并 emit `onValueChange/onViewPortChange/onSelectionChange/element:change/element:remove/change`。

---

## 七、历史、撤销与资源管理

- **历史记录**：`Board.apply` 在非只读且有变更时记录 `undos`，1 秒内操作归并到同一 entry，最多 100 条；`redo` 栈在新操作后清空。撤销/重做命令（`tau.history.undo/redo`，mod+z / mod+shift+z / mod+y）由 `tau.interaction` 扩展贡献（原 HistoryPlugin 已删除），编辑态让位给正文编辑器（见 4.5）。
- **Operation 预处理**：`BoardOperations.preprocessOperations` 进行过滤/排序/深拷贝并标记 normalized；执行后返回 `metadata`。
- **正文与资源**：正文与媒体的宿主能力经服务注册表注入——宿主用 `createServiceRegistry`（`@tau/shared/service-registry`，`@tau/whiteboard/extensions` 重导出）注册 `IWhiteboardRichText`、`IResourceService`、`IMediaInfoService`、`IDownloadService` 等服务并经 `services` prop 传入；内置扩展 optional 声明，缺失时回退嵌入式或浏览器实现。引擎不访问主库或应用 store；导出截图实现仍为扩展工厂参数。

---

## 八、演示模式

- `PresentationManager` 管理 `sequences`（帧序列）。入口订阅 `presentationModeChange` 等事件。
- 进入演示模式后，`WhiteBoard.tsx` 中的 `filteredChildren` 仅保留当前帧包含的元素（递归过滤保留父链）。
- `PresentationCreator/PresentationMode/StatusBar` 提供创建、播放、删除帧的 UI；右键菜单由 `PresentationPlugin` 提供。
- 当前帧索引、序列 id 通过 `useSyncExternalStore` 订阅，切换时重新过滤元素。

---

## 九、对外 API 与上下文

### 9.1 WhiteBoard Props

- `initData`：`BoardElement[]`，可带 `presentationSequences`。
- `initViewPort` / `initSelection` / `initPresentationSequences`：初始视口与选区/帧。
- `readonly`：只读模式（禁止写操作）。
- `version`：文档版本（当前为 `WHITEBOARD_DOCUMENT_VERSION = 2`）；高于当前支持时画布强制只读且不回调 onChange（`readonlyReason = "document-too-new"`），保存快照永远写当前版本。
- `initSketch`：页级画风，缺省普通。
- `onChange`：`{ children, viewPort, selection, presentationSequences, sketch }`。
- `extensions`：显式稳定的扩展集合，提供元素、命令、工具、属性面板、导入和界面层；旧的全局宿主服务/业务插槽集合不再恢复（改为下列 services 注册表，D-134）。
- `services`：宿主服务注册表，扩展经 requires/optional 声明后从扩展 api 获取；缺省为空注册表（声明了 requires 的扩展会被拒绝装配）。
- `outline`：受控开关、宽度与实际占宽回调；缺省使用实例本地状态。
- `className/style`：容器样式。

### 9.2 Ref 能力

`WhiteBoardRef`（forwardRef 暴露）：

- `fitAllElements(padding = FIT_VIEW_PADDING, animate = true)`
- `getElements(): BoardElement[]`

### 9.3 Context

- 包外 useBoard/useWhiteboardAPI 返回受控接口，useSelection/useViewPort 返回不可写快照。受控接口提供 activeTool 相关（`activeTool`/`activeToolOptions`/`setActiveTool`/`onActiveToolChange`）、坐标转换（`screenToCanvas`/`canvasToScreen`）与容器能力查询（`canContain`）。包内 BoardContext 保留内核实例，SelectionContext/ViewPortContext 传递状态，BoardStateContext 提供运动状态与简化阈值，ArrowMoveContext 标识箭头移动中；这些私有上下文不直接公开。

---

## 十、扩展指南

### 10.1 新增元素插件

1. 用 defineWhiteboardExtension 声明带命名空间的 id，在 create(api) 内创建实例私有状态。
2. 在 elements 中声明元素 type、渲染组件与几何行为；一个扩展可以贡献多个类型。
3. 工具与菜单引用 commands 中的命令 ID，属性编辑器放 inspectors，浮层放 layers；渲染器不获取 Board 内核实例。
4. 宿主能力经扩展 `requires` / `optional` 声明的服务标识获取（`api.getService` / `api.tryGetService`，D-134）；选择器弹窗、媒体动作白名单、图片组件等纯 UI 配置仍可为工厂参数。操作经 API 提交，不改写只读快照。
5. 在宿主 extensions 集合中显式组合扩展，不修改 WhiteBoard 入口或固定类型登记表。
6. 正文与资源宿主服务在扩展内经 tryGetService 获取并显式降级（缺失隐藏入口或回退内置实现）；异步写入前用 API.captureSubmission 固定有效期，提交前再验证。

### 10.2 新增右键菜单项

1. 在插件实现 `getContextMenu`，返回 `priority` 有序列表；使用 `ContextMenuContext` 获取命中元素与 board。
2. `onSelect` 中执行 `board.apply` 或发事件打开弹窗。
3. 如果需要二级菜单，填充 `children`。

### 10.3 扩展演示/视口能力

1. 扩展 `PresentationManager`（如动画/自动播放），需订阅/广播事件与 `change`。
2. 视口相关新增变换可添加到 `ViewPortTransforms` 并在 `ViewPortPlugin`/`useViewPortControls` 暴露。

---

## 十一、常见问题与调试建议

- **元素无法选中/吸附异常**：检查插件 `isHit/getBounds/getCapabilities` 是否实现；能力声明中 `shouldParticipateInRefLines/shouldElementSnap` 是否关闭。
- **参考线异常**：吸附逻辑集中在 `utils/snap`，可直接用单测复现；结束时机统一为 `board.snap.end()` + 窗口级兜底。
- **删除不生效**：确认不在演示模式/创建序列/编辑态 (`board.isEditingElements` 非空)。
- **历史记录缺失或过多**：`Board.apply` 仅在 `metadata.hasChanges` 时记录；必要时调整 1 秒归并逻辑或 100 条上限。
- **演示模式看不到元素**：检查帧数据 `currentSequence.frames[currentFrameIndex]` 是否包含目标元素 id；过滤逻辑在 `filteredChildren`（`index.tsx:711` 附近的 useMemo）。
- **资源未回收/上传未统计**：确保插件在 Operation 元数据中填充资源信息并设置 `resourceSource`。
- **性能问题**：开启 `simplifiedRenderZoomThreshold` 降级、检查重渲染点（`useThrottleFn` 的节流时间可调）。
- **只读模式仍可操作**：Board 事件入口在只读时直接返回，确保从入口层透传的 `readonly` 正确。

---

## 附录：核心文件索引

| 文件                                                        | 说明                                                                                                                                                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/whiteboard/src/index.tsx`                         | 入口组件，创建 Board、注册插件、绑定事件、渲染 UI                                                                                                                                                       |
| `packages/whiteboard/src/Board.tsx`                         | 核心引擎，插件分发、apply/历史、参考线、渲染入口                                                                                                                                                        |
| `packages/whiteboard/src/document-version.ts`               | 白板文档版本常量与归一/支持判断                                                                                                                                                                         |
| `packages/whiteboard/src/extensions/*`                      | 扩展声明（api）、运行时装配与冲突降级（runtime）、服务作用域与声明过滤（scope）、事件分层与快捷键仲裁（events / hotkeys / interactionCommands）、元素版本识别（elementVersion）、写入校验（validation） |
| `packages/whiteboard/src/types/*.ts`                        | 数据模型、Operation、能力声明、演示类型                                                                                                                                                                 |
| `packages/whiteboard/src/plugins/*`                         | 内置插件实现（视口、移动、复制、几何/媒体/导图/Frame/Webview/WhiteBoard 等）                                                                                                                            |
| `packages/whiteboard/src/utils/BoardOperations.ts`          | Operation 预处理与纯函数执行，元数据收集                                                                                                                                                                |
| `packages/whiteboard/src/utils/snap/`                       | 吸附纯几何（SnapGeometry）、等距（SnapGaps）与吸附会话（SnapManager）                                                                                                                                   |
| `packages/whiteboard/src/utils/PresentationManager.ts`      | 演示模式序列管理                                                                                                                                                                                        |
| `packages/whiteboard/src/transforms/*`                      | 选区与视口变换工具                                                                                                                                                                                      |
| `packages/whiteboard/src/components/BoardContent/index.tsx` | SVG 渲染容器，过滤视口内元素                                                                                                                                                                            |
| `packages/whiteboard/src/components/ContextMenuLayer`       | 右键菜单聚合与渲染                                                                                                                                                                                      |
| `packages/whiteboard/src/components/*`                      | 各元素视图、工具栏、侧边栏、状态栏、资源选择器                                                                                                                                                          |

## 交互内核遗留注记

- `ArrowPlugin.onDblClick` 仍有 `return false`（双击进入描述编辑的抢占），属双击槽位，待后续切片收编
- 容器 onChildInserted/onChildRemoved 仍为交互期协议（由拖拽内核 DraggingState 与侧边栏树拖放在提交时调用）；
  若未来需要 undo/redo 也触发容器联动（如 Frame 边界收缩），再引入
  Board.apply 的 afterChange 数据钩子并做双轨合并
- MindDragOverlay 仍通过 `board.getPlugin("mind-node")` 拿插件实例当 store 订阅（绕过抽象，阶段 B/C 处理）

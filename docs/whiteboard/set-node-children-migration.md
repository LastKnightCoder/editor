# set_node(children) 迁移清单（白板）

## 背景

当前白板存在大量通过 `set_node` 传入“完整元素对象”的写法，导致 `children` 被一起带入 `newProperties/properties`：

- 即使本次只想更新 `x/y/width/height` 或某个状态字段，`children` 也会被写入/回放（undo/redo）。
- 结构变化（插入/删除/移动/重排）被“吞”在一次 `set_node(children)` 里，难以追踪到底哪些节点变了。

目标：结构变化统一用 `insert_node/remove_node/move_node`，`set_node` 只做当前节点自身属性的 patch（禁止包含 `children`）。

## 迁移期观测

已在 `BoardOperations.set_node` 增加迁移期 warning：当 `properties/newProperties` 包含 `children` 时会在开发环境打印一次（去重+带调用栈）。

后续盘点/迁移以 warning 的真实命中为准。

同时对 `BoardOperations.set_node` 的 metadata 采集做了迁移期兼容优化：

- `set_node` 不携带 `children` 时：只记录当前节点到 `changedElements`（避免对子树 DFS 导致 O(n^2)）。
- `set_node` 携带 `children`（老逻辑）时：仍 DFS 记录整棵子树变化，避免行为变化。

## 高风险场景（优先级从高到低）

### 1) Frame（P0）

关注点：拖拽元素进入/移出 Frame、以及创建 Frame 框选流程。

- 拖拽进入/移出 Frame 的结构变化：
  - 主要通过 `move_node` 完成（不应依赖 `set_node(children)`）
  - 迁移重点是：所有 `set_node` 只 patch bbox/状态字段；结构变化一律用 `move_node/insert_node/remove_node`

命中点（典型）：

- `apps/desktop/src/components/WhiteBoard/plugins/MovePlugin.ts`（文件已删除，拖拽手势现位于 `interactions/states/DraggingState.ts`）
  - 已迁移：Frame 拖拽视觉态 `isChildMoveIn` 仅 patch 字段（反馈 ops 现由 `plugins/FramePlugin.tsx` 经能力协议生成）
  - 已迁移：Frame autoResize 更新 bounds 仅 patch bbox 字段（现位于 `plugins/FramePlugin.tsx`）
  - 已迁移：Frame 移动改为“子树平移 ops”（对子树每个节点 patch x/y，经 `CapabilityService.buildElementMoveOps` → `BoardUtil.buildTranslateSubtreeOps`），不再 `set_node(整棵 frame)`
- `apps/desktop/src/components/WhiteBoard/plugins/CommonPlugin.ts`
  - 已迁移：容器 resize 仅 patch bbox 字段（避免把 children 写入历史）
- `apps/desktop/src/components/WhiteBoard/plugins/FramePlugin.tsx`
  - 已迁移：自适应内容/resizeEnd 仅 patch bbox 字段
  - resize 时移入/移出元素是 `move_node`（重点回归这个流程是否仍依赖 children 写回）
- `apps/desktop/src/components/WhiteBoard/components/Toolbar/Frame/useCreateFrame.ts`
  - 已迁移：“仅更新尺寸”分支用 `set_node` bbox patch（不再携带 children）
- `apps/desktop/src/components/WhiteBoard/utils/FrameUtil.ts`
  - 已迁移：`resizeToFitChildren` 用 `set_node` bbox patch
- `apps/desktop/src/components/WhiteBoard/components/Sidebar/tree/utils.ts`
  - 已迁移：预览树计算 frame resize 用 bbox patch

迁移策略（Frame 阶段目标）：

- 所有 Frame 的 `set_node` 只 patch `{x,y,width,height}` 或 `{isChildMoveIn}` 等字段
- Frame 移动使用“子树平移 ops”（对子树每个节点 patch x/y），不再 `set_node(整棵 frame)`

### 2) 思维导图 MindNode（P1）

命中点（典型）：

- `apps/desktop/src/components/WhiteBoard/plugins/MindPlugin.tsx`
- `apps/desktop/src/components/WhiteBoard/utils/MindUtil.ts`
- `apps/desktop/src/components/WhiteBoard/components/MindNode/*`

迁移策略：

- 根节点树更新：用 diff 生成 `insert/remove/move + set_node(patch)`，不再一次性 `set_node(newRoot)`
- RootOnly 移动：用子树平移 ops
- 非结构性更新（文本/尺寸/属性）：`set_node` 只传 patch，不传完整节点对象（避免 children 一起带上）

### 3) Column（P2）

命中点（典型）：

- `apps/desktop/src/components/WhiteBoard/utils/ColumnUtil.ts`（relayout）
- `apps/desktop/src/components/WhiteBoard/plugins/ColumnPlugin.tsx`（resize、拖拽状态 patch）
- `apps/desktop/src/components/WhiteBoard/interactions/states/DraggingState.ts`（拖拽状态、移动，原 MovePlugin）
- `apps/desktop/src/components/WhiteBoard/components/Toolbar/Column/useCreateColumn.ts`（创建过程）

迁移策略：

- relayout/resize：用 diff ops 或 patch（禁止 `set_node(整棵 column)`）
- move：用子树平移 ops
- 拖拽状态：只 patch `isChildDraggingOver/dropIndex/draggingChildId/draggingPosition`

## 收口（最终门禁）

在 Frame/Mind/Column 全量迁移并验证后：

- 运行时：`set_node` 携带 `children` 直接报错（开发态/CI）
- 编译期：收紧 `SetNodeOperation` 类型，`children?: never`

## 额外说明（测试/环境）

- 为了避免测试环境加载 `tikzjax`（WebWorker）导致 unhandled rejection，`@tau/shared` 的 `TikZ` 组件改为按需动态加载 `tikzjax.js`。

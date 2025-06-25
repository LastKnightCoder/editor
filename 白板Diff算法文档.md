# 白板 Diff 算法文档

## 🎯 算法概述

白板 Diff 算法解决了在状态管理中计算两个白板状态之间差异的核心问题。当需要将一个白板状态转换为另一个状态时，算法能够生成最小化的操作集合，使得通过 `board.apply(operations)` 可以精确地完成状态转换。

### 核心挑战

- **状态比较**：深度比较复杂的嵌套对象和数组结构
- **操作最小化**：生成最少的操作来完成状态转换
- **路径正确性**：确保生成的操作路径在执行时有效
- **递归处理**：正确处理多层嵌套的子节点结构
- **位置变化检测**：识别和处理元素重排序

### 解决方案

五步处理流程：**修改检测** → **位置变化检测** → **删除处理** → **插入处理** → **递归处理**

## 🔧 算法实现

### 整体架构

```typescript
static diff(
  oldChildren: BoardElement[],
  newChildren: BoardElement[],
  basePath: number[] = []
): Operation[]
```

**输入**：旧状态数组、新状态数组、基础路径
**输出**：操作列表 (`Operation[]`)
**复杂度**：时间 O(n×m + k×log k)，空间 O(n + m)

### 第一步：建立元素映射

**目标**：创建基于 ID 的快速查找映射

```typescript
const oldMap = new Map<string, { element: BoardElement; index: number }>();
const newMap = new Map<string, { element: BoardElement; index: number }>();

oldChildren.forEach((element, index) => {
  oldMap.set(element.id, { element, index });
});
```

**原理**：使用 Map 结构实现 O(1) 查找复杂度，为后续比较提供高效的数据访问。

### 第二步：修改操作检测 (`set_node`)

**目标**：识别相同元素的属性变化

```typescript
for (const [id, { element: newElement, index: newIndex }] of newMap) {
  if (oldMap.has(id)) {
    const { element: oldElement } = oldMap.get(id)!;
    const changes = this.getElementChanges(oldElement, newElement);

    if (Object.keys(changes).length > 0) {
      ops.push({
        type: "set_node",
        path: [...basePath, newIndex],
        properties: this.getElementProperties(oldElement),
        newProperties: changes,
      });
    }
  }
}
```

**关键特性**：

- 跳过 `children` 属性（单独递归处理）
- 检测属性删除（设为 `null`）
- 只记录实际变化的属性

### 第三步：位置变化检测 ⭐

**目标**：识别元素重排序并生成相应操作

```typescript
const positionChanges = [];
for (const [id, { element: newElement, index: newIndex }] of newMap) {
  if (oldMap.has(id)) {
    const { index: oldIndex } = oldMap.get(id)!;
    if (oldIndex !== newIndex) {
      positionChanges.push({ id, element: newElement, oldIndex, newIndex });
    }
  }
}

// 处理重排序：先删除后插入
if (positionChanges.length > 0) {
  // 按旧索引降序删除
  const sortedForDelete = positionChanges.sort(
    (a, b) => b.oldIndex - a.oldIndex,
  );
  // 按新索引升序插入
  const sortedForInsert = positionChanges.sort(
    (a, b) => a.newIndex - b.newIndex,
  );
}
```

**重排序策略**：

- **删除阶段**：从后往前删除（避免索引偏移）
- **插入阶段**：按目标位置顺序插入
- **原子操作**：确保重排序的原子性

### 第四步：真正的删除操作 (`remove_node`)

**目标**：移除不存在于新状态中的元素

```typescript
const toDelete = [];
const positionChangedIds = new Set(positionChanges.map((p) => p.id));

for (const [id, { element, index }] of oldMap) {
  if (!newMap.has(id) && !positionChangedIds.has(id)) {
    toDelete.push({ element, index });
  }
}

// 从后往前删除
toDelete.sort((a, b) => b.index - a.index);
```

**避免重复处理**：排除已经因位置变化处理过的元素。

### 第五步：真正的插入操作 (`insert_node`)

**目标**：添加新状态中的新元素

```typescript
for (const [id, { element: newElement, index: newIndex }] of newMap) {
  if (!oldMap.has(id) && !positionChangedIds.has(id)) {
    ops.push({
      type: "insert_node",
      path: [...basePath, newIndex],
      node: newElement,
    });
  }
}
```

### 第六步：递归处理子节点

**目标**：对每个元素的子节点递归调用 diff

```typescript
// 在修改检测阶段同时处理
if (oldElement.children || newElement.children) {
  const oldChildrenArray = oldElement.children || [];
  const newChildrenArray = newElement.children || [];
  const childOps = this.diff(oldChildrenArray, newChildrenArray, path);
  ops.push(...childOps);
}
```

## ⚙️ 核心方法详解

### `getElementChanges` - 属性差异检测

```typescript
private static getElementChanges(
  oldElement: BoardElement,
  newElement: BoardElement
): Partial<BoardElement>
```

**功能**：

- 深度比较元素属性
- 识别新增、修改、删除的属性
- 跳过 `children` 属性

**返回值示例**：

```typescript
// 输入
oldElement = { id: "1", x: 10, color: "red", opacity: 0.5 }
newElement = { id: "1", x: 20, color: "blue" }

// 输出
{
  x: 20,           // 修改
  color: "blue",   // 修改
  opacity: null    // 删除
}
```

### `isValueChanged` - 深度比较算法

```typescript
private static isValueChanged(oldValue: any, newValue: any): boolean
```

**支持类型**：

- **基本类型**：直接值比较
- **数组**：长度 + 递归元素比较
- **对象**：键集合 + 递归值比较
- **null/undefined**：严格区分

**比较示例**：

```typescript
isValueChanged([1, 2, 3], [1, 2, 4]); // true
isValueChanged({ a: 1, b: 2 }, { a: 1, b: 2 }); // false
isValueChanged({ a: 1 }, { a: 1, b: 2 }); // true
```

### `getElementProperties` - 属性提取

```typescript
private static getElementProperties(element: BoardElement): Partial<BoardElement>
```

**功能**：提取除 `children` 外的所有属性，用于 `set_node` 操作的 `properties` 字段。

## 🚀 性能与测试

### 性能指标

- **算法性能**：处理 100 个元素 < 50ms
- **时间复杂度**：
  - 最佳情况：O(n) - 无变化或简单变化
  - 平均情况：O(n log n) - 包含排序的重排序
  - 最坏情况：O(n²) - 深度递归 + 复杂对象比较
- **空间复杂度**：O(n) - 映射表和临时数组

### 测试架构

```
📁 测试文件（18个测试用例）
📄 BoardUtil.diff.test.ts
├── 基本功能测试 (4)
│   ├── 应该生成插入操作 - 新增元素
│   ├── 应该生成删除操作 - 移除元素
│   ├── 应该生成修改操作 - 属性变化
│   └── 相同数组应该返回空操作
├── 复杂场景测试 (3)
│   ├── 应该处理混合操作 - 增删改
│   ├── 应该处理子节点的递归 diff
│   └── 应该处理深层嵌套结构
├── 属性变化处理测试 (3)
│   ├── 应该处理属性删除（设为 null）
│   ├── 应该处理复杂对象属性
│   └── 应该处理数组属性
├── 边界情况测试 (4)
│   ├── 空数组 diff
│   ├── 处理 children 为 undefined 的情况
│   ├── 处理大量元素的性能
│   └── 处理相同 ID 但不同索引的情况 🆕
├── isValueChanged 辅助方法测试 (3)
│   ├── 基本类型比较
│   ├── 数组比较
│   └── 对象比较
└── 集成测试 (1)
    └── diff 结果应用后能正确转换状态
```

**测试覆盖场景**：

- **基础操作**：插入、删除、修改的独立测试
- **递归处理**：多层嵌套结构的正确处理
- **属性类型**：基本类型、对象、数组、null/undefined
- **重排序**：相同元素不同位置的处理 ⭐
- **性能**：大量数据的处理效率
- **边界情况**：空数组、异常数据结构

## 📖 使用指南

### 基本用法

```typescript
import { BoardUtil } from "./BoardUtil";

const oldChildren = [
  { id: "1", type: "rect", x: 10, y: 20 },
  { id: "2", type: "circle", x: 30, y: 40 },
];

const newChildren = [
  { id: "1", type: "rect", x: 15, y: 20 }, // 修改 x
  { id: "3", type: "line", x: 50, y: 60 }, // 新增，删除了 id: "2"
];

// 生成差异操作
const operations = BoardUtil.diff(oldChildren, newChildren);

// 应用到白板
board.apply(operations);
```

### 操作类型示例

```typescript
// 修改操作
{
  type: "set_node",
  path: [0],
  properties: { id: "1", type: "rect", x: 10, y: 20, width: 100, height: 100 },
  newProperties: { x: 15 }
}

// 删除操作
{
  type: "remove_node",
  path: [1],
  node: { id: "2", type: "circle", x: 30, y: 40, width: 100, height: 100 }
}

// 插入操作
{
  type: "insert_node",
  path: [1],
  node: { id: "3", type: "line", x: 50, y: 60, width: 100, height: 100 }
}
```

### 嵌套结构处理

```typescript
const oldChildren = [
  {
    id: "group1",
    type: "group",
    x: 0,
    y: 0,
    children: [{ id: "child1", type: "rect", x: 10 }],
  },
];

const newChildren = [
  {
    id: "group1",
    type: "group",
    x: 5,
    y: 0, // 父元素位置变化
    children: [
      { id: "child1", type: "rect", x: 15 }, // 子元素位置变化
    ],
  },
];

const operations = BoardUtil.diff(oldChildren, newChildren);
// 生成：
// 1. set_node [0] - 修改父元素 x: 0 → 5
// 2. set_node [0, 0] - 修改子元素 x: 10 → 15
```

### 重排序处理

```typescript
const oldChildren = [
  { id: "a", type: "rect" },
  { id: "b", type: "rect" },
  { id: "c", type: "rect" },
];

const newChildren = [
  { id: "c", type: "rect" }, // 位置变化 [2] → [0]
  { id: "a", type: "rect" }, // 位置变化 [0] → [1]
  { id: "b", type: "rect" }, // 位置变化 [1] → [2]
];

const operations = BoardUtil.diff(oldChildren, newChildren);
// 生成重排序操作：
// 1. remove_node [2] - 删除 c
// 2. remove_node [1] - 删除 b
// 3. remove_node [0] - 删除 a
// 4. insert_node [0] - 插入 c 到位置 0
// 5. insert_node [1] - 插入 a 到位置 1
// 6. insert_node [2] - 插入 b 到位置 2
```

## 🛠️ 关键修复历程

### 问题发现

**初始实现阶段**：

1. **基础功能完成** - 插入、删除、修改操作正常工作
2. **递归处理正常** - 子节点的差异检测功能正常
3. **属性比较精确** - 深度比较算法工作正确

**测试验证阶段**：

4. **重排序失效** ⚠️ - "处理相同 ID 但不同索引的情况" 测试失败

### 错误现象

```typescript
// 测试场景
const oldChildren = [
  createElement("a", "rect"),
  createElement("b", "rect"),
  createElement("c", "rect"),
];

const newChildren = [
  createElement("c", "rect"), // 位置变化
  createElement("a", "rect"),
  createElement("b", "rect"),
];

const operations = BoardUtil.diff(oldChildren, newChildren);
expect(operations.length).toBeGreaterThan(0); // ❌ 失败：实际为 0
```

**问题分析**：

- 算法只检查了元素**存在性**和**属性变化**
- 忽略了元素**位置变化**（重排序）
- 相同元素在不同位置被认为"无变化"

### 修复过程

**第一步：问题诊断**

```typescript
// 调试发现：所有元素都被认为"无变化"
for (const [id, { element: newElement, index: newIndex }] of newMap) {
  if (oldMap.has(id)) {
    // ✅ 元素存在检查通过
    const changes = this.getElementChanges(oldElement, newElement);
    // ✅ 属性无变化（相同元素）
    // ❌ 未检查位置变化
  }
}
```

**第二步：位置变化检测** ⭐

添加位置变化检测逻辑：

```typescript
// 检测位置变化
const positionChanges = [];
for (const [id, { element: newElement, index: newIndex }] of newMap) {
  if (oldMap.has(id)) {
    const { index: oldIndex } = oldMap.get(id)!;
    if (oldIndex !== newIndex) {
      // 🆕 位置变化检测
      positionChanges.push({
        id,
        element: newElement,
        oldIndex,
        newIndex,
      });
    }
  }
}
```

**第三步：重排序操作生成**

```typescript
// 生成重排序操作：删除 + 插入
if (positionChanges.length > 0) {
  // 先删除（降序避免索引偏移）
  const sortedForDelete = positionChanges.sort(
    (a, b) => b.oldIndex - a.oldIndex,
  );

  // 后插入（升序保证顺序）
  const sortedForInsert = positionChanges.sort(
    (a, b) => a.newIndex - b.newIndex,
  );
}
```

**第四步：避免重复处理**

```typescript
// 排除已处理的元素
const positionChangedIds = new Set(positionChanges.map((p) => p.id));

for (const [id, { element, index }] of oldMap) {
  if (!newMap.has(id) && !positionChangedIds.has(id)) {
    // 🆕 避免重复
    // 只处理真正删除的元素
  }
}
```

### 修复验证

**测试结果**：

```bash
✓ BoardUtil.diff 测试 > 边界情况测试 > 处理相同 ID 但不同索引的情况
✓ 所有 18 个测试用例通过
```

**验证逻辑**：

```typescript
const operations = BoardUtil.diff(oldChildren, newChildren);
expect(operations.length).toBeGreaterThan(0); // ✅ 通过

// 验证操作正确性
const setOps = operations.filter((op) => op.type === "set_node");
expect(setOps).toHaveLength(0); // ✅ 无属性变化，无 set_node
```

## 🔍 算法核心洞察

### 关键理解

> **核心发现**：Diff 算法不仅要检测元素的**内容变化**，还要检测元素的**位置变化**。即使元素属性完全相同，位置的改变也构成需要处理的差异。

### 设计原则

1. **完整性**：覆盖所有类型的变化（内容、位置、存在性）
2. **最小化**：生成最少的操作完成转换
3. **原子性**：重排序通过删除+插入的原子操作实现
4. **效率性**：O(1) 查找 + 最小化对象比较

### 性能优化策略

1. **Map 查找**：O(1) 元素存在性检查
2. **增量比较**：只比较变化的属性
3. **排序优化**：删除和插入分别排序避免索引冲突
4. **递归控制**：按需递归，避免不必要的深度遍历

## 🎯 算法应用场景

### 状态同步

```typescript
// 远程状态同步
const localState = board.children;
const remoteState = await fetchRemoteState();
const syncOps = BoardUtil.diff(localState, remoteState);
board.apply(syncOps);
```

### 撤销重做

```typescript
// 撤销操作的生成
const beforeState = historyManager.getCurrentState();
const afterState = historyManager.getTargetState();
const undoOps = BoardUtil.diff(afterState, beforeState);
board.apply(undoOps);
```

### 协同编辑

```typescript
// 操作冲突解决
const baseState = conflictResolver.getBaseState();
const localState = board.children;
const resolvedOps = BoardUtil.diff(baseState, localState);
conflictResolver.applyResolution(resolvedOps);
```

## 📈 未来优化方向

### 算法增强

1. **Move 操作支持**：直接生成 `move_node` 而非删除+插入
2. **批量优化**：合并连续的同类操作
3. **增量更新**：基于版本的差异检测
4. **并行处理**：大数据量的并行 diff 计算

### 性能提升

1. **内存优化**：减少临时对象创建
2. **算法改进**：更高效的深度比较
3. **缓存机制**：重复比较结果缓存
4. **预处理**：预先计算常用的比较结果

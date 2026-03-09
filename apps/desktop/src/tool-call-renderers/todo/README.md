# TodoToolRenderer UI 优化

## 优化内容

### 1. TodoRowCard 卡片优化

#### 视觉层次提升

- **标题字号提升**：从 `text-sm` 提升到 `text-base`，增强视觉权重
- **标题颜色优化**：深色主题使用 `text-slate-50`，浅色主题使用 `text-slate-900`
- **类型标签缩小**：从 `text-xs` 缩小到 `text-[10px]`，降低视觉干扰

#### 逾期任务高亮

- 逾期任务在标题下方单独显示红色警告
- 格式：`⚠️ 逾期：YYYY-MM-DD HH:mm`
- 样式：`text-rose-500 font-medium text-sm`

#### 次要信息图标化

- 笔记数量：`📝 N` + Tooltip 显示详情
- 日历映射：`📅 N` + Tooltip 显示详情
- 周期规则：`🔄` + Tooltip 显示详情
- 使用纯 Tailwind CSS 实现的 Tooltip 组件

#### 元信息简化

- 移除前缀："分组："、"截止："、"更新："
- 格式：`分组名称 · 截止时间 · 更新时间`
- 使用 `opacity-60` 降低视觉权重

#### 描述区域优化

- 增加顶部间距：`mt-3`（从 `mt-2`）
- 降低透明度：`opacity-50`（从 `opacity-70`）

### 2. TodoToolRenderer 主渲染器优化

#### 统计卡片优化

- 从 3 列 grid 改为横向滚动的 flex 布局
- 移除边框，简化视觉
- 每个卡片最小宽度 120px，支持横向滚动

#### 分组标题优化

- 字号从 `text-xs` 增大到 `text-sm`
- 字重从 `font-medium` 增强到 `font-semibold`
- 增加底部间距：`pb-2`

#### 展开/收起功能

- 每个分组默认显示 10 个任务
- 超过 10 个显示"展开全部（+N）"按钮
- 点击后显示所有任务，按钮文字改为"收起"

#### 卡片间距增加

- 从 `space-y-2` 改为 `space-y-3`
- 增加呼吸感，提升阅读体验

#### 移除 antd 依赖

- 移除 `App.useApp()` 和 `message` 的使用
- 错误处理改为 `console.error`

### 3. 新增组件

#### Tooltip.tsx

- 纯 Tailwind CSS 实现的 Tooltip 组件
- 支持深色/浅色主题
- 使用 `group` 和 `group-hover:` 实现 hover 效果

### 4. 工具函数扩展

#### isOverdue

判断任务是否逾期：

```typescript
export const isOverdue = (item: TodoItem) => {
  return !item.isCompleted && item.dueAt && item.dueAt < Date.now();
};
```

#### getSecondaryInfoItems

获取次要信息项（笔记、日历映射、周期规则）：

```typescript
export const getSecondaryInfoItems = (item: TodoQueryItem) => {
  const items: Array<{ icon: string; text: string; tooltip: string }> = [];
  // ... 返回图标化的次要信息
  return items;
};
```

## 技术栈

- React 18
- TypeScript
- Tailwind CSS（无 antd 依赖）
- Vitest（测试）

## 测试

运行测试：

```bash
npx vitest run src/tool-call-renderers/__tests__/TodoToolRenderer.test.tsx
```

## 文件结构

```
tool-call-renderers/
├── TodoToolRenderer.tsx          # 主渲染器
├── todo/
│   ├── TodoRowCard.tsx          # 任务卡片组件
│   ├── Tooltip.tsx              # Tooltip 组件（新增）
│   ├── types.ts                 # 类型定义
│   ├── utils.ts                 # 工具函数
│   ├── constants.ts             # 常量定义
│   └── README.md                # 本文档
└── __tests__/
    └── TodoToolRenderer.test.tsx # 测试文件
```

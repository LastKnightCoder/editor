# ActionSheet 组件使用说明

## 定位

`ActionSheet` 是移动端业务层默认使用的“普通底部操作弹层”组件，适合：

- 选项列表选择（仓库、分支、卡片类型等）；
- 不需要 `normal/full/mini` 状态机；
- 不需要拖拽吸附交互。

> 说明：通用容器 `components/BottomSheet` 与 `components/ActionSheet` 自 2026-09 起内置
> 下拉关闭手势（`sheet-grab` 抓手与标题为拖拽热区，内容区滚动到顶后下拉同样接管），
> 但仍无 snap 状态机。

## 最小示例

```TSX
<ActionSheet
  open={open}
  title="选择仓库"
  value={repo}
  options={repoOptions}
  loading={loading}
  onClose={() => setOpen(false)}
  onSelect={next => setRepo(next)}
/>
```

## API 说明

- `open`: 是否展示弹层。
- `title`: 标题。
- `value`: 当前选中值。
- `options`: 可选项列表（`label/value`）。
- `loading`: 是否展示加载态。
- `emptyText`: 空列表文案。
- `cancelText`: 取消按钮文案。
- `onClose`: 关闭回调。
- `onSelect`: 选中回调。

## 与 SnapSheet 的边界

- `ActionSheet`: 无状态机、偏“操作选择”（支持下拉关闭，无吸附档位）。
- `SnapSheet`: 有状态机、偏“内容承载 + 拖拽吸附”。

如果页面需要 `normal/full` 档位切换、复杂滚动协同，请使用 `SnapSheet`；
仅需“下拉关闭”时通用 `BottomSheet`/`ActionSheet` 已内置。

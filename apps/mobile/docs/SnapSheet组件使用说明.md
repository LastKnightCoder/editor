# SnapSheet 组件使用说明

## 定位

`SnapSheet` 是移动端业务层默认使用的“可拖拽状态抽屉”组件，面向：

- `normal/full`（可选 `mini`）状态切换；
- 上拉展开、下拉收起、遮罩关闭；
- 键盘与安全区联动；
- 内容区滚动与抽屉拖拽协同。

底层拖拽引擎由 `PanContainer` 提供，业务代码优先使用 `SnapSheet`，不要直接依赖 `PanContainer`。

## 最小示例

```tsx
<SnapSheet
  open={open}
  state={panelState}
  states={["normal", "full"]}
  normalHeight={0.72}
  onClose={onClose}
  onStateChange={(next) => setPanelState(next)}
>
  <>
    <SnapSheet.Handle />
    <header className="px-4 pb-2">标题</header>
    <SnapSheet.Scroll className="px-4 pt-2">{/* 内容 */}</SnapSheet.Scroll>
  </>
</SnapSheet>
```

## API 说明

### 主组件

- `open`: 是否展示。
- `state`: 受控状态（`mini|normal|full`）。
- `defaultState`: 非受控初始状态，默认 `normal`。
- `states`: 可用状态集合，默认 `["normal", "full"]`。
- `normalHeight` / `miniHeight`: 对应状态高度（比例或像素）。
- `onClose`: 请求关闭回调。
- `onStateChange`: 状态变化回调。
- `onTimelineChange`: 可选高级动画回调（实时进度）。
- `scrollRef`: 可选，绑定主滚动区，用于恢复滚动位置等。

### 子组件

- `SnapSheet.Handle`: 统一拖拽手柄。
- `SnapSheet.Scroll`: 普通滚动区（自动应用 `mobile-kb-scroll`）。
- `SnapSheet.FixedFooterScroll`: 带底部固定栏补偿的滚动区（自动应用 `mobile-fixed-footer-scroll`）。

### Hook（可选）

- `useSnapSheetState()`: 获取当前状态。
- `useSnapSheetTimeline()`: 获取实时动画 timeline。

## 选型建议

- 页面内有固定底栏（如编辑器工具栏）时，使用 `SnapSheet.FixedFooterScroll`。
- 无固定底栏时，使用 `SnapSheet.Scroll`。
- 仅需要普通底部选择弹层时，不要用 `SnapSheet`，改用 `ActionSheet`。

## 注意事项

- 不要再手写 `mobile-kb-scroll` / `mobile-fixed-footer-scroll` 的拼接逻辑，直接用 `SnapSheet` 子组件。
- 不要在业务层改写 `--kb-height` / `--kb-viewport-height`。
- 如果场景不需要状态机，不要为了统一而滥用 `SnapSheet`。

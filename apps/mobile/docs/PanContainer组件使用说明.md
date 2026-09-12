# PanContainer 组件使用说明（底层引擎）

## 定位

`PanContainer` 是移动端抽屉的底层拖拽引擎组件，负责：

- 抽屉状态机（`mini/normal/full`）；
- 拖拽手势、吸附决策、下滑关闭；
- 键盘视口变化后的高度重算；
- 对外暴露进度与遮挡 CSS 变量（例如 `--pan-occluded-bottom`）。

---

业务层默认请使用 `SnapSheet`，不要直接使用 `PanContainer`。相关文档：`apps/mobile/docs/SnapSheet组件使用说明.md`。

## 何时直接使用 PanContainer

- 你需要自定义底层手势策略，而 `SnapSheet` 无法覆盖。
- 你需要完全自定义抽屉结构，不使用 `SnapSheet.Handle/Scroll` 组合。
- 你在维护底层基础设施或编写底层测试。

## 最小示例（仅底层场景）

```TSX
const scrollRef = useRef<HTMLDivElement | null>(null);

<PanContainer
  open={open}
  initialState="normal"
  enabledStates={["normal", "full"]}
  heights={{ normal: 0.72 }}
  scrollRef={scrollRef}
  onRequestClose={onClose}
>
  <>
    <div className="flex justify-center py-3">
      <div className="h-1 w-10 rounded-full bg-gray-300" />
    </div>
    <div
      ref={scrollRef}
      className="mobile-kb-scroll min-h-0 flex-1 overflow-y-auto"
    >
      ...
    </div>
  </>
</PanContainer>;
```

## 注意事项

- 直接使用时，滚动区必须自行配置为可滚动容器，并正确处理 `scrollRef`。
- 有底部固定栏时，滚动区必须使用 `mobile-fixed-footer-scroll`（或等效补偿逻辑），否则 `normal` 态可能出现底部不可达。
- 不要在业务组件里手写 `--kb-height` / `--kb-viewport-height`。
- 对于普通业务抽屉，请优先迁移到 `SnapSheet` 以降低维护成本。

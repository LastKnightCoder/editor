# WhiteBoard Benchmarks

## 命中索引基线

```bash
pnpm --filter desktop bench:whiteboard-hit
```

可选参数：

- `HIT_BENCH_ELEMENTS`（默认 `12000`）
- `HIT_BENCH_QUERIES`（默认 `500`）
- `HIT_BENCH_ROUNDS`（默认 `8`）
- `HIT_BENCH_WARMUP_ROUNDS`（默认 `2`）

## 渲染 Profile 基线（React Profiler）

```bash
pnpm --filter desktop bench:whiteboard-render-profile
```

可选参数：

- `RENDER_BENCH_RECTS`（默认 `1600`）
- `RENDER_BENCH_ARROWS`（默认 `400`）
- `RENDER_BENCH_SELECTION_OPS`（默认 `160`）
- `RENDER_BENCH_ARROW_OPS`（默认 `160`）
- `RENDER_BENCH_ROUNDS`（默认 `6`）
- `RENDER_BENCH_WARMUP_ROUNDS`（默认 `2`）

输出说明：

- `selection script`：高频切换选中元素的总耗时统计。
- `arrow script`：高频切换箭头 `source.connectId`（center/right）的总耗时统计。
- `profiler(selection|arrow)`：对应脚本阶段内 React commit 的 `actualDuration` 统计。

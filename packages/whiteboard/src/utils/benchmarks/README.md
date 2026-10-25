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

## 协作文档容量与长会话

```bash
pnpm --filter @tau/collaboration test:whiteboard-capacity
```

该套件使用真实纯数据模型，分别验证 64 页/5000 元素、1024 个富文本根、8 MiB 编码边界，以及三端 3600 轮操作、逐条乱序/重复投递、双删双撤与 30 次模型副本重开。重开通过二进制状态重建，不是实际 WebSocket 重连。长会话的执行时限为 15 分钟，每 300 轮输出进度；它按工作量加速运行，不表示已经完成数小时的真实在线或弱网验收。

`WHITEBOARD_MEASURE` 输出编码字节、延迟分位数和进程 RSS。RSS 包含测试框架及所有文档副本，不是单文档堆预算；纯模型、命中索引与 jsdom Profiler 的数字不能相互替代，也不证明真实设备的界面帧率。准入上限不等于流畅编辑承诺。

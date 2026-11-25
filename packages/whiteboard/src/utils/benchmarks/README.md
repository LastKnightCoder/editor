# Whiteboard Benchmarks

## 拖动改动的快速验证

从仓库根目录运行。日常改动先跑快速模式，候选修复完成后再跑一次桌面混合验收。

```bash
pnpm --filter desktop bench:whiteboard-quick
pnpm --filter desktop bench:whiteboard-acceptance
```

快速模式构建当前源码，打开 1,000 个富文本元素的白板，在 Chromium 4 倍 CPU 降速下右键拖动 48 步。用动画帧中的屏幕矩阵统计实际位置变化。要求至少 40 次位置变化、位置间隔 P95 ≤25 ms、按下至首次位置变化 ≤65 ms、≥50 ms 帧最多一次，最终移动 240 像素。

桌面验收需要本地已有桌面主进程和 preload 构建。命令另建当前源码的生产渲染包，使用临时资料库，加载 480 个图形、240 条绑定连线、240 个富文本元素和 12 张真实 PDF 卡面。预热后三轮往返拖动逐轮检查跟手门限和落点，然后跨区滚动、定点缩放、移动 PDF 卡并从独立租约读取保存位置。输出拖卡过程与松手耗时。纯模型的长会话压测有独立入口。

### PDF 卡松手

```bash
pnpm --filter desktop bench:whiteboard-release
```

短测启动临时 Chromium 页面，把本地生成的 PDF 解码为页图，挂在实际文档卡外壳与本机文档绑定上。它与桌面验收共用混合元素夹具。每次运行做一次预热和三次正式拖动，从真实 `pointerup.timeStamp` 量到下一次动画帧，同时采样再下一帧。每轮都验证该次松手实际写入了几何增量，模型与屏幕落点吻合。正式轮中位数须 ≤25 ms，每轮及后续一帧均须 ≤50 ms。

`stages` 是嵌套的同步调用耗时。模型候选复制、预算核算和校验包含在 `model.submit` 内，不可把所有字段相加。桌面混合验收另用生产 PDF 卡面、本机保存和独立租约读回，检查松手首帧 ≤50 ms，并记录随后半秒内最长帧间隔。

## 浏览器与桌面交互

从仓库根目录运行。浏览器基准临时构建独立示例的生产包，使用桌面包已安装的 Playwright Chromium。如本机尚未安装对应浏览器，先运行 `pnpm --filter desktop exec playwright install chromium`。

```bash
node apps/desktop/scripts/bench-whiteboard-interaction.mjs
```

100 / 5,000 个图形和 1,000 个富文本元素按固定坐标生成。每个场景使用新页面，每次输入 48 步；分别覆盖右键平移、滚轮、定点缩放和元素拖动。富文本另测 Chromium 4 倍 CPU 降速，可在脚本参数追加 `--cpu-stress-only` 单跑。第 0 轮预热，第 1–3 轮比较中位数。`taskMs` 为 Chromium 渲染主线程在整段操作中处理任务的累计时间，`updates` 计数 SVG 视口属性或位移样式变更的通知批次。帧间隔来自 requestAnimationFrame。脚本同时校验屏幕坐标与逻辑视口及元素最终位置。

桌面 PDF 场景需要已构建的桌面主进程、preload 与渲染包。测试创建独立临时资料库，生成一份本地 PDF，将 12 张引用卡放到同一页，在窗口获得焦点后采集空闲与拖动帧间隔。可用 `WHITEBOARD_RENDERER_HTML` 指定同版本其他渲染构建的 index.html。比较时保持相同窗口尺寸和前台状态，压测与构建串行。

```bash
pnpm --filter desktop exec playwright test e2e/whiteboard-pdf-pan.spec.ts
```

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
- `group-render` 测量含 5,000 个可见子元素的单个容器生成 React 元素树的耗时。

## 协作文档容量与长会话

```bash
pnpm --filter @tau/collaboration test:whiteboard-capacity
```

该套件使用真实纯数据模型，分别验证 64 页/5000 元素、1024 个富文本根、8 MiB 编码边界，以及三端 3600 轮操作、逐条乱序/重复投递、双删双撤与 30 次模型副本重开。重开通过二进制状态重建，不是实际 WebSocket 重连。长会话的执行时限为 15 分钟，每 300 轮输出进度；它按工作量加速运行，不表示已经完成数小时的真实在线或弱网验收。

`WHITEBOARD_MEASURE` 输出编码字节、延迟分位数和进程 RSS。RSS 包含测试框架及所有文档副本，不是单文档堆预算；纯模型、命中索引与 jsdom Profiler 的数字不能相互替代，也不证明真实设备的界面帧率。准入上限不等于流畅编辑承诺。

## 创建预览生命周期

```bash
WHITEBOARD_PREVIEW_BENCH=1 pnpm --filter @tau/whiteboard test src/__tests__/collaboration-products.test.tsx -t '内置字段预览生命周期压测'
WHITEBOARD_PREVIEW_BENCH=1 pnpm --filter @tau/whiteboard test src/__tests__/author-collaboration.test.tsx -t '插件预览提交取消与订阅释放压测'
```

默认各跑 600 轮，用 `PREVIEW_BENCH_CYCLES` 调整轮数。两条命令串行运行，避免争用机器。内置场景覆盖 Frame、Column 与图片说明，每轮 8 次实际 DOM 更新，并在同一 React 批处理中取消、复用同一 ID 重开；插件场景每轮 24 次更新，每 12 轮提交、编辑、撤销、重做，逐轮检查文档未被预览改写、旧租约不可写以及文档订阅回到零。默认单测不运行这些长循环。

`WHITEBOARD_PREVIEW_MEASURE` 输出轮数、更新数、每轮耗时 P50/P95 与插件剩余订阅数。耗时包含 jsdom 的 React 提交和行为断言，用于本机复测，不代表浏览器帧率；订阅检查证明本场景的文档监听已释放，不替代堆内存泄漏分析。

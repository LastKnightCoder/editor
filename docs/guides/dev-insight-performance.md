# 知识洞察与白板输入性能验证

## 准备

1. 在仓库根目录构建桌面 bundle：`pnpm --filter desktop exec vite build --configLoader runner`。
2. 与构建、其他压测顺序执行性能轮次。保留源码修订、dirty 状态、运行时版本、CPU 配置、编译入口和 Worker 的哈希。
3. 使用临时资料库与固定种子的合成向量。不得直接在正在使用的资料库上压测；真实分布必须先通过 SQLite 一致性备份取得隔离副本。
4. 需要同时修改源码时，把 `dist`、`dist-electron` 与 `package.json` 复制到独立目录，将绝对目录写入 `TAU_CONTENT_PRODUCTION_APP_OVERRIDE`。后台 Worker 与窗口使用同一冻结构建。

## 契约与原生加载

运行与改动直接相关的桌面洞察、候选 Worker、白板保存 Worker、白板会话测试，以及 collaboration 的 `whiteboard-budget.test.ts`、`whiteboard-concurrency.test.ts`。普通测试只验证语义和生命周期，不加入时钟或内存阈值。

Windows 已有 `apps/desktop/release/win-unpacked/` 运行时时，运行：

```powershell
pnpm --filter desktop test:insight-worker
```

通过条件是 ASAR 内的真实候选 Worker 使用发行运行时的 better-sqlite3 与 unpacked sqlite-vec DLL 读索引并得到独立预期的提问分组。探针不更新已安装软件，不读取用户资料库；它不代替完整安装包验收。

## 同算法主线程与 Worker 对照

```powershell
$env:INSIGHT_NOTE_VECTORS='10000'
$env:INSIGHT_PROMPTS='2000'
$env:INSIGHT_REPORT_NAME='representative'
pnpm --filter desktop bench:insight-candidates
```

两种模式各完整完成一次真实候选计算，核对结果摘要一致；比较候选总耗时、主线程事件循环 P99 与最大值。该对照隔离执行位置，使用同一候选核心，不代表旧安装包的历史跑分。通过条件为 Worker 总耗时不超过主线程基线的 `1.2 倍 + 500ms`，Worker 计算时主线程 P99 ≤50ms、最大值 <200ms。

容量验证把笔记向量设为 50000、历史提问设为 20000，并设置 `INSIGHT_BENCH_MODES=worker`；仍按生产规则处理最近的提问窗口，必须等待作业实际完成。不得用空结果、缓存空跑或较短窗口代替负载。

## 真实白板输入与保存

```powershell
$env:INSIGHT_SCENE='plain'
$env:INSIGHT_NOTE_VECTORS='10000'
$env:INSIGHT_PROMPTS='2000'
$env:INSIGHT_SAMPLES='2000'
$env:INSIGHT_ROUNDS='3'
$env:INSIGHT_CPU_RATES='1,4'
$env:INSIGHT_MODES='worker'
$env:INSIGHT_REPORT_NAME='typing-plain'
pnpm --filter desktop bench:insight-typing
```

- `plain` 为一组文字/图形；`mixed`（默认）增加 240 条分段笔迹和 12 组文字/图形。两种场景分别记录，不混合统计。
- `INSIGHT_MODES` 支持 `idle,sync,worker`，同步模式只用于诊断对照；持续主线程查询会显著延长按键注入时间。
- `INSIGHT_INPUT_DELAY_MS` 控制注入间隔，0 为突发输入；必须记录实际发送总时长，不能把驱动等待排除后宣称端到端无延迟。
- `INSIGHT_WARMUP=0` 包含冷轮次；默认先运行一轮短输入预热，正式轮次另计。
- CPU 降速只作用 renderer，不代表主进程与 Worker 同样慢四倍。
- 每轮使用不同文本标识，通过真实文档 IPC 核对耐久状态；末尾验证组合输入，并关闭应用后直接重开 SQLite 检查点再次核对。

计时门槛：正常速度输入至文本更新后帧边界 P95 ≤50ms、P99 ≤100ms；renderer 4× 为 P95 ≤100ms、P99 ≤200ms。正常速度主线程事件循环 P99 ≤50ms、最大值 <200ms；append 确认 P95 ≤100ms、P99 ≤200ms、最大值 <500ms。帧回调是可观察代理，不等于物理屏幕显示时刻；CDP 组合输入不代替用户的真实系统输入法验收。

必须确认输入窗口与真实候选计算重叠、作业确实完成。报告中的 `durableVerified`、`coldPersistenceVerified`、`imeVerified` 分别代表轮次耐久读取、冷重开和组合输入验证；任一失败都不能报告功能通过。未达到门槛的场景保留原始结果，不调高门槛换绿。

## 长稳与故障

```powershell
$env:INSIGHT_SCENE='mixed'
$env:INSIGHT_NOTE_VECTORS='1000'
$env:INSIGHT_PROMPTS='200'
$env:INSIGHT_SAMPLES='2000'
$env:INSIGHT_ROUNDS='1'
$env:INSIGHT_CPU_RATES='1'
$env:INSIGHT_MODES='worker'
$env:INSIGHT_INDEX_WRITES='1'
$env:INSIGHT_FAULT_EVERY='10'
$env:INSIGHT_STABILITY_MS='1800000'
$env:INSIGHT_REPORT_NAME='stability'
pnpm --filter desktop bench:insight-typing
```

故障/长稳与计时放行分开，报告明确 `performanceGateApplied=false`，指标只作观测。至少持续 30 分钟，验证：

- 每轮输入与耐久状态一致，冷重开完整；无意外计算错误。
- 同时活跃的候选 Worker 至多一个，结束后为零；实际发生取消且后续正常作业仍能完成。
- 索引写入持续推进，读者结束后 WAL 检查点可完成；关闭后临时文件可清理。
- 暖机后的多个等长窗口内 RSS/heap 与线程数形成平台；持续无界增长必须归因，不以一次 GC 证明无泄漏。

切库、同名库替换、迟到模型回包、线程失败与重试另由确定性生命周期用例验证，不用真实 sleep 争抢时序。记录这些用例与真实 IPC、传输替身的边界。

## 产物

JSON、原始日志和可选 CPU profile 写入 `apps/desktop/output/knowledge-insights-performance/`。`INSIGHT_MAIN_PROFILE` 和 `INSIGHT_RENDERER_PROFILE` 仅用于归因，剖析轮次不能冒充无 profiler 的正式计时。报告同时保留未达标项与样本数，不记录正文、用户提问或向量内容。

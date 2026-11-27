# 桌面性能排查

## 获取证据

1. 反馈时记录应用版本、问题出现时间、当时页面、刚进行的操作和持续时长。CPU 与内存截图保留进程名称及 PID。
2. 在反馈的「附带日志」中选择「普通日志」与「性能日志」。异常后重启再提交仍能附带近期本机留档；普通日志用于查看异常与 React 组件栈。
3. 需要本地分析时，命令面板执行「导出性能快照」。渲染窗口无响应时尝试托盘/Dock 中同名入口。自动异常片段位置、保留范围及采集阈值见 [性能诊断架构](/docs/architecture/desktop/performance.md)。

## 读取快照

1. 检查 meta 的版本、会话、CPU 核心数与导出时间。先看 collector 的丢弃、过期操作、存储失败和省略数量；缺失数据不能解释为没有问题。
2. 优先查看 incidents 的 reasons、状态、beforeAvailableMs 和 summary。recording/interrupted 代表采集尚未完成或中断，后段可能不存在。近期多个会话的片段以 sessionId 区分。
3. 由 summary.processes 找 CPU、RSS 或堆峰值所在 PID，结合 windows、事件 source 和 context 定位窗口、页面及正文。与系统截图对比时统一整机/单核口径，GPU RSS 与渲染 JS heap 分开看。
4. 按 operationId/parentId 把 operation-start/end、stage-start/stage、db-command 串起来。对照慢阶段的最大耗时上下文，分辨打开会话、绑定、快照、差异、合并、保存和投影；只有开始没有结束时查看对应阶段和普通日志。不要把 db-command 当成单条 SQL。
5. 在同一时段对照 CPU、堆、事件循环、交互、query/IPC 计数与异常。相同正文或命令反复出现只是候选，需复现确认；单次堆上涨不能证明泄漏。
6. 在普通日志里搜索 React 错误、componentStack、节点身份错误和未捕获异常。性能事件不含错误正文，依靠会话、PID/窗口编号和时间关联。

旧快照没有 schemaVersion 2 时按原 renderer/main 数组阅读，不假设它具备操作关联或持久异常证据。

## 验证采集开销

```sh
pnpm --filter desktop bench:perf-diagnostics
```

该环境门控基准运行真实记录器的常态和突发输入，输出每条事件耗时、摘要耗时、保留字节及丢弃数量。它不加载桌面窗口，不能代替目标用户设备上的端到端 CPU 验证。

在目标设备复现时检查 collector.collectionMs 采样事件、事件速率、资源趋势和操作耗时。若采集队列持续丢弃，先缩小高频事件范围或提高聚合程度，再比较相同操作。

## CPU 调用栈与源码位置

1. 检查异常片段的 cpu.status。skipped/failed/interrupted 时先读 reason，不把缺失样本当作空闲。complete 时对照 actualDurationMs、summary.sampledMs、omittedSamples 与 profileOmitted，确认样本覆盖范围。
2. 使用 cpu.buildId 查找构建机器保存的 `apps/desktop/output/diagnostics-symbols/<buildId>/`。同版本重新构建的 map 也不能替代原归档；当前本机 `latest.json` 只用于检查当前产物。
3. 在 `apps/desktop/` 运行离线映射；`--log` 可附普通日志以映射异常/React 栈，`--profiles` 可导出还原后的 V8 profile。输入支持 JSON 与 gzip。

```sh
node scripts/perf-symbolicate.mjs \
  --input /path/to/feedback-perf.json.gz \
  --symbols output/diagnostics-symbols \
  --log /path/to/feedback-log.log.gz \
  --output /path/to/report.json \
  --profiles /path/to/cpu-profiles
```

4. 按 report 中的 original.file/line/column 查看热点和异常栈；unmapped 表示未能可靠还原，按具体原因补齐归档或位置。`cpu-*.cpuprofile` 可交给支持 V8 profile 的分析工具查看调用树。
5. 将 selfMs、totalMs 与同期操作阶段/CPU 趋势对照。采样只覆盖触发后的短窗口；主要为 idle 时先检查异常是否已经结束。GPU、原生线程和 Web Worker 不在这些 JS 样本中。

## 构建归档与采样验证

生产 Vite 构建后运行 `node scripts/verify-perf-symbols.mjs`，确认各目标的映射与当前产物哈希一致、客户端目录无 map。桌面打包流程已包含此检查；每份已分发安装包的 buildId 目录应随构建产物保留，发布时单独上传到 R2 的 symbol 前缀。

```sh
pnpm --filter desktop test:perf-cpu
node --test apps/desktop/scripts/__tests__/perf-symbolicate.test.mjs
```

真实采样验证运行隔离的临时 Electron 实例，检查主线程忙碌时 worker 停止、renderer 热点、调试占用、取消和路径清理；不读取用户资料库。它是环境门控验证，不能替代目标设备上的开销对比。

## R2 归档上传与取回

1. 复用发布桶 `tau-release`：安装包与更新清单使用 `desktop/`，源码映射使用 `desktop-symbols/<buildId>/`。归档包含源码，公开发布桶中的归档也遵循该桶的公开访问配置；目录前缀不隔离访问权限，`no-store` 只控制缓存。
2. 在本机或 CI 的私有环境配置现有 `R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`，Token 需要对 `tau-release` 的发布与 symbol 前缀有对象读写权限。脚本不创建桶，不在仓库或命令参数中保存凭据。
3. 正常发布在仓库根目录运行 `pnpm publish:desktop` 即可，脚本会自动构建并先归档 map，再发布安装包和更新清单。每次独立构建生成不同 buildId，因此 Mac、Windows 同版本分别构建不会混用；一次 JS 构建用于 Mac 多架构安装包时共用映射。

仅需单独校验或补传 map 时，可以继续使用下列命令。默认读取本机归档目录的 `latest.json`；历史构建用 `--build-id <ID>`，其他构建机器复制来的目录用 `--symbols <目录>`。

```sh
pnpm publish:desktop-symbols --dry-run
pnpm publish:desktop-symbols
```

上传前核对三个目标清单与每份 map 的 SHA-256，只打包清单引用的 map 和清单。ZIP 与描述文件存放在 `tau-release/desktop-symbols/<buildId>/`；完成描述文件最后以条件写入提交，上传中断时可安全重试。同一 buildId 的相同内容直接复用，内容不同拒绝覆盖。

4. 收到性能日志后，使用其 `cpu.buildId` 取回；下载完成后沿用本指南的离线映射命令。

```sh
pnpm fetch:desktop-symbols --build-id <日志中的buildId>
```

下载会校验 ZIP 大小、SHA-256、条目路径及各 map 哈希，全部通过后才将目录原子移动到本地 `apps/desktop/output/diagnostics-symbols/<buildId>/`。本地相同内容直接复用，不覆盖不同内容。压缩文件及解压后内容均有 512 MiB 上限；临时目录在成功或失败后清理。

安装包在构建完成时自动将文件哈希与 buildId 绑定到产物目录下的 `.build-receipts/`。`publish:desktop --skip-build` 会沿用绑定中的 ID；已有安装包被改动或缺少绑定时必须重新构建，不能用最新 map 代替。跨机器复制安装包时同时复制对应绑定记录；正式发布可自动从 R2 的 symbol 前缀取回缺失的历史 map，本地 dry-run 则须事先取回。

发布的 `--dry-run` 会核对安装包绑定和 map，并在临时目录打包校验，全程不访问 R2。取回历史归档不会修改本机的 `latest.json`；map 归档失败不会继续发布安装包或更新清单。

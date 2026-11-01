# 数据库多副本同步 Spike

用临时 SQLite 副本验证整个资料库的变更捕获、离线双向补传与冲突收敛。独立原型加载仓库真实主库 Schema，使用临时库；应用级验证复用真实宿主代码，不连接用户资料库。

## 当前混合方案

正文复用 `@tau/collaboration` 的真实协议 2 稳定节点模型，用 Yjs 合并；其他数据继续使用线性事务。新增持久二进制正文、未确认更新与快照携带，JSON 仅为可重建投影。

准备当前 worktree 的正常项目依赖后运行：

```sh
node scripts/spikes/database-sync/hybrid-runner.mjs test
node scripts/spikes/database-sync/hybrid-runner.mjs demo
TAU_SPIKE_RUST_BIN="$PWD/scripts/spikes/database-sync/native-peer/target/debug/tau-database-sync-native-spike" node scripts/spikes/database-sync/hybrid-runner.mjs all
```

runner 复用协作服务已声明的 tsx 与协作包已声明的 Yjs。它从当前 worktree 加载正文源码，不从其他工作区加载未提交实现；没有新增应用生产依赖。只运行 JavaScript 原型不需要先构建 Rust；全套中的原生用例需按下方命令构建并设置环境变量。

混合同步入口先确认正文，再提交其他事务。常规同篇冲突不生成库副本；不兼容基线保存为单篇副本；真正的元数据冲突后台保全整个库，返回 `libraryChoiceRequired: false` 并继续已确认主线。此标志是原型策略，不代表已经制作提示界面，也不表示元数据冲突已自动解决。

同一个库要求一致的正文模式。`rows` 模式与 `node-document-2` 模式不能混用，普通 JSON 回写托管正文会被拒绝。新运行请使用新临时库，未实现旧实验文件的原地升级。

## 应用级混合接入验证

```sh
cargo build --manifest-path apps/mobile/src-tauri/Cargo.toml --offline --features device-sync-spike --bin device-sync-peer
node scripts/spikes/database-sync/app-runner.mjs
node scripts/spikes/database-sync/app-runner.mjs --stress
```

该入口使用真实 Electron SQLite、移动 Rust 后端和固定证书 HTTPS，比较 98 张商业表，验证离线/重启/快照、旧 JSON、整数精度、连带引用、双向图片、丢响应和模拟前台恢复。原生生命周期信号与调用桥在调度验证中模拟，不等同于手机真机验收。当前事实与限制见[架构](/docs/architecture/device-sync.md)，客户端步骤见[操作指南](/docs/guides/ops-device-sync-spike.md)。

## 线性事务引擎单独验证

底层采用协议 4：线性数据库事务增量、快照兜底和完整 SQLite 冲突副本，不为每张表编写领域合并处理器。此前协议 1、2、3 保留作实验对照，其逐表门禁不属于新路径的接入前提。

```sh
node --test scripts/spikes/database-sync/linear.test.mjs
node scripts/spikes/database-sync/verify-linear.mjs --keep
```

`--keep` 保留演示生成的真实 SQLite 副本，并输出路径。正常同步只上传事务；需要快照发布或保存冲突时才上传整库。不同记录的写入在读写依赖未变化时可自动接续；同记录、依赖变化、唯一键冲突或未知依赖保留整库。

常见写入口可使用 `transaction(fn, { scoped: true })`，通过 `read`、`expect`、`scan`、`insert`、`update`、`remove` 记录依据与写集。任意 SQL 继续用原 `transaction(db => ...)`，只能沿原主线复制，不自动重放分叉。缓存中取得的依据必须传入观察版本；不能只声明写入目标。

业务仍需把公共统计、索引和本机维护写入与共享事实分开，否则无关笔记也可能因写入同一条派生记录而冲突。完整副本包含当前 Schema 的全部 98 张业务表和 BLOB，不包含库外附件或 JSONL。

协议 4 当前仅为 Node 原型，未接入 Rust、实际应用和配对界面。正常接续存在本地确认快照重建和全库摘要开销；只证明安全机制，不承诺真实设备延迟。

## 运行

需要 Node.js 24 和 Rust 工具链。JavaScript 部分只使用 Node 内置模块；Rust 探针复用移动端的 `rusqlite 0.29.0`。

```sh
cargo build --offline --manifest-path scripts/spikes/database-sync/native-peer/Cargo.toml
TAU_SPIKE_RUST_BIN="$PWD/scripts/spikes/database-sync/native-peer/target/debug/tau-database-sync-native-spike" node scripts/spikes/database-sync/hybrid-runner.mjs all
node scripts/spikes/database-sync/measure.mjs 1000
node scripts/spikes/database-sync/measure.mjs 1000 v2
node scripts/spikes/database-sync/contracts.mjs
node scripts/spikes/database-sync/verify-history.mjs
```

首次下载 Rust 依赖时去掉 `--offline`。未设置 `TAU_SPIKE_RUST_BIN` 时，原生互通用例会被跳过。数据库创建在系统临时目录，结束后删除。

## 文件职责

| 文件                                                     | 职责                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------- |
| [hybrid-replica.mjs](./hybrid-replica.mjs)               | 正文权威状态、Yjs 提交、投影保护、单篇保全与主线适配                      |
| [collaboration-runtime.mjs](./collaboration-runtime.mjs) | 加载当前工作区真实正文模型，保证使用同一个 Yjs 运行时                     |
| [hybrid-transport.mjs](./hybrid-transport.mjs)           | 正文优先的混合 HTTP 交换及安全重试                                        |
| [hybrid-runner.mjs](./hybrid-runner.mjs)                 | 运行专项、全套与可复现演示                                                |
| [hybrid.test.mjs](./hybrid.test.mjs)                     | 同篇离线、重启、快照、DeleteSet、旧 JSON 与单篇副本验证                   |
| [verify-hybrid.mjs](./verify-hybrid.mjs)                 | 输出重启与回收后合并、旧投影修复及副本数量证据                            |
| [linear-replica.mjs](./linear-replica.mjs)               | 当前主线：通用事务、读写依赖、快照与完整副本选择                          |
| [linear-transport.mjs](./linear-transport.mjs)           | 回环 HTTP 增量与快照交换、副本列表和主版本选择                            |
| [linear.test.mjs](./linear.test.mjs)                     | 简化方案的并发、离线、完整副本和中断验证                                  |
| [verify-linear.mjs](./verify-linear.mjs)                 | 可复现演示，可保留两份真实 SQLite 文件                                    |
| [replica.mjs](./replica.mjs)                             | 读取真实 Schema，生成捕获触发器，保存事务日志、来源进度和行版本，合并副本 |
| [semantic-replica.mjs](./semantic-replica.mjs)           | 协议 2：唯一键冲突区、待整理投影、带代次的单表与多表恢复                  |
| [field-codec.mjs](./field-codec.mjs)                     | 字段差量、二进制校验、内容寻址分块与压缩                                  |
| [contracts.mjs](./contracts.mjs)                         | 全部表的同步归属、结构审计和未实现业务门禁；可直接运行输出契约            |
| [history-replica.mjs](./history-replica.mjs)             | 协议 3：活跃设备确认、检查点、日志与内容块回收、长期离线恢复              |
| [history-transport.mjs](./history-transport.mjs)         | 恢复材料分页、耐久回执验证和检查点安装                                    |
| [history.test.mjs](./history.test.mjs)                   | 日志回收后的离线补齐、冲突保全、安装中断与分页重试                        |
| [native-history.test.mjs](./native-history.test.mjs)     | Rust 双向新协议和原生 SQLite 检查点安装                                   |
| [verify-history.mjs](./verify-history.mjs)               | 输出日志回收前后与离线重入的可复现证据                                    |
| [transport.mjs](./transport.mjs)                         | 仅监听回环地址的 HTTP 交换与自动轮询，不提供配对或鉴权                    |
| [spike.test.mjs](./spike.test.mjs)                       | 使用场景、异常恢复和不安全方案的反例                                      |
| [measure.mjs](./measure.mjs)                             | 小记录写入、HTTP 追赶和大字段写放大量测                                   |
| [native-peer](./native-peer/Cargo.toml)                  | 原始写入探针、新协议字段编解码、普通记录收发与原生检查点事务              |

## 实验协议

`Replica` 保留协议 1，用于复现原始行复制的限制；`SemanticReplica` 使用协议 2 验证领域规则与大字段差量；`HistoryReplica` 使用协议 3 验证表级契约、历史回收和长期离线重入。不同版本的副本不能混用。

协议 2 为 `plugin_entities` 与 `plugin_links` 实现唯一键裁决，完整保留冲突对象与关联；`editPreserved()` 可改名后重新呈现。为 `todo_group` 与 `todo_item` 实现父级删除后的待整理投影，并保留原归属。`restore()` 与 `restoreMany()` 必须引用具体删除事件，恢复后进入新代，原 ID 不变。

大字段传输按确定的行版本生成带摘要的字节差量，落盘复用按内容确定边界的压缩块；版本、内容块、业务投影和确认进度共用 SQLite 事务。历史没有自动回收。

协议 3 由单一检查点发布者管理回收。活跃设备全部持久确认后，才回收检查点覆盖的日志和无引用内容块。退役来源只允许经恢复流程重入：先保护未上传及代持修改，再安装检查点，最后使用新来源身份继续编辑。操作指纹、墓碑和未解决分支保留。

Rust 默认无子命令时仍运行原始协议 1 探针；`emit` 与 `receive` 支持协议 2、3 的普通记录，`decode-field` 验证共享字段格式，`verify` 和 `install` 验证并原子安装协议 3 检查点。增量写入目前只开放 `plugin_kv`、`plugin_records`，未实现领域明确拒绝。原生 `install` 可额外传入行数，使进程在安装该行后直接退出，用于回滚验证。

## 原型约束

首次加入须传入 `initialBaseline()` 返回的共同基线。写入须经 `transaction()`；设备整数编号段由调用方显式分配。普通行按逻辑时钟和来源身份选取主版本，删除保留永久墓碑，未采用的版本保留在日志中。

协议 1 的跨记录唯一约束冲突会阻止该来源后续进度；没有关系策略时仍会形成孤儿。协议 2 只处理代表领域；协议 3 列出全部 98 表，但 70 张拟复制表仍缺领域处理器，明确禁止变更及发布变化后的检查点。已有 12 个表的存储探针也不等于完整业务验收；本原型不适用于正式数据。

协议 2 的恢复会保留原 ID；普通重新插入不能冒充恢复。待整理组的 `-1` 只是实验保留编号。约束投影仍重建代表表，尚未做增量优化。协议 3 的发布者转移、配对鉴权、真实移动生命周期、物理文件压缩和大库流式检查点尚未验证。

恢复默认每页最多 128 个操作、256 KiB，可配置到请求上限 16 MiB；单个操作超过页预算时拒绝继续，旧库与材料不变。检查点上限 64 MiB。本轮证明预算内安全补齐，不承诺任意体量。

用例中包含不安全方案的反例；通过用例不代表全部业务规则已完成。Rust 覆盖新协议关键路径，尚未接入实际 Tauri 宿主。

独立 `HybridReplica` 原型仍由 Node 承载，`native-peer` 的协议 2、3 不能冒充混合接入。应用级验证另用真实移动宿主的 feature 二进制，复用 TS Yjs 编解码和 Rust 原子持久化；其证据与上面的独立原型分开。

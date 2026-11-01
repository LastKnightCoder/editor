# 数据库长期离线补齐与历史回收方案验证

2026 年 10 月 31 日，分支 `codex/database-sync-spike`。本次重点验证旧日志已被实际删除后，设备仍携带未上传修改返回时，能否保全数据并继续同步。

安全重入、历史回收和 Rust 新协议的关键路径已实现。46 个用例通过，0 个跳过，包含此前原型及反例。全部 98 表已列入机器可审计契约，但没有将结构清单冒充完整业务实现：82 张拟复制表中，12 张有存储适配探针，70 张缺领域处理器并被明确阻止；其余是 9 张本机表、6 张拟重建表和 1 张组控制表。完整产品同步仍不可启用。

## 全业务规则的处理方案

一个业务字段只有一个事实源。每个领域明确自然键、所有权、隐式引用、删除聚合、恢复聚合及可重建数据，再生成同步准入条件。SQL 主键、唯一索引和外键只提供结构线索，不自动决定业务合并语义。

[契约清单](/scripts/spikes/database-sync/contracts.mjs) 对所有表显式分组、定义同步归属，并读取当前 Schema 的字段、主键、唯一索引、部分索引和外键。清单遗漏、表数量变化或规则指纹不一致都会拒绝继续。未适配的普通写入不能提交，也不能通过发布检查点绕过门禁。检查点允许携带这些表未变化的共同初始基线。

| 领域               | 需要落实的规则                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| 正文与内容实体     | 正文身份、契约、关系和引用持有同事务提交；正文与白板继续走现有协作协议，不能靠数据库列覆盖替代 |
| 项目与树结构       | 父级身份、移动和删除聚合明确，环与缺失父级按稳定规则恢复，不静默删除子项                       |
| 日历与循环待办     | 系列身份、发生项唯一键、覆盖与例外共同处理，避免把整份排程当普通 JSON 覆盖                     |
| 复习与学习         | 区分追加的复习事实、人工修改与可重算排程；不能简单按最后一行覆盖                               |
| 插件业务           | 自然键、实体、关联与正文持有形成聚合；不理解的插件 JSON 保真，未声明合并行为则保留冲突         |
| AI 会话            | 数据库管理信息与外部 JSONL 正文保持成对事务；运行授权、凭据和本机执行上下文不复制              |
| PDF 视频与网页摘录 | 标注锚点绑定来源版本，来源删除后保全离线标注，并核查实体引用和持有关系                         |
| 本机状态与派生数据 | 本机授权、绑定和路径不按业务行复制；计数、索引和回收队列按事实重建                             |

这些是接入约束，尚未对 70 张门禁表逐项实现业务处理器。归属划分也是本次方案提案，正式落地须与对应领域实现一起确认。`storage-spike` 只表示储存与传输机制有验证，不表示业务已经验收。

## 历史安全回收

### 单一检查点发布者

每个资料库指定一个检查点发布者，本原型默认逻辑设备 `desktop`。所有设备都能编辑；发布者只串行决定检查点及回收边界，不执行自动选主。普通设备不能自行清理权威历史。发布者迁移需要独立的交接协议，本次没有实现。

检查点绑定资料库身份、Schema 指纹、业务规则指纹、原始基线摘要、发布者和单调代次。它包含活动数据、保留行版本、并发分支、删除代次与恢复材料、操作回执、退役来源及内容块。外层保存精确 JSON 字节串与 SHA-256，Rust 不必重新序列化业务数字才能验证整包摘要。

### 活跃设备与退役来源

发布检查点不等于立即回收。所有活跃设备必须持久安装或确认该检查点，并覆盖其来源进度，才能回收。仍活跃但离线的设备会阻止回收，不按离线天数删除它可能需要的数据。

为了继续回收，可显式退役一个来源。退役只关闭旧来源继续提交增量的通道，旧设备回来时必须提交恢复材料并重新建立来源身份。它不是用户数据清除，也不是撤销设备配对凭据。

原型会拒绝普通增量跨过已回收边界，避免假装缺失历史已经同步完成。回执指纹保留，使已提交但未收到确认的操作可以识别，而不再次应用。

### 回收根与原子判据

保留当前主版本、仍并发的行分支及获胜删除，缓存删除明确引用的前值，以便旧日志删除后仍能恢复。内容块的根包括这些版本、恢复材料、共同基线与未解决的保全分支。只有无根内容块才会删除。

回收不仅核对普通日志进度，还核对回执、保全分支和退役来源的摘要。只增加冲突材料时，普通日志进度可能完全不变；若仅比较进度，旧检查点可能误删这些新材料所需的块。本轮已覆盖该反例。

检查点确认、当前进度与控制摘要的复核，以及日志和块删除，都在 `BEGIN IMMEDIATE` 获取写锁后完成。期间有新编辑或控制材料变化，就拒绝使用旧切点回收。

## 长期离线重入

长期离线的模拟不是等待若干秒：验证先实际删除发布者上的旧增量和历史版本，再让旧副本返回。

1. 离线设备导出自含恢复材料，包括原操作身份、原信封指纹、完整前后值、删除恢复关系及校验封印。也导出它代为持有、发布者可能未见过的第三方操作。
2. 材料分批提交。原操作已有耐久回执时按指纹去重；缺页或不连续的来源序号拒绝继续，旧库不被替换。
3. 发布者对照当前状态检查每个原事务。字段未被远端改变时，将本机变化重放到当前行，保留远端对其他字段的修改。删除只有在目标未变化时重放。恢复凭据通过原操作回执映射到新的删除身份。
4. 远端已删除、已进入新一代或同字段发生冲突时，保全整个原事务及其后续依赖链，不拆成半个业务操作，也不让旧编辑复活对象。
5. 原操作回执与重新提交或保全的材料在同一 SQLite 事务提交。恢复过程中断后，设备仍保留完整旧库；从头重发已确认页也不会重复应用。
6. 发布者返回包含这些回执及保全材料的新检查点。旧设备验证所有本机已接纳历史和未上传材料都被覆盖，才允许安装。
7. 安装将业务行、版本、内容块、墓碑、回执、恢复材料与新来源身份放在一个 SQLite 事务中。中断则整个旧副本恢复；成功后用新来源继续编辑，不重用旧操作编号。

自含恢复材料不依赖发布者已删除的旧字节差量基线。它会增加少量离线储存，但避免只能拿着失效补丁回来。暂存材料和未解决分支也进入内容块回收根。

一旦某个原事务不能安全重放，后续依赖它的事务会一并保全。它们不会被静默丢弃，但也不承诺自动变成活动数据；用户或领域处理器仍需裁决。

## Rust 新协议

[原生实现](/scripts/spikes/database-sync/native-peer/src/semantic.rs) 直接使用移动端相同版本的 `rusqlite 0.29.0`。新增 Brotli 与 base64 编解码依赖仅属于独立探针，没有修改移动应用依赖或入口。

Rust 与 Node 共用字段值、压缩快照和带基线摘要的字节差量格式，校验 UTF-8、二进制字节、长度和 SHA-256；内容块边界算法与 Node 一致。两种运行时已验证协议 2、3 的双向普通记录收发。

原生逐条接收目前只开放 `plugin_kv`、`plugin_records`；没有实现的领域明确返回 `UNSUPPORTED_RULE`。这不是完整 Rust 业务引擎。检查点安装直接使用发布者已经投影的数据，同时验证完整契约、块、已接纳历史、未上传材料与恢复分支；仍需在实际 Tauri 宿主接入权限、生命周期与领域处理器。

原生安装先取得 SQLite 即时写锁，再复核旧库的材料保护条件。在写入第一行后直接退出进程的验证中，重新打开仍得到完整旧库和未上传材料；重试安装成功。原生离线操作经发布者重新提交或保全后，可以安装检查点并以新来源继续发送。

## 验证结果

| 情况                                   | 结果                                     |
| -------------------------------------- | ---------------------------------------- |
| 活跃设备长期离线未确认                 | 回收被阻止，原日志不变                   |
| 退役来源返回并直接发送旧增量           | 拒绝普通通道，要求检查点重入             |
| 旧日志已回收，设备携带新增、编辑和删除 | 安全部分重放，冲突事务与依赖链完整保全   |
| 离线删除后恢复，再继续编辑             | 通过回执映射重建新删除身份，保持恢复代次 |
| 服务端提交成功但恢复响应丢失           | 重试不重复应用；本机旧库保留到安装完成   |
| 大量恢复操作分页，中途停止             | 已确认页可重发，其余材料仍在旧副本       |
| 设备代为持有第三方未到发布者的修改     | 一并保全与补齐，不被快照覆盖             |
| 检查点之后新增编辑或只新增保全材料     | 旧检查点不能继续回收                     |
| 回收旧版本和无根块                     | 当前值、并发分支、墓碑及恢复前值仍可读   |
| 保全分支经历再次回收                   | 大字段内容仍可读取                       |
| 检查点缺失本机回执或保全材料           | 拒绝覆盖旧副本                           |
| 损坏摘要、坏块、回退检查点             | 拒绝安装，不覆盖旧数据                   |
| Rust 与 Node 双向大字段差量            | 原字节一致，本机 outbox 可恢复           |
| Rust 安装检查点中途退出                | SQLite 回滚，旧库与未上传操作完整        |
| 未实现业务规则或结构漂移               | 明确门禁，无半份业务数据或确认进度       |

一次可复现探针中，回收前为 42 个日志事务、42 个行版本、约 493 KB 压缩块；回收后日志为 0，保留 2 个行版本和约 12 KB 压缩块，同时保留 42 份操作指纹。旧设备随后安全补齐一条新增，并保全一条与远端删除冲突的修改；活动数据最终相同，删除对象没有复活。

这些是逻辑记录与表内载荷，不是 SQLite 物理文件压缩结果。随机数据会影响分块数量和字节数。薄回执、墓碑和未解决分支仍会增长，本轮没有为了容量上限而删除它们。

## 使用与安全边界

运行命令、模块职责与原生子命令见[实验说明](/scripts/spikes/database-sync/README.md)。全部数据使用临时目录，没有操作用户资料库，没有接入软件启动流程。

本轮验证仅使用回环 HTTP。配对密钥、签名授权、真实局域网发现和移动后台行为尚未接入；当前发布者身份及设备确认由探针对象提供，不能作为暴露到局域网的鉴权实现。

恢复默认每页最多 128 个操作和 256 KiB，可配置到请求上限 16 MiB。单条材料超过预算时明确拒绝，旧库与 outbox 保持不变；大库正式落地应复用现有分块文件通道。检查点当前上限 64 MiB，不声称支持任意体量或内存峰值。

首个正式业务版本仍须完成领域规则与实际宿主接入。此次证明的核心安全边界是：旧增量和部分历史已经回收后，预算内的旧设备数据仍有可验证、可重试且不静默覆盖的回归路径。

如果离线期间跨越了数据格式或规则升级，须先保全原库与恢复材料，再通过版本适配器转换操作意图，保留原操作身份与回执映射。本轮验证了不兼容时的拒绝与保全，没有实现跨版本迁移，不能承诺旧版本设备无需升级即可自动补齐。

## 全表契约审计快照

以下清单由当前真实 Schema 与显式契约生成。机器输出还包含完整字段、唯一索引、部分索引和外键；`node scripts/spikes/database-sync/contracts.mjs` 可重新审计。存储探针不代表正式业务就绪，门禁表不启用默认覆盖。

| 表                                   | 领域       | 归属   | 适配状态         | 主键或唯一身份                                               | 唯一索引数 | 外键数 |
| ------------------------------------ | ---------- | ------ | ---------------- | ------------------------------------------------------------ | ---------- | ------ |
| articles                             | content    | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| calendar                             | calendar   | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| calendar_event                       | calendar   | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| calendar_group                       | calendar   | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| cards                                | content    | 拟复制 | content-storage  | id                                                           | 0          | 0      |
| chat_group                           | chat       | 拟复制 | 门禁             | id                                                           | 0          | 1      |
| chat_session                         | chat       | 拟复制 | 门禁             | id                                                           | 1          | 0      |
| collaboration_bindings               | device     | 本机   | 门禁             | content_id                                                   | 0          | 1      |
| compose_boards                       | content    | 拟复制 | 门禁             | content_id                                                   | 1          | 0      |
| content_ai_insights                  | content    | 拟复制 | 门禁             | content_id                                                   | 0          | 0      |
| content_ai_meta                      | content    | 拟复制 | 门禁             | content_id                                                   | 0          | 0      |
| content_documents                    | content    | 拟复制 | content-storage  | content_id                                                   | 1          | 1      |
| content_entity_relations             | content    | 拟复制 | 门禁             | document_id + node_id + slot                                 | 1          | 1      |
| content_links                        | content    | 拟复制 | content-storage  | content_id + target_content_id                               | 1          | 0      |
| content_pending_releases             | content    | 拟重建 | 门禁             | content_id                                                   | 0          | 0      |
| contents                             | content    | 拟复制 | content-storage  | id                                                           | 0          | 0      |
| daily_notes                          | content    | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| data_table_pending_releases          | content    | 拟重建 | 门禁             | table_id                                                     | 0          | 0      |
| data_table_views                     | content    | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| data_tables                          | content    | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| database_item                        | content    | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| diary_entries                        | diary      | 拟复制 | 门禁             | id                                                           | 1          | 1      |
| diary_segments                       | diary      | 拟复制 | 门禁             | id                                                           | 0          | 2      |
| diary_tag_settings                   | diary      | 拟复制 | 门禁             | name                                                         | 1          | 0      |
| doc_task_calendar_link               | task       | 拟复制 | 门禁             | calendar_event_id                                            | 0          | 0      |
| doc_task_group_names                 | task       | 拟复制 | 门禁             | group_id + group_created_at + title                          | 1          | 0      |
| doc_task_settings                    | task       | 拟复制 | 门禁             | id                                                           | 1          | 0      |
| entity_identities                    | content    | 拟复制 | identity-storage | entity_kind + entity_id                                      | 2          | 0      |
| entity_lineage                       | content    | 拟复制 | 门禁             | id                                                           | 1          | 0      |
| excerpt                              | excerpt    | 拟复制 | 门禁             | id                                                           | 1          | 0      |
| excerpt_provider                     | excerpt    | 拟复制 | 门禁             | source_type                                                  | 1          | 0      |
| flashcard_decks                      | learning   | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| flashcard_references                 | learning   | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| flashcard_reviews                    | learning   | 拟复制 | 门禁             | id                                                           | 0          | 2      |
| flashcards                           | learning   | 拟复制 | 门禁             | id                                                           | 0          | 1      |
| home_panel_layout                    | device     | 本机   | 门禁             | panel_id                                                     | 1          | 0      |
| knowledge_ai_insights                | learning   | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| library_identity                     | device     | 组控制 | 门禁             | id                                                           | 1          | 0      |
| migration_meta                       | device     | 本机   | 门禁             | key                                                          | 1          | 0      |
| operation                            | device     | 拟重建 | 门禁             | id                                                           | 0          | 0      |
| operation_daily_counts               | device     | 拟重建 | 门禁             | date                                                         | 1          | 0      |
| pdf_annotations                      | pdf        | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| pdf_bookmarks                        | pdf        | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| pdfs                                 | pdf        | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| plugin_element_resources             | plugin     | 拟复制 | 门禁             | plugin_id + type                                             | 1          | 0      |
| plugin_entities                      | plugin     | 拟复制 | entity-unique    | id                                                           | 1          | 0      |
| plugin_entity_kinds                  | plugin     | 拟复制 | 门禁             | plugin_id + kind                                             | 1          | 0      |
| plugin_kv                            | plugin     | 拟复制 | opaque-record    | plugin_id + key                                              | 1          | 0      |
| plugin_links                         | plugin     | 拟复制 | entity-unique    | id                                                           | 2          | 0      |
| plugin_operations                    | plugin     | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| plugin_records                       | plugin     | 拟复制 | opaque-record    | id                                                           | 1          | 0      |
| plugin_ref_grants                    | device     | 本机   | 门禁             | plugin_id + kind + ref_id                                    | 1          | 0      |
| podcasts                             | content    | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| pomodoro_calendar_mapping            | calendar   | 拟复制 | 门禁             | id                                                           | 1          | 0      |
| pomodoro_presets                     | calendar   | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| pomodoro_sessions                    | calendar   | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| project                              | project    | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| project_item                         | project    | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| publish_history                      | device     | 本机   | 门禁             | id                                                           | 1          | 0      |
| publish_selections                   | device     | 本机   | 门禁             | id                                                           | 1          | 0      |
| resource_sync_blacklist              | device     | 本机   | 门禁             | id                                                           | 1          | 0      |
| schema_meta                          | device     | 本机   | 门禁             | key                                                          | 1          | 0      |
| statistic                            | device     | 拟重建 | 门禁             | id                                                           | 0          | 0      |
| task_assistant_content_pin           | task       | 拟复制 | 门禁             | operation_id + content_id                                    | 1          | 0      |
| task_assistant_operation             | task       | 拟复制 | 门禁             | id                                                           | 2          | 0      |
| todo_calendar_mapping                | calendar   | 拟复制 | 门禁             | id                                                           | 1          | 0      |
| todo_group                           | task       | 拟复制 | task-parent      | id                                                           | 0          | 0      |
| todo_item                            | task       | 拟复制 | task-parent      | id                                                           | 0          | 0      |
| todo_note_link                       | task       | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| todo_occurrence_override             | task       | 拟复制 | 门禁             | todo_item_id + todo_created_at + series_id + occurrence_date | 1          | 0      |
| todo_recurrence                      | task       | 拟复制 | 门禁             | id                                                           | 1          | 0      |
| todo_recurrence_completion           | task       | 拟复制 | 门禁             | id                                                           | 1          | 0      |
| todo_recurrence_history              | task       | 拟复制 | 门禁             | series_id                                                    | 2          | 0      |
| todo_schedule_occurrence             | task       | 拟复制 | 门禁             | calendar_event_id                                            | 0          | 0      |
| transcriptions                       | content    | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| vibe_learning_project                | learning   | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| vibe_learning_resources              | learning   | 拟复制 | 门禁             | id                                                           | 0          | 1      |
| video_note_item                      | pdf        | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| video_notes                          | pdf        | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| vl_note                              | learning   | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| vl_quiz_item                         | learning   | 拟复制 | 门禁             | id                                                           | 0          | 1      |
| vl_quiz_record                       | learning   | 拟复制 | 门禁             | id                                                           | 0          | 1      |
| vl_quiz_set                          | learning   | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| walk_daily_decks                     | learning   | 拟复制 | 门禁             | date                                                         | 1          | 0      |
| walk_visits                          | learning   | 拟复制 | 门禁             | kind + entity_id                                             | 1          | 0      |
| web_clip                             | excerpt    | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| web_link                             | excerpt    | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| web_note                             | excerpt    | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| web_page                             | excerpt    | 拟复制 | 门禁             | url                                                          | 1          | 0      |
| web_view_preference                  | excerpt    | 拟复制 | 门禁             | project_item_id                                              | 0          | 0      |
| weread_config                        | reader     | 本机   | 门禁             | key                                                          | 1          | 0      |
| weread_notebook                      | reader     | 拟复制 | 门禁             | book_id                                                      | 1          | 0      |
| white_board_content_pending_releases | whiteboard | 拟重建 | 门禁             | content_id                                                   | 0          | 0      |
| white_board_contents                 | whiteboard | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| white_boards                         | whiteboard | 拟复制 | 门禁             | id                                                           | 0          | 0      |
| whiteboard_document_pages            | whiteboard | 拟复制 | 门禁             | document_id + page_id                                        | 2          | 2      |
| whiteboard_documents                 | whiteboard | 拟复制 | binary-storage   | document_id                                                  | 2          | 1      |
| whiteboard_entity_relations          | whiteboard | 拟复制 | 门禁             | document_id + root_id + node_id + slot                       | 1          | 1      |

契约指纹：`f5cc02e747084478e4eae56234eb4c2467c33fdc0584b854acc5a5ce182155f0`。

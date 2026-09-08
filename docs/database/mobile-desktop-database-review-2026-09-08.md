# Mobile 与 Desktop 数据库兼容性现状报告

审查日期：2026-09-08。审查对象：当前工作区源码，记录时 HEAD 为 `307f9bbe`。
本次只新增报告，没有修改业务代码、SQL 或用户数据库；工作区原有未提交改动保留。

## 结论

你的判断基本准确：**两端共享建库 SQL，但 mobile 缺少 desktop 的主库历史升级能力，而且部分业务读写模型已经落后。**

最突出的问题是日记：desktop 已使用多段内容，mobile 仍使用旧的单内容字段。即使数据库已经由 desktop 升级完毕，mobile 仍会读出空正文；因此不能只补数据库 upgrade 就认为完成兼容。

“不需要 mobile 升级”只在发布策略严格保证它仅打开新建库或已由 desktop 完成迁移的库时成立。当前代码没有强制落实这一前提；并且这个前提也不能解决日记业务模型不兼容。

## 主要发现

### 1. [P1] 日记读写仍采用旧模型，最新 desktop 数据也不能正确使用

- Desktop 的 `DiaryTable.upgradeTable` 迁移旧日记、转换多段内容、补 tags；迁移后清空 `diary_entries.content_id`，正文由 `diary_segments.content_id` 关联。
- Mobile 查询仍通过 `diary_entries.content_id` 连接 `contents`，完全没有读取 `diary_segments`，返回类型也没有 segments/tags。
- Mobile 保存时仍更新旧 `content_id` 和整篇 `word_count`，不会同步已有 segments。删除也只处理旧 content_id，没有实现多段内容的引用计数清理。
- 影响：桌面日记在手机显示为空；手机保存后，两端读取不同的内容关联，字数汇总也可能不一致。桌面下一次维护迁移可能把手机新内容追加为新段，但这不等于正确编辑原有段。
- 内存数据库复现：同一日记的 desktop segment 有正文，mobile JOIN 结果为 `content = NULL`；模拟 mobile 保存后，mobile 指向 content 2，desktop segment 仍指向 content 1，entry 字数为 5 而原 segment 字数为 10。
- 建议：先统一日记查询、保存、删除及标签契约，再处理旧数据迁移。修复前不宜把 mobile 日记视为可正常双向编辑的功能。

证据：[mobile 查询](D:/coding/editor/apps/mobile/src-tauri/src/database/diary.rs:266)、[mobile 保存](D:/coding/editor/apps/mobile/src-tauri/src/database/diary.rs:398)、[mobile 删除](D:/coding/editor/apps/mobile/src-tauri/src/database/diary.rs:443)、[desktop 迁移](D:/coding/editor/apps/desktop/src-electron/main/modules/tables/diary.ts:112)、[清空旧字段](D:/coding/editor/apps/desktop/src-electron/main/modules/tables/diary.ts:415)。

### 2. [P1] Mobile 的主库 migrator 不会迁移已存在表的字段与数据

`ensure_main_schema` 只执行共享 `main.sql`，随后写入元信息。没有主库 `ALTER TABLE`、旧表重建或对应业务数据回填。`CREATE TABLE IF NOT EXISTS` 遇到已有表会跳过，不会把当前列定义应用到旧表。

使用 2026-02-22 提交 `9f072e4e` 的真实历史 `main.sql` 建立空库，再执行当前完整 `main.sql`：**执行成功，但 7 张表仍缺少 15 个字段**。

| 表                        | 重跑最新 SQL 后仍缺少的列                                                 |
| ------------------------- | ------------------------------------------------------------------------- |
| `document_items`          | `ref_type`、`ref_id`                                                      |
| `diary_entries`           | `tags`                                                                    |
| `video_notes`             | `highlights`、`insights`                                                  |
| `chat_message`            | `message_schema_version`、`title_dirty`、`agent_type`、`agent_session_id` |
| `weread_notebook`         | `bookmark_count`、`archive_name`                                          |
| `vibe_learning_resources` | `sort_index`                                                              |
| `vibe_learning_chats`     | `message_schema_version`、`agent_type`、`agent_session_id`                |

这些缺列不意味着手机每个现有页面都会立即报错，因为部分表目前没有 mobile 业务入口；但说明该库并未达到共享基线，不能作为已完成升级的数据库来判断兼容性。

Desktop 还有无法由建表语句替代的数据迁移，例如 document_items 引用字段回填、日记转 segments、旧视频 notes 转 video_note_item，以及聊天消息读取时的格式转换。不能简单地对所有缺列套用新库默认值：旧聊天的 `message_schema_version` 在 desktop 升级时先设为 1，而新库默认是 3。

证据：[mobile migrator](D:/coding/editor/apps/mobile/src-tauri/src/database/migrator.rs:139)、[desktop upgrade 调度](D:/coding/editor/apps/desktop/src-electron/main/modules/database.ts:323)、[文档引用回填](D:/coding/editor/apps/desktop/src-electron/main/modules/tables/document.ts:89)、[聊天升级](D:/coding/editor/apps/desktop/src-electron/main/modules/tables/chat-message.ts:50)、[视频迁移](D:/coding/editor/apps/desktop/src-electron/main/modules/tables/video-note.ts:26)。

### 3. [P1，相关同步风险] Mobile 仍先发布远端版本，再上传数据库

Mobile 上传顺序为：远端 version -> 数据库文件 -> 本地 version；数据库失败时尝试回滚远端 version。Desktop 当前顺序是：数据库文件 -> 远端 version -> 本地 version。

在 mobile 已发布新版本、数据库尚未上传完成的窗口内，其他客户端可能取得“新版本号 + 旧数据库”。如果 mobile 上传失败且回滚失败，这种不一致会持续存在；即使上传最终成功，已经下载旧文件并记录新版本的客户端也可能漏掉更新。

这是沿同步入口发现的实际实现差异，不是 SQL 结构遗漏。两端目前都在远端上传完成后才更新本地版本，因此问题不是 mobile 提前增加本地版本。

建议：至少统一为先上传数据库、再发布版本；若需要支持并发同步，再设计不可变快照与版本指针。

证据：[mobile 上传](D:/coding/editor/apps/mobile/src-tauri/src/sync/db_commands.rs:126)、[desktop 上传](D:/coding/editor/apps/desktop/src/commands/sync.ts:148)。本项为静态调用链审查，未连接远端执行并发故障测试。

### 4. [P2] Schema 版本/hash 会掩盖实际缺列，现有校验不覆盖迁移

Mobile 的 `MAIN_SCHEMA_VERSION` 固定为 1；每次建表语句执行成功后，就把当前 SQL 文本的 hash 写入 schema_meta。它没有验证实际列、约束、索引定义或业务迁移完成状态。

复现中，2 月旧库写入了当前 SQL hash 和版本 1，但执行 `SELECT tags FROM diary_entries` 仍得到 `no such column: tags`。因此 `get_database_schema_status` 的 hash 只能说明曾执行哪份建表文本，不能证明实际结构一致。

`db:schema:check` 主要检查 SQL 中的表/索引数量与索引库模板；它不执行两端升级流程，不比较旧库迁移结果。此次检查通过与缺列问题同时成立。

建议：使用真正的迁移版本/完成记录，并增加“历史库 -> 当前迁移 -> 实际 PRAGMA 结构和数据断言”的回归验证。

证据：[版本常量](D:/coding/editor/apps/mobile/src-tauri/src/database/migrator.rs:9)、[写入 hash](D:/coding/editor/apps/mobile/src-tauri/src/database/migrator.rs:155)、[状态接口](D:/coding/editor/apps/mobile/src-tauri/src/database/mod.rs:127)、[当前校验](D:/coding/editor/scripts/db/check-schema-parity.mjs:70)。

### 5. [P2] Mobile 下载成功不代表数据库已经通过可用性检查

Mobile 下载后替换本地文件、更新本地版本，随后异步触发 reconcile 并返回成功。真正的打开/建库发生在后台，失败只写日志；没有在发布下载成功前验证 SQLite 文件、迁移结果和最低兼容条件。

当下载的文件损坏或结构无法被当前客户端使用时，会出现“同步成功，进入页面才报数据库错误”。这也使“所有下载库都已经由 desktop 升级好”的假设缺少程序保障。

建议：在临时数据库上完成打开、迁移及必要结构检查后，再替换正式库和提交本地同步版本。

证据：[下载完成流程](D:/coding/editor/apps/mobile/src-tauri/src/sync/db_commands.rs:299)、[后台错误处理](D:/coding/editor/apps/mobile/src-tauri/src/database/reconcile.rs:292)。本项为静态审查，未实际替换用户数据库。

## 哪些部分仍然一致

| 范围            | 当前状态                                                                            |
| --------------- | ----------------------------------------------------------------------------------- |
| 主库 SQL 来源   | 两端都引用 `packages/db-schema/schema/main.sql`                                     |
| 索引库 SQL 来源 | 两端都引用 `index.sql` 与动态 vec 模板                                              |
| 新库结构基线    | 当前 SQL 可建立 79 张主库表、127 个显式索引；mobile 额外维护 schema_meta            |
| 构建前处理      | Mobile 的常规 dev/build 与 Android 构建入口已有 schema prepare                      |
| 新增表          | 最新客户端重跑 SQL 可以创建缺失表；不能自动转移旧表数据                             |
| 待办系统组      | Mobile 已有自己的 `ensure_system_groups`，不是所有 desktop 初始化都遗漏             |
| 索引库迁移      | Mobile 已有旧索引拆库、维度检查和重建状态流程；当前 reconcile 主要重建卡片全文索引  |
| 编辑器内容      | Mobile 近期仍有共享编辑器适配，例如 tabs 转 panes；不能概括为整个 mobile 完全没更新 |

历史记录显示：mobile 数据库 migrator 最后更新为 2026-02-13（`1a5e853e`），database 目录最后一次提交为 2026-02-22（`9f072e4e`）；9 月的 mobile 提交主要涉及编辑器等其他部分。提交日期只能反映仓库历史，不代表手机当前安装包版本。

旧安装包的 SQL 在 Rust 编译时嵌入。仓库更新 SQL 后，已经安装的旧 APK 不会自动得到这份新建库基线，必须重新构建和安装。

## 不同使用场景的判断

| 场景                              | 是否需要 mobile 主库迁移   | 仍需处理的事项                                          |
| --------------------------------- | -------------------------- | ------------------------------------------------------- |
| 用当前源码构建后新建库            | 不需要历史结构迁移         | 日记读写契约、业务初始化仍需正确                        |
| 从最新 desktop 下载已完整迁移的库 | 通常不需要重复结构迁移     | 日记多段模型、兼容检查仍不可省略                        |
| 更新 mobile 后继续使用 2 月本地库 | 需要                       | 实测存在 15 个缺列及未执行的数据迁移                    |
| 下载旧 desktop/旧 mobile 上传的库 | 需要，或明确拒绝不支持版本 | 当前同步 version 只是文件更新序号，不能代表 schema 版本 |
| 一直使用旧 APK                    | 不会获得当前共享基线       | 需核对真实安装版本；不能凭当前仓库保证兼容              |

另一组历史复现：6 月 `98de2f61` 的库重跑当前 SQL 后，4 张聊天表仍缺 agent_type/agent_session_id；7 月 `092cadeb` 的库在本次“列名比较”中没有缺列，但仍保留 notion_sync 和 6 张 badge 表。旧表保留本身不等于数据损坏，也不能据此判定整个结构和业务已一致。

## 验证与边界

- `pnpm db:schema:check`：通过，79 张主库表、127 个显式索引、3 个索引库核心表。
- `node --experimental-sqlite scripts/db/validate-schema-sql.mjs`：主库通过；运行环境没有 FTS5，索引库按脚本的降级路径跳过 FTS5 虚表校验，其余通过。
- 在内存中按 build 脚本规则拼接主库分片，与当前 main.sql 比较：一致。没有运行会覆盖 bundle 的 build 命令。
- 使用 Node SQLite 内存数据库验证 4 个真实历史提交的建库 SQL，并重跑当前 SQL；完成上述缺列和日记读写分歧复现。
- 元信息复现使用与 mobile 相同的建表、设置 version/hash 顺序；未运行完整 Rust/Tauri 客户端。
- 未访问手机实际数据库、已安装 APK 或远端对象存储；没有进行 Android/iOS 构建、真实双端同步或完整业务回归。
- 没有据此宣称卡片、待办等所有业务完全兼容；本次重点覆盖建库、主库迁移、日记契约和数据库同步入口。

## 建议处理顺序

1. 先修复日记多段读写，并统一 mobile 的同步上传顺序，避免继续产生跨端不一致。
2. 明确支持哪些历史库。推荐支持现有 mobile 本地库，并补独立、幂等、有事务和备份的主库迁移；只允许 desktop 迁移也可以，但必须在程序中检测并阻止不兼容旧库。
3. 补真实迁移版本与下载前校验，避免“执行过 SQL”或“下载成功”被误认为“数据可用”。
4. 增加两端迁移到同一目标结构的回归测试，并用日记等已有业务验证数据语义。不能只比表数量，也不能只验证新建库。

无需机械搬运 desktop 所有 upgradeTable：纯桌面业务初始化、缓存维护和已废弃表清理可以分开评估；必须优先覆盖共享持久化结构，以及 mobile 实际读写的数据模型。

# 数据库 Schema 与建库流程

## 1. 维护入口

- 主库分片：`packages/db-schema/schema/main/*.sql`。
- 主库基线：`packages/db-schema/schema/main-version.json`，两端共用。
- 索引库分片：`packages/db-schema/schema/index/*.sql`。
- 汇总产物：`schema/main.sql`、`schema/index.sql`，只通过脚本生成。
- 新增分片须登记 `scripts/db/build-schema-bundles.mjs`，表和索引检查在 `scripts/db/check-schema-parity.mjs`。

## 2. 生成与校验

```bash
pnpm db:schema:build
pnpm db:schema:check
pnpm db:schema:prepare
```

`prepare` 包含汇总、数量与结构断言、SQLite 语法校验。桌面和移动开发、构建前的 pre 脚本继续运行它。字段与既有索引定义变化按 [数据库变更手册](./db-change-manual.md) 调整共享基线。

## 3. 桌面建库

入口：`apps/desktop/src-electron/main/modules/database.ts` → `main-schema.ts`。

1. 打开数据库，先核对现有主库的版本标记。
2. 只有空库或当前版本可继续，开启 WAL 和外键。
3. 当前 SQL 指纹不一致时，在同一事务执行共享 SQL 并写入版本、指纹；失败整体回滚。
4. maintenance 模式继续维护系统分组、日记标签、日历、统计与数据回收。

判据：当前版本重开不重复初始化；旧库报 `DB_SCHEMA_INCOMPATIBLE` 且不转换数据。完整协议见 [数据基线门禁](/docs/architecture/desktop.md#数据基线门禁)。

## 4. 移动建库

入口：`apps/mobile/src-tauri/src/database/schema.rs` → `migrator::ensure_main_schema`。

1. 打开或创建目标文件，核对非空库的共享基线版本。
2. 按指纹决定是否执行共享 SQL，在同一事务补齐结构、日记标签及版本记录。
3. `index_db::ensure_index_database` 初始化独立索引库。
4. 通过 `get_database_schema_status` 查询实际版本、指纹和表数量。

不执行主库历史升级、旧表删除或升级前备份。不要在外部仅执行 SQL bundle 后就把文件当作已初始化资料库；两端正式建库入口还负责同事务写入版本记录。

## 5. 索引库与向量重建

- 桌面：`modules/main-content-index-db.ts` 消费 `index.sql`，按 embedding 维度创建向量表。
- 移动：`database/index_db.rs` 解析维度与模型指纹，`migrator::ensure_index_schema` 初始化索引表。
- `index/20_vec_template.sql` 的 `__VEC_DIMENSION__` 由运行时替换；模型指纹或维度变化后，确认 `rebuild_state` 进入 pending 并由 reconcile 重建。
- 修改索引口径后运行涉及的全文、向量与跨端测试，不删除正常的派生数据重建机制。

## 6. 打包检查

- 桌面通过 Vite 的 `?raw` 将 SQL 编入主进程。
- 移动通过 Rust `include_str!` 编入 SQL 和共享版本文件。
- 构建前运行 `db:schema:prepare`，再执行两端类型检查、行为测试与构建；无需在安装目录另行拷贝 SQL。

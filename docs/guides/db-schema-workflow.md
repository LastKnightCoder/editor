# 数据库 Schema 与建库流程

## 1. 目标与范围

本文档描述当前项目数据库的统一基线与建库流程，覆盖：

- 主库/索引库 Schema 的维护与生成方式
- 桌面端与移动端的建库执行路径
- 向量索引表 `vec_documents` 的动态创建与重建机制
- 打包阶段 SQL 的可用性与加载方式

## 2. 当前目录与单一真相来源

数据库 Schema 统一维护在：

- `packages/db-schema/schema/main/*.sql`（主库分片）
- `packages/db-schema/schema/index/*.sql`（索引库分片）

汇总产物：

- `packages/db-schema/schema/main.sql`
- `packages/db-schema/schema/index.sql`

生成脚本：

- `scripts/db/build-schema-bundles.mjs`

校验脚本：

- `scripts/db/check-schema-parity.mjs`

约束说明：

- 日常只改分片文件（`main/*.sql`、`index/*.sql`）
- `main.sql/index.sql` 通过脚本生成，不手改
- `vec_documents` 不进 `index.sql`，由模板 `index/20_vec_template.sql` 在运行时按维度创建

## 3. 本地命令与自动触发

根脚本：

- `pnpm db:schema:build`：从分片生成 `main.sql/index.sql`
- `pnpm db:schema:check`：校验主库表/索引数量、索引库核心表、vec 模板占位符
- `pnpm db:schema:prepare`：`build + check + node:sqlite 语法检查`（`node --experimental-sqlite scripts/db/validate-schema-sql.mjs`）

已接入自动触发：

- `apps/desktop/package.json`：`predev`、`prebuild` 会执行 `pnpm -w db:schema:prepare`
- `apps/mobile/package.json`：`predev`、`prebuild`、`prebuild:android:*`、`predev:android` 会执行同一流程

结论：你在本机执行桌面/移动端开发或构建前，都会先生成并校验最新 SQL。

## 4. 桌面端建库流程

主库入口：`apps/desktop/src-electron/main/modules/database.ts`

关键流程：

1. `openDatabase()` 打开 `*.db`
2. 执行 `database.exec(MAIN_SCHEMA_SQL)`（来源：`@tau/db-schema/schema/main.sql?raw`）
3. 在 `maintenance` 模式下执行各模块 `upgradeTable`（兼容历史库增量修复）
4. 执行清理逻辑（如 `DROP TABLE IF EXISTS shortcuts`、`VACUUM`）

索引库入口：`apps/desktop/src-electron/main/modules/main-content-index-db.ts`

关键流程：

1. 执行 `INDEX_SCHEMA_SQL`（`@tau/db-schema/schema/index.sql?raw`）
2. 根据 setting 解析 embedding 维度
3. 用 `INDEX_VEC_TEMPLATE_SQL` 替换 `__VEC_DIMENSION__` 动态建 `vec_documents`
4. 维度变化时重建 vec 表并将 `index_meta.rebuild_state` 置为 `pending`

## 5. 移动端建库流程

主入口：`apps/mobile/src-tauri/src/database/schema.rs`

关键流程：

1. `ensure_database_file()` 打开/创建主库文件
2. 必要时先备份：`*.pre-schema-v1.bak`
3. `migrator::ensure_main_schema()` 执行 `main.sql`
4. `index_db::ensure_index_database()` 初始化索引库并处理迁移

Schema 载入方式（编译期内嵌）：

- `apps/mobile/src-tauri/src/database/migrator.rs` 使用 `include_str!` 引入
  - `packages/db-schema/schema/main.sql`
  - `packages/db-schema/schema/index.sql`
  - `packages/db-schema/schema/index/20_vec_template.sql`

结论：移动端不依赖运行时读取外部 `.sql` 文件，打包后二进制内已包含 SQL 文本。

## 6. 向量维度、指纹与自动重建

移动端实现：

- `apps/mobile/src-tauri/src/database/index_db.rs`：
  - 从 setting 解析 embedding 配置
  - 生成 `main_content_embedding_fingerprint`
  - 写入 `vec_index_meta`
  - 若指纹变化或维度变化，设置 `index_meta.rebuild_state = pending`

- `apps/mobile/src-tauri/src/setting.rs`：
  - `write_setting_json` 对比旧/新指纹
  - 变化时调用 `trigger_reconcile_for_database`

- `apps/mobile/src-tauri/src/database/reconcile.rs`：
  - 异步重建索引流程：`pending -> building -> ready/failed`
  - 有并发保护，避免同一数据库重复并行重建

## 7. 打包与路径说明

- 桌面端：通过 `@tau/db-schema/...?.raw` 由 Vite 打包进主进程 bundle
- 移动端：通过 Rust `include_str!` 编译进可执行文件

因此不需要额外拷贝 SQL 文件到安装目录；前提是构建前执行 `db:schema:prepare` 保证汇总 SQL 最新。

## 8. 快速自检

每次改动 Schema 后，至少执行：

```bash
pnpm db:schema:prepare
pnpm --filter desktop exec tsc --noEmit
pnpm --filter mobile check:rust
```

可选运行时核验：

- 移动端可通过 `get_database_schema_status` 核对版本、hash、表数量（桌面端未注册该命令）

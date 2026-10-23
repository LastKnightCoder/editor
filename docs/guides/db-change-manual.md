# 数据库变更开发手册

## 1. 先判断变更类型

在动手前先选类型，不同类型执行路径不同：

1. 新增表（`CREATE TABLE`）
2. 新增列（`ALTER TABLE ... ADD COLUMN`）
3. 新增/调整索引（`CREATE INDEX`）
4. 破坏性变更（删列、改列类型、改主键）
5. 索引库变更（`content_fts`/`vec_documents`/meta）

## 2. 通用工作流（必须）

1. 只修改分片 SQL

- 主库：`packages/db-schema/schema/main/*.sql`
- 索引库：`packages/db-schema/schema/index/*.sql`

2. 生成汇总 SQL

```bash
pnpm db:schema:build
```

3. 执行完整校验

```bash
pnpm db:schema:prepare
```

4. 编译回归

```bash
pnpm --filter desktop exec tsc --noEmit
pnpm --filter mobile check:rust
```

## 3. 新增表：推荐步骤

### 3.1 修改 Schema 分片

1. 按业务域放入对应主库分片：

- 核心内容：`main/10_core.sql`
- 内容组织：`main/20_content.sql`
- 项目：`main/30_project.sql`
- 资源：`main/40_resource.sql`
- 学习任务：`main/50_learning.sql`

2. 在 `main/90_indexes.sql` 增加必要索引

3. 如果是索引库新表，改 `index/10_fts.sql` 或 `index/30_meta.sql`（`vec_documents` 例外）

### 3.2 应用层接入

1. 桌面端若需要 IPC 能力：

- 新建或扩展 `apps/desktop/src-electron/main/modules/tables/*.ts`
- 在 `apps/desktop/src-electron/main/modules/database.ts` 注册 `getListenEvents`

2. 移动端若需要读写能力：

- 在 `apps/mobile/src-tauri/src/database/*.rs` 增加查询/写入逻辑

### 3.3 兼容性说明

- 新表使用 `CREATE TABLE IF NOT EXISTS`，旧库会自动补齐该表，一般不需要额外迁移代码。

## 4. 新增列：推荐步骤

## 4.1 基线 Schema

1. 在对应 `main/*.sql` 的表定义中加入新列
2. 如需查询性能，补 `main/90_indexes.sql`

## 4.2 数据基线门禁（清洁版，D-091 追记）

历史升级链已物理删除，`Table` 接口不再有 `upgradeTable`。桌面开库、下载校验与 CLI 按共享旧表黑名单（`packages/db-schema/src/legacy-tables.json`）拒绝未完成升级的旧库（`DB_LEGACY_SCHEMA`）；已就位库的同版本 schema 演进由 bundle 的 `CREATE TABLE IF NOT EXISTS` 补建新表。**新增列**必须编写显式迁移代码（不再有探列兜底入口），并同步提升移动端 schema 版本。

## 4.3 移动端 schema 演进

移动端以 `MAIN_SCHEMA_VERSION`（当前 4）为数据基线：高于基线拒绝降级，低于基线且非空库拒绝打开。变更方式：

1. 修改 schema 分片后递增 `migrator.rs` 的 `MAIN_SCHEMA_VERSION`，并在 `ensure_main_schema` 中编写显式迁移（新增列用 `ALTER TABLE ... ADD COLUMN`，破坏性变更按第 5 节流程）；
2. 同版本号内的纯加表/加索引可只依赖 hash 变化自动补建，无需迁移代码。

## 5. 破坏性变更（删列/改类型）处理

不要直接改线上已存在列定义，按 SQLite 安全迁移流程做：

1. `CREATE TABLE new_xxx (...)`
2. `INSERT INTO new_xxx(...) SELECT ... FROM old_xxx`
3. `DROP TABLE old_xxx`
4. `ALTER TABLE new_xxx RENAME TO old_xxx`
5. 重建索引

建议：

- 桌面端将该逻辑写入显式迁移入口（版本化，随变更提交），不再有 `upgradeTable` 探测框架
- 移动端在 `migrator.rs` 递增版本并增加对应迁移，两个端必须在同一版本内完成

## 6. 索引库专项（FTS / Vec）

## 6.1 `content_fts` 结构变更

除了改 `index/10_fts.sql`，还要同步检查：

- 桌面：`apps/desktop/src-electron/main/modules/main-content-index-db.ts` 的重建逻辑
- 移动：`apps/mobile/src-tauri/src/database/migrator.rs` 的 `ensure_index_schema`（`INDEX_SCHEMA_VERSION`）与 `index_db.rs` 的 `rebuild_state` 标记

## 6.2 `vec_documents` 结构/维度变更

- 固定定义放在模板：`packages/db-schema/schema/index/20_vec_template.sql`
- 不写入 `index.sql`
- 运行时按 embedding 维度动态建表
- 维度或 embedding 指纹变化时要把 `rebuild_state` 置 `pending`，让重建流程接管

## 7. 验收清单（发布前）

1. `pnpm db:schema:prepare` 通过
2. 桌面新建数据库可正常写读核心业务数据
3. 桌面连接旧数据库时 `upgradeTable` 无报错
4. 移动端新建数据库成功，索引重建状态可达 `ready`
5. 修改 embedding 配置后，移动端能自动触发 `pending -> building -> ready/failed`

## 8. 常见坑位

1. 只改了 `main.sql/index.sql`，没改分片：下次 `db:schema:build` 会被覆盖
2. 新增列只改了 Schema，忘了桌面 `upgradeTable`：旧库会缺列
3. 改了 FTS 字段，忘了同步复制逻辑：迁移时会丢字段或报错
4. 改了 vec 模板但没处理重建状态：检索可能长期不可用

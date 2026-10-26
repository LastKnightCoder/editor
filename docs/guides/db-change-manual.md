# 数据库变更开发手册

## 1. 确定变更与基线

1. 查看 `packages/db-schema/schema/main-version.json` 和目标表分片。
2. 只新增表或索引时，可保持当前主库版本；新对象必须使用 `IF NOT EXISTS`。
3. 修改既有字段、主键、约束、索引定义或删除对象时，修改当前 SQL 并提升共享主库版本。
4. 发布前不编写历史库转换链；使用新建的测试库验证。不要改写已有库的版本号来绕过门禁，也不要删除真实开发库。
5. 开库协议与保留边界见 [桌面架构的数据基线门禁](/docs/architecture/desktop.md#数据基线门禁)。

## 2. 修改唯一 SQL 来源

1. 主库改 `packages/db-schema/schema/main/*.sql`，索引库改 `schema/index/*.sql`。
2. 新增分片时，在 `scripts/db/build-schema-bundles.mjs` 的对应分片清单登记。
3. 检查并更新 `scripts/db/check-schema-parity.mjs` 的表/索引数量及相关断言；数量不变时保留原常量。
4. 表字段变化同步 `apps/desktop/src/constants/internal-skills/database-schema.md`，包括全字段及建表顺序。
5. 必需的初始记录放共享 SQL 或现有初始化函数，不借历史升级函数写入。

## 3. 同步读写消费者

1. 桌面检查 `src-electron/main/modules/tables/` 的查询、写入和命令注册。
2. 移动检查 `src-tauri/src/database/` 的对应命令。
3. 删除字段时同时删除 INSERT 占位值、绑定参数、测试夹具及相关类型，不仅删除 DDL。
4. 删除历史转换前记录消费者与保留边界，清零调用后删除实现、测试与导出。
5. `schema_meta` 的版本和指纹由建库事务维护；`migration_meta` 的当前实体编号序列保留。

## 4. 索引库变更

1. 全文表变化检查桌面 `main-content-index-db.ts` 和移动 `migrator.rs`、`index_db.rs` 的重建路径。
2. 向量表继续由 `index/20_vec_template.sql` 按维度创建，不直接写入固定维度。
3. 模型指纹或维度变化后，确认索引状态能经过 `pending → building → ready/failed`；索引可重建机制不随历史主库升级链删除。

## 5. 验证

```bash
pnpm db:schema:build
pnpm db:schema:check
pnpm db:schema:prepare
pnpm --filter desktop exec tsc --noEmit
pnpm --filter mobile check:rust
pnpm check:docs
```

按改动范围运行两端行为测试与构建，并核验：

- 新库具有当前结构、版本与必要初始记录，重复打开不重复写入。
- 当前库正常读写，系统分组、日记标签、日历和回收流程仍可工作。
- 无版本、旧版本及未来版本库均被拒绝，原结构和数据未转换。
- 建库失败时结构与版本标记同事务回滚。
- Schema 文档对账、当前 FSRS 调度、正文显式连接及涉及的业务写入测试通过。

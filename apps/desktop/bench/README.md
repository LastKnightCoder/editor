# 插件待办与变化流压力验证

从仓库根目录运行，使用临时资料库，不连接个人资料库或外部同步账号。

```bash
node scripts/ensure-node-sqlite.mjs
pnpm --filter desktop exec vitest run --config vitest.plugin-task-stress.config.ts
node scripts/plugins/stress-task-data.mjs
```

领域压测调用实际 TaskAssistantEngine、正文条件写入和状态分页，以固定种子交错独立/正文实例的完成、跳过、改期、停止、旧版本重试、事务故障和时钟回拨，最后与独立操作模型对账。只 mock Electron 和索引队列边界，不 mock 领域核心。

变化流压测编译当前 DataChangesTable 与共享 SDK 游标状态机，在真实文件 SQLite 上执行混合分页、重开续读、四个独立连接写入、事务回滚、子进程 SIGKILL 恢复、日志裁剪与重置，再核对当前身份集合、integrity_check 和 foreign_key_check。日志输出各场景耗时，报告与数据库保存在输出所示临时目录；无耗时门槛。

压力用例通过专用配置运行，不进入默认单测，不替代实际服务插件的网络或设备验收。正文会话耐久接纳与主库投影的回归使用现有 content-durability-baseline 和 task-assistant/content-session 用例。

# 数据库重连验证

## 确定性回归

在仓库根目录运行：

```sh
pnpm --filter desktop exec vitest run src/services/__tests__/command-context.test.ts src/services/__tests__/database-reconnect.test.tsx src/features/schedule/__tests__/queries.database.test.tsx src/features/flashcards/__tests__/queries.database.test.tsx src/features/vibe-learning/__tests__/quizQueries.database.test.tsx src/commands/__tests__/sync.test.ts src-electron/main/modules/__tests__/pi-database-upgrade.test.ts --maxWorkers 1 --no-file-parallelism --testTimeout 30000
```

通过条件：同名资料库覆盖后已挂载页面自动刷新；跨窗口广播只更新对应库；重复通知不重新加载；旧查询和旧写入的迟到响应不污染新缓存；旧命令被拒绝；旧连接响应不能覆盖先到的新广播。普通回归跳过两项环境门控压力用例。

## 压力验证

```sh
TAU_DATABASE_RECONNECT_STRESS=1 pnpm --filter desktop exec vitest run src/services/__tests__/database-reconnect.test.tsx src-electron/main/modules/__tests__/pi-database-upgrade.test.ts --maxWorkers 1 --no-file-parallelism --testTimeout 30000
```

- 页面层：16 个保留视图经历 200 轮同名替换；每轮并发执行 128 次读取，并确认上一轮命令失效。使用真实 React、查询缓存和命令封装，仅替换 IPC 传输边界。
- 主进程层：在临时目录中实际替换 SQLite 文件 100 次；每轮 16 组并发读取日历、分组、闪卡和日程，共 6,400 次读取及 100 次有效写入；确认两窗口收到新身份、另一资料库不受影响、200 次旧请求被拒绝。使用真实主进程 handler、事务和数据库，只替换 Electron 窗口及系统路径边界。

通过条件：全部断言通过；日志中的成功读取与预期旧请求拒绝数量一致；新连接查询不得触发连接失效；每轮读取的数据属于本轮替换文件，旧写入不能进入新库。压力用例不以运行时长或内存阈值作为单测断言。真实 Windows 安装包和用户 WebDAV 服务仍需在目标环境验证。

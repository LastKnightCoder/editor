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

## 保留页面与白板宿主

```sh
TAU_DATABASE_RECONNECT_STRESS=1 pnpm --filter desktop exec vitest run src/features/shared/database/__tests__/database-reconnect.test.tsx src/features/shared/whiteboard/__tests__/DesktopWhiteboard.test.tsx src/features/shared/whiteboard/__tests__/NoteLayers.reconnect.test.tsx src/features/whiteboards/__tests__/DocumentBoardCanvas.test.tsx --maxWorkers 1 --no-file-parallelism --testTimeout 30000
```

- 图库、行详情和行补丁：200 次同名覆盖；每轮丢弃旧草稿，保存新输入并执行新行补丁，旧实例回调不得写新库。确定性用例另行检查迟到读取、迟到正文创建和旧请求尚未完成时的新输入。
- 嵌入白板：200 次覆盖与重新打开；旧画布只读、旧正文服务无数据库请求，新宿主可以创建正文。旧笔记面板的 1,000 次重复事件不得向失效连接发请求。
- 主白板：100 次租约失效；每轮自动建立新客户端、重建画布绑定并释放旧模型。该路径没有复现保留旧连接，不修改其交接实现。

本组使用真实 React 组件、命令封装与白板会话生命周期；仅替换 IPC、输入编辑器及画布渲染边界，不作视觉验收。

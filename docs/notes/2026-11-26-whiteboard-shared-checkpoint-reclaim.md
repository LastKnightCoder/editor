# 共享白板历史回收验证

本机回收提交 `739070816` 已经由 `3697c0ad7` 合入本地 master。本次共享改造在该合并点另开 worktree。验证在 macOS arm64 本机完成，使用临时资料库、回环网络、Node 生产构建以及运行生产 Worker 构建的 Miniflare。

## 内容、并发与重连

| 场景               | 验证结果                                                                                                                                                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 隔离原型           | 8 个成员连续换代 24 次。每轮 7 个成员并发提交，第 8 个成员离线修改。检查各成员标记、旧代次拒绝后的权威摘要、可读离线副本和新代次撤销重做。                                                                                                                                               |
| Node 存储接入      | 同一场景通过真实 SQLite 写队列和换代事务。候选制作期间额外提交一笔写入，旧候选被舍弃，后续 24 代均保留该笔内容。向协议行提交注入故障，原快照、摘要、序号和代次一致，重试可以成功。                                                                                                       |
| 两台设备的实时连接 | Node 生产构建启用实际工作线程。两名成员经不同设备凭据和真实 WebSocket 并发改标题与页面，一人离线，另一人仍可撤销和重做。最后一人离开后换代；旧提案返回 ABORTED，房间完整快照与序号逐项不变，离线成员重新连接后成功写入新内容。                                                           |
| Cloudflare         | 通过实际 HTTP 发布白板、获取票据并用 WebSocket 连接，断开后由房间卸载钩子触发回收。旧代次票据请求被拒，旧提案未改变快照。重新读取新版后提交新编辑并读回。                                                                                                                                |
| 桌面安装           | 两个本机视图排空后，服务端确认状态接管原共享白板；可恢复的离线内容和未送达的增量在独立本机白板中读回。故障注入使第一次主库换代失败，原内容仍可打开，未留下半份离线副本。重试成功，迟到的旧租约失效。新代次的编辑、撤销、重做都通过正常保存与同步入口。无额外本机修改的成员只加载最新版。 |

## 实测字节数

- 千元素画框反复移动后，桌面共享检查点从 **7,880,883 字节降至 2,403,267 字节**，约减少 69.5%。重开后与服务端已确认快照二进制相同，远端代次保持，另一成员的撤销和重做继续生效。
- 服务端测试构造了一页及 35,000 条失效页位置引用。Node 双人编辑样本约 5.34 MB，整理后约 0.7 KB；Cloudflare 单页样本同量级。该样本专门放大旧位置，字节比例不能外推到普通白板。两种后端只有候选至少节省两成才会换代。
- 常规三窗口保存压测共 12 个种子、960 轮，导入 1898 个元素。240 次预期故障、60 次缺依赖补齐、60 次渲染端重开和 24 次冷重启后，三份模型及 SQLite 投影均通过独立账本对账。千元素画框的真实 SQLite／WebSocket 拖动专项共 9 个场景通过，包括中途断线、远端修改、单步撤销与接近容量上限的回滚。

## 验证边界

活动房间继续使用当前代次。服务端回收由最后一个实时连接离开并卸载房间触发。仅靠 HTTP 持续写入而从未建立实时连接的房间，没有这个自动触发点。8 MiB 文档准入上限、操作回执与资产保留策略各自生效。离线副本保存可重建的内容和引用，缺少依赖或尚未上传的附件无法保证恢复。跨代后的撤销从新会话开始。

正式部署需要支持自动重连的桌面版本配合，应先更新桌面再发布服务端。验证未访问或部署线上房间。Cloudflare 全量回归中的正文历史用例「编辑历史经实际 HTTP 权限、条件恢复、单次撤销和 R2 备份恢复贯通」仍失败：两笔同作者连续编辑合并，第一条记录返回 append，用例期望 prepend。改造前的 `739070816` 生产 Worker 构建在同一断言复现，相关基线与本地主分支合并点的协作代码相同。

## 复测入口

在对应包目录运行。Cloudflare 先构建生产 Worker。

```sh
# apps/collaboration-server
TAU_SHARED_WHITEBOARD_STRESS=1 pnpm exec vitest run --no-file-parallelism

# apps/collaboration-cloudflare
pnpm build:production
TAU_SHARED_WHITEBOARD_STRESS=1 pnpm exec vitest run tests/production.test.ts -t '白板|最后一个真实连接'

# apps/desktop
TAU_WHITEBOARD_RECLAIM_STRESS=1 pnpm exec vitest run --no-file-parallelism src-electron/main/modules/whiteboard-documents/__tests__/{compact.stress,collaboration-flow}.test.ts
TAU_FRAME_DRAG_STRESS=1 TAU_FRAME_QUOTA_STRESS=1 pnpm exec vitest run src/services/whiteboard-documents/__tests__/drag-realtime.test.tsx
TAU_WHITEBOARD_SAVE_STRESS=1 pnpm exec vitest run src/services/whiteboard-documents/__tests__/client-save.stress.test.ts
```

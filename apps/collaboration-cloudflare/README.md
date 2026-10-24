# Cloudflare 协作原型

用独立 Workers + SQLite-backed Durable Object 验证现有桌面客户端、移动协作运行时能否在 Cloudflare 上完成同步、持久化和断线恢复。

## 隔离边界

- Worker 固定为 `tau-collab-prototype`，地址为 `https://tau-collab-prototype.lastknightcoder.workers.dev`。
- 仅绑定该 Worker 自己的 `PrototypeCollaboration` Durable Object，不绑定生产域名、现有数据库、R2 或其他 Worker。
- 桌面端、移动端与线上协作服务的默认地址保持不变；原型不读取、迁移或覆盖线上数据。
- 注册设备和原型运行时重建需要 `PROTOTYPE_KEY`；凭据只存本机被 Git 忽略的 `.dev.vars` 与 Cloudflare Secret。
- 部署脚本固定目标名称，并拒绝配置生产路由或其他存储绑定。

## 实现

- 保留 `/v1/*`、`/ws` 和 `/events` 协议。单个 Durable Object 承载少量测试文档，沿用 Hocuspocus 4.6 与 Yjs。
- 设备身份、签名密钥、成员、协作码、审批和文档状态保存在 Durable Object SQLite。
- 快照与增量按 512KiB 分块；保留 8MiB 文档大小上限，避免 SQL 单行 2MB 上限。
- 在 `beforeSync` 内同步事务保存增量，写入成功后才继续协议处理；压缩在事务中替换快照。
- WebSocket 显式使用 `arraybuffer`，不将默认 Blob 当作 Yjs 字节流解码。
- 原型最多注册 12 个设备、保留 6 份活动文档、同时打开 4 份文档和 24 条连接。

附件/R2、完整资源配额、生产限流、备份恢复、存量数据迁移、按文档分片与 WebSocket 休眠不在此原型中。Hocuspocus 的常驻定时器和普通 WebSocket 会阻止休眠，不能据此推断正式版本的费用。

## 本地验证

在仓库根目录执行：

```bash
pnpm --filter @tau/collaboration-cloudflare check
pnpm --filter @tau/collaboration-cloudflare build
pnpm --filter @tau/collaboration-cloudflare test
```

测试运行真实 workerd 和 SQLite 存储。桌面侧使用生产 `CollaborationClient` 与 Hocuspocus Provider；移动侧使用生产 `CollaborationManager`、REST 接口与 WebSocket，仅以本机测试桥替代 Tauri IPC 和本地绑定读取。测试不会发起访问生产协作地址的请求。

覆盖注册保护、审批前拒绝读取、审批加入、双向正文同步、移动端网络恢复事件、桌面端重新连接、离线与在线改动合并、真实 workerd 进程重启后恢复及 3MiB 文档读回。

## Cloudflare 实际验证

```bash
pnpm --filter @tau/collaboration-cloudflare deploy:prototype
COLLAB_PROTOTYPE_URL=https://tau-collab-prototype.lastknightcoder.workers.dev \
  pnpm --filter @tau/collaboration-cloudflare test
```

部署脚本首次生成本机 `.dev.vars`，权限为 `0600`，并上传对应 Secret。不要将该文件提交或粘贴到日志。重新运行脚本沿用同一凭据。

常规远端测试通过受保护的 `/__prototype/restart` 重建 Hocuspocus 运行时，重新从 SQLite 加载数据。要验证真实 Worker 发布后的数据保留，单独执行：

```bash
COLLAB_PROTOTYPE_URL=https://tau-collab-prototype.lastknightcoder.workers.dev \
COLLAB_PROTOTYPE_REDEPLOY=1 \
  pnpm --filter @tau/collaboration-cloudflare exec vitest run -t '真实 Worker'
```

此项会创建测试文档、确认增量落盘、通过受限脚本发布新构建标记，再使用原设备凭据与新连接读取同一文档。成功后结束测试共享，保留设备身份；重复运行达到 12 个设备上限时需清理独立测试命名空间或复用测试身份。

发布验证先释放旧连接；更新 Secret 后再发布带构建标记的代码版本，以 `/health/ready` 返回的新标记判定切换完成。

## 验证记录

2026-10-24：源码类型检查与 Worker 构建通过；本地 workerd 的两项核心场景、Cloudflare 远端的两项核心场景，以及独立执行的真实 Worker 重新部署场景均通过。审批、双向正文编辑、两端离线合并、重启后继续编辑、3MiB 快照和发布后身份与文档保留均有自动断言。

## 验证结论的边界

自动化覆盖双端生产网络代码与 Cloudflare 运行时，没有运行完整 Electron 界面、iOS/Android 原生应用或真机弱网测试，不代表视觉验收、休眠正确性或生产容量验收。

后续正式迁移前，需要补齐附件、资源与请求配额、故障注入、撤权竞态、休眠恢复、部署回滚和生产数据迁移演练。

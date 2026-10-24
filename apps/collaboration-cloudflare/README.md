# Cloudflare 协作服务

正式服务使用 Workers、SQLite-backed Durable Object 与私有 R2，产品入口为 `https://collab.taunote.app`。原型仍可独立运行，不接管正式数据。

## 正式运行

- Worker：tau-collaboration；Durable Object：CollaborationService；正式实例：production-v1。
- 附件桶：tau-collaboration-assets；备份桶：tau-collaboration-backups。两者r2.dev访问均关闭。
- API保持 `/v1/*`、`/ws`、`/events`；普通客户端无需原型管理凭据。
- 元数据、权限、签名密钥与Yjs状态保存在SQLite；快照及增量按512KiB分块，事务落盘后继续同步。
- 业务配额、内存背压、消息限流、资源回收与端点身份升级见 [协作架构](/docs/architecture/collaboration.md)。发布、数据恢复和域名切换见 [操作指南](/docs/guides/ops-collaboration-deploy.md)。

## 验证命令

```bash
pnpm --filter @tau/collaboration-cloudflare check
pnpm --filter @tau/collaboration-cloudflare test
pnpm --filter desktop exec vitest run src-electron/main/modules/collaboration/__tests__
pnpm check:docs
```

测试先构建两个目标，运行真实workerd、SQLite和R2模拟存储。覆盖审批、跨端正文同步、两端离线合并、进程重启、大文档、受控导入、凭据保留、身份合并重试、附件鉴权、幂等、关闭清理和完整备份。

桌面侧使用生产CollaborationClient和Hocuspocus Provider；移动侧使用生产CollaborationManager、REST和WebSocket，仅替换Tauri IPC及本地绑定读取。完整Electron界面、iOS/Android真机及离线杀进程恢复未由这些测试验收。

## 隔离环境

原型配置为wrangler.jsonc，正式配置为wrangler.production.jsonc。原型Worker固定名tau-collab-prototype，只绑定自身对象；测试凭据在被Git忽略的.dev.vars中，部署脚本拒绝绑定正式资源。原型不配置R2，不能替代正式目标验收。

```bash
pnpm --filter @tau/collaboration-cloudflare deploy:prototype
COLLAB_PROTOTYPE_URL=<部署输出的原型workers.dev地址> \
  pnpm --filter @tau/collaboration-cloudflare exec vitest run tests/clients.test.ts
```

正式服务迁移演练必须使用名称以rehearsal-开头的独立实例，并在未绑定正式产品域名时执行。客户端回归会检查实例名，拒绝向正式实例创建测试数据：

```bash
COLLAB_TEST_ENV=production-rehearsal \
COLLAB_PROTOTYPE_URL=<正式Worker的workers.dev地址> \
  pnpm --filter @tau/collaboration-cloudflare exec vitest run tests/clients.test.ts
```

普通WebSocket和Hocuspocus定时器不使用休眠API。当前以单对象和配额控制运行，尚未完成休眠及按文档分片的费用优化，不据此宣称无限容量或零费用。

## 迁移约束

导入只允许未激活实例；先导入元数据、状态和附件，核对数量及状态字节，最后激活。已开放实例拒绝覆盖。客户端通过产品端点认可的来源摘要复用凭据，必须证明双方身份才能合并权限；服务不收集自托管凭据。

正式管理凭据保存在仓库外 `~/.local/share/tau/collaboration-cloudflare/production.env`，备份位于私有R2及操作员仓库外私有目录，不得提交或打印。代码回滚保留当前数据库，不能用旧备份覆盖新写入。

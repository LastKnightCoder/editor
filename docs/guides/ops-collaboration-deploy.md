# Cloudflare 协作服务操作指南

## 正式目标

- 产品入口：`https://collab.taunote.app`，桌面端和移动端共用。
- Worker：`tau-collaboration`；配置：`apps/collaboration-cloudflare/wrangler.production.jsonc`。
- Durable Object：`CollaborationService`，正式实例名 `production-v1`；R2 私有桶：`tau-collaboration-assets`、`tau-collaboration-backups`。
- 管理凭据保存在仓库外 `~/.local/share/tau/collaboration-cloudflare/production.env`，目录权限 `0700`、文件权限 `0600`。可用 `COLLABORATION_ENV_FILE` 指定其他私有文件。禁止提交或打印凭据。
- 每日 UTC 19:37（北京时间次日 03:37）备份；`backups/` 对象保留 7 天。两个桶均不得开启 r2.dev 公共访问。

## 发布与验收

在仓库根目录执行：

```bash
pnpm --filter @tau/collaboration-cloudflare check
pnpm --filter @tau/collaboration-cloudflare build:production
pnpm --filter @tau/collaboration-cloudflare test
pnpm check:docs
pnpm deploy:collaboration
curl -fsS https://collab.taunote.app/health/ready
```

`deploy:collaboration` 发布现有正式实例，保留 Durable Object、R2 和已有 Secret。部署不回滚数据；发布后核对 health 的产品入口、版本和 ready 状态，再进行审批、WSS 同步与附件下载回归。

日常状态与备份：

```bash
pnpm --filter @tau/collaboration-cloudflare exec node scripts/production.mjs status
pnpm --filter @tau/collaboration-cloudflare exec node scripts/production.mjs backup --execute
```

备份期间暂停新的业务写入并断开连接；客户端保留未确认的 Yjs 更新，恢复连接后补传。备份完成才写入 manifest，恢复时只选择具有完整 manifest 的备份。

## 迁移与恢复

1. 取得一致、完整的旧服务备份，保存在仓库外私有目录；禁止直接复制仍在写入的 SQLite 主文件而漏掉 WAL。
2. 使用 `scripts/export-node.mjs <旧备份目录> <导出目录>` 生成元数据、合并后的活动文档状态与附件。原设备摘要、成员状态、协作码、审计及房间 ID 保留。
3. 选择独立演练实例部署，先导入、逐字节核对全部活动文档，再激活。只有未开放的实例允许导入，已开放实例拒绝覆盖。
4. 正式切换时先停止旧服务写入、取得最终备份，然后在正式实例导入、核对并激活。
5. 在产品域名的 DNS 中使用 `192.0.2.1` 占位 A 记录并开启代理，不配置业务源站。最后运行 `production.mjs bind-route --execute`，把产品域名绑定到验收完成的 Worker。ECS旧入口已退役为410，不配置兼容转发，不在源码中硬编码历史域名。
6. 验证产品 HTTPS、旧入口410、设备鉴权、文档列表、WSS、审批和附件。确认新写入可以读回，并触发一次正式备份。

```bash
pnpm --filter @tau/collaboration-cloudflare exec node scripts/production.mjs import /私有导出目录 --execute
pnpm --filter @tau/collaboration-cloudflare exec node scripts/production.mjs verify /私有导出目录 --execute
pnpm --filter @tau/collaboration-cloudflare exec node scripts/production.mjs activate --execute
```

恢复备份时使用独立实例演练，核对 manifest、元数据数量、全部活动文档与附件摘要后切换；不得覆盖正在接受新写入的实例。代码回滚使用 Cloudflare 已发布版本并保留当前数据，不直接重启旧库覆盖迁移后的新改动。

## 客户端端点升级

产品入口提供受信任旧来源的 SHA-256 摘要。客户端仅在固定产品入口匹配摘要后复用本机旧身份；若已在两个地址登记不同身份，必须提供双方凭据，服务端才合并房间权限。失败保留原身份并允许重试，自托管身份不外发。

桌面端旧缓存与本地绑定通过端点解析继续定位原房间；移动端将当前库的认可来源绑定改写为产品入口。客户端统一使用产品入口，ECS旧入口只返回410，不再承担兼容转发；本机旧缓存与身份的端点升级仍通过产品入口完成。

## 本地开发与隔离原型

`pnpm dev:collaboration` 仍提供本机 Node 参考服务与桌面多窗口开发；Node 包只用于本地、自托管参考和旧数据导出。独立原型不使用正式数据，操作见 [Cloudflare 服务说明](/apps/collaboration-cloudflare/README.md)。

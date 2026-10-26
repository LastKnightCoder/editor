# Node 协作参考服务

此包为本机开发、行为测试、自托管参考及 SQLite 数据导出提供 Node 服务。官方在线服务使用 Cloudflare，正式操作见 [协作服务操作指南](/docs/guides/ops-collaboration-deploy.md)。

## 本地运行

```bash
pnpm --filter @tau/collaboration-server dev
```

仓库根目录的 `pnpm dev:collaboration` 会启动此服务并为桌面开发进程设置本地服务地址，不修改正式客户端默认值。

## 验证

```bash
pnpm --filter @tau/collaboration-server check
pnpm --filter @tau/collaboration-server test
```

自托管时显式配置自己的 `COLLAB_PUBLIC_URL`，使用 `.env.example`、Dockerfile 与 Nginx 示例；示例域名必须替换成自有地址。此包的 Docker 部署不承载官方产品域名。

## 数据备份与导出

在一致的服务数据目录执行 `node dist/admin.js backup <私有目录>`；备份包含数据库、签名密钥及附件，不能入 Git。转为 Cloudflare 导入包使用 `apps/collaboration-cloudflare/scripts/export-node.mjs`，保留设备、房间、权限与当前编辑回执，不重新创建协作内容。导出使用元数据格式 5，要求当前表结构，不为旧结构补空账本；未完成的格式迁移状态拒绝导出。

服务只支持正文协议 2 与白板协议 3，不注册文档格式升级路由。旧版本发布、持久快照读取、票据和压缩均拒绝，原快照与资产保持；正常 HTTP/WebSocket 增量、权限与回执仍执行现有校验。`DocumentProtocolStore` 保存当前协议、首次发布与修订，普通编辑仍走 `DocumentOperationLedger`，接口与校验见 [协作架构](/docs/architecture/collaboration.md)。

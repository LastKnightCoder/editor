# Node 协作参考服务

此包为本机开发、行为测试、自托管参考及旧 SQLite 数据导出提供 Node 服务。官方在线服务使用 Cloudflare，正式操作见 [协作服务操作指南](/docs/guides/ops-collaboration-deploy.md)。

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

## 旧数据备份与导出

在一致的旧服务数据目录执行 `node dist/admin.js backup <私有目录>`；备份包含数据库、签名密钥及附件，不能入 Git。转为 Cloudflare 导入包使用 `apps/collaboration-cloudflare/scripts/export-node.mjs`，保留设备、房间和权限，不重新创建协作内容。

# Tau 协作服务器

这是 Tau 桌面端的通用 content 协作服务，提供审批式协作码、Yjs 实时同步、成员状态、离线恢复、附件鉴权和 SQLite 备份。共享入口位于 Tau 全局协作工作台。

## 首次启动

```bash
cd apps/collaboration-server
cp .env.example .env
sudo COLLAB_DATA_DIR=/srv/tau-collab/data ./scripts/bootstrap.sh
```

初始化脚本需要为宿主机数据目录设置容器用户权限。服务只绑定到 `127.0.0.1:3210`。首次没有证书时，先安装 `nginx.http.conf.example` 并执行 `nginx -t`，不能直接安装引用不存在证书的 HTTPS 配置。完成 DNS 解析后申请证书：

```bash
certbot --nginx -d collab.xiongtao.life
```

证书签发成功后，使用 `nginx.collab.conf.example` 替换该域名配置，执行 `nginx -t && systemctl reload nginx`，再验证 `/health/ready` 与 WSS。

默认 Docker 基础镜像为 `node:24-bookworm-slim`。镜像源异常时可执行 `docker compose build --build-arg NODE_IMAGE=<可访问的 Node 24 镜像>`。应使用可信镜像源和仍受维护的版本。

## 更新与备份

```bash
./scripts/update.sh
./scripts/backup.sh
./scripts/restore.sh /srv/tau-collab/backups/20260906-120000
```

更新会先备份，再构建和健康检查；客户端会自动重连。备份包含 SQLite、服务器签名密钥和全部附件，必须保密。

## 管理命令

```bash
docker compose exec collaboration node dist/admin.js status
docker compose exec collaboration node dist/admin.js ban <设备ID>
docker compose exec collaboration node dist/admin.js close <文章ID>
```

日志不会记录正文、协作码或设备凭据。默认限制为每设备 5 份共享内容、每份 10 人、单附件 25 MB、单份资源 200 MB、全站 5 GB。

完整功能说明、模块职责和验证边界见仓库的 `docs/collaboration.md`。备份脚本可手动执行；当前仓库不自动安装定时任务。请按服务器现有运维方式安排每日备份并定期做恢复演练。

# 协作服务部署记录

部署日期：2026-09-06。目标服务器通过 `ssh ali-ecs` 连接。

## 当前配置

- 公网地址：`https://collab.xiongtao.life`。
- 部署目录：`/opt/tau/editor/apps/collaboration-server`。
- 数据目录：`/srv/tau-collab/data`，挂载到容器 `/data`，所有者为 `10001:10001`。
- 镜像版本：`tau-collaboration:20260906-165544`，架构 `linux/amd64`。
- Nginx 配置：`/etc/nginx/conf.d/collab.xiongtao.life.conf`，反代到 `127.0.0.1:3210`，支持 HTTPS 和 WSS。
- 证书目录：`/etc/letsencrypt/live/collab.xiongtao.life`；现有 `certbot-renew.timer` 负责续期，续期成功后检查并重载 Nginx。
- 服务使用单实例 SQLite；Docker 自动重启策略为 `unless-stopped`，内存上限为 768 MB。

服务器上的 `docker-compose.override.yml` 固定本次镜像版本，并限制日志空间：

```yaml
services:
  collaboration:
    image: tau-collaboration:20260906-165544
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

本次上传的是服务构建所需的源码快照，没有部署 Git 仓库。服务器上的 `.env` 权限为 `600`。运行参数沿用 `.env.example`，代理信任布尔值由 Compose 覆盖。

## 查看运行状态

```bash
ssh ali-ecs
cd /opt/tau/editor/apps/collaboration-server
docker compose ps
docker compose logs --tail=100 collaboration
docker compose exec -T collaboration node dist/admin.js status
curl -fsS https://collab.xiongtao.life/health/ready
```

## 后续更新

Docker Hub 在本次部署时无法连接，实际使用 AWS 公共镜像库中的 Node 官方镜像副本，在本机交叉构建。构建命令从本地项目根目录执行：

```bash
docker buildx build --platform linux/amd64 \
  --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:24-bookworm-slim \
  -f apps/collaboration-server/Dockerfile \
  -t tau-collaboration:<新版本> --load .
docker save tau-collaboration:<新版本> | gzip -1 | ssh ali-ecs docker load
```

将 `<新版本>` 替换为本次发布标识。更新前运行备份脚本，上传最新部署配置和源码快照，并将服务器 `docker-compose.override.yml` 中的镜像改为新版本，然后执行：

```bash
docker compose up -d --no-build --wait --wait-timeout 90
```

保留上个版本镜像。需要回滚时，将 override 中的镜像改回上个版本，再执行同一命令。数据库结构存在不兼容变化时，还需要评估数据恢复。

当前镜像发布方式不使用 `scripts/update.sh`，该脚本依赖 `git pull` 和服务器联网构建；`scripts/rollback.sh` 修改的 `local` 标签也不会覆盖此处固定的版本标签。

## 备份

在服务器部署目录执行 `./scripts/backup.sh`，备份位于 `/srv/tau-collab/backups`，包含数据库、签名密钥和附件，必须保密。恢复前先停止写入并检查备份，恢复命令见服务端 README。

本次部署不安装定时备份。脚本会保留最近 7 份完整备份，而默认存储配额为 5 GB；接近配额时，现有系统盘无法容纳全部备份。正式扩大使用前应配置异地备份、调整本机保留份数，并监控磁盘空间。

## 首次部署验收

- 公网 `/health/ready` 返回 `{"ok":true}`，容器状态为 `healthy`。
- 两个临时设备通过真实 HTTPS/WSS 验证了事件通知、加入审批、审批前禁止读取、双向实时同步和附件上传下载。
- 重启容器后，正文、设备身份、成员权限和附件均保留。
- 测试共享内容已关闭，测试正文和附件已清理；数据库保留两个验收设备和关闭记录。
- 首份备份位于 `/srv/tau-collab/backups/20260906-161154`，已通过 `verify-backup` 文件完整性检查；尚未进行完整备份恢复演练。
- 本次未做两台真实桌面客户端的交互验收，也未进行生产负载容量测试。

## 2026-09-06 更新

- 新版本：`tau-collaboration:20260906-165544`；旧版本 `tau-collaboration:20260906-proxy-fix` 已保留。
- 更新包含附件回收、`assets.last_referenced_at` 字段迁移，以及共享协议对 `content-link` 的处理调整。
- 更新前备份：`/srv/tau-collab/backups/20260906-165715`。
- 上一版部署文件和 Compose 配置：`/root/tau-collab-releases/20260906-165544`，其中 `previous-compose.override.yml` 可用于回切旧镜像。
- 已先在备份副本上运行新镜像验证迁移，再更新线上服务；两次数据库完整性检查均通过。切换后原有 1 份活动共享内容、4 个设备及 12246 字节存储记录保留。
- 服务端实际入口类型检查、16 项服务端专项测试和 9 项共享协议测试通过。完整测试及默认类型检查未通过：`local-content.test.ts` 引用的桌面端 `listLocalContents` 已无导出，并引入服务端测试环境无法解析的桌面端路径别名；本次未修改该跨端测试。
- 更新后公网健康检查、WSS 事件通道、审批权限、双向实时同步、附件上传下载和持久化读取验收通过。测试共享内容已关闭；本次验收新增 2 个测试设备和 1 条关闭记录，没有额外重启线上容器。

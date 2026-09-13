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

当前 `ali-ecs` 部署在本地项目根目录执行：

```bash
pnpm deploy:collaboration
```

需要本地 Docker 已启动、项目依赖已安装，并能免密 `ssh ali-ecs`。命令会运行服务端与协议测试、检查生产入口类型，从同一份源码快照构建 `linux/amd64` 镜像并上传；随后备份现有数据、在副本上验证迁移、更新容器并检查 HTTPS/WSS。无需先提交代码，当前未提交的修改也会包含在镜像里。

版本号自动生成，部署锁避免同时切换。失败时回切旧镜像和配置，但不会自动还原数据库，以免覆盖更新期间的写入；不兼容的数据库迁移仍需单独制定恢复方案。Nginx、证书和服务器 `.env` 不会被覆盖。默认使用 AWS 公共镜像库中的 Node 官方镜像副本，可通过 `COLLAB_NODE_IMAGE` 调整。

服务器发布记录和备份副本保存在 `/root/tau-collab-releases/<版本>`，旧镜像和发布记录不自动删除，需要按磁盘情况定期清理。详情见 `docs/collaboration-deployment.md`。

## 服务器端构建（git 模式）

本地不想启动 Docker 时，可以改为在服务器上从 git 提交构建镜像：

```bash
pnpm deploy:collaboration:git
```

本地只运行测试、类型检查并上传脚本，镜像在服务器上从提交导出源码后构建，不需要本地上传镜像。切换、备份、在备份副本上验证迁移、失败回切和 HTTPS/WSS 检查与上面的命令完全一致（两条路径共用 `scripts/deploy-remote.sh`）。

服务器需先准备一个 git 仓库，默认 `/opt/tau-collab-repo`，可用 `COLLAB_GIT_REPO` 覆盖：

```bash
git init --bare /opt/tau-collab-repo
git -C /opt/tau-collab-repo remote add origin git@github.com:LastKnightCoder/editor.git
git -C /opt/tau-collab-repo fetch --depth=1 origin master
```

仓库必须放在 `/opt/tau/editor` 之外：`deploy-remote.sh` 会把整个部署目录打包留存用于回切，`.git` 落在其中会让每次发布多备份一份完整历史。

与本地模式不同，此模式只发布**已提交并推送到上游分支**的内容：工作区有未提交修改，或本地 `HEAD` 与上游不一致时会直接拒绝执行。构建缓存产生在服务器上，磁盘增长更快，建议定期执行 `pnpm cleanup:collaboration --apply --build-cache`。镜像构建需要服务器能访问基础镜像仓库与 npm 源；`ali-ecs` 已完成实测，在这台 2 vCPU / 1888MB 的实例上完整构建约 67 秒，记录见 `docs/collaboration-deployment.md`。

服务器上的手动备份与恢复：

```bash
./scripts/backup.sh
./scripts/restore.sh /srv/tau-collab/backups/20260906-120000
```

早期「服务器 Git 检出 + 联网构建」的遗留脚本（`update.sh` / `rollback.sh`）已删除，更新一律走 `deploy-git.sh` 等部署脚本。更新时客户端会自动重连。备份包含 SQLite、服务器签名密钥和全部附件，必须保密。

## 管理命令

本地一键预览和清理服务器旧版本：

```bash
pnpm cleanup:collaboration
pnpm cleanup:collaboration --apply
```

自动保留当前和上一版镜像（包括相同镜像 ID 的标签）、所有容器引用的镜像、当前成功发布记录，以及比当前版本更新的镜像和发布目录。旧发布记录中的迁移副本随目录删除；正式数据目录和 `/srv/tau-collab/backups` 不会删除。无法识别当前发布或回滚版本时停止清理，并与部署切换共用锁。

需要同时释放服务器未使用的 Docker 构建缓存时，运行 `pnpm cleanup:collaboration --apply --build-cache`。该参数会清理整个服务器的未使用构建缓存，包括其他项目的缓存，不删除其他项目的镜像或数据卷。命令只需 SSH 可用，不要求本地 Docker 启动。

```bash
docker compose exec collaboration node dist/admin.js status
docker compose exec collaboration node dist/admin.js ban <设备ID>
docker compose exec collaboration node dist/admin.js close <文章ID>
```

日志不会记录正文、协作码或设备凭据。默认限制为每设备 5 份共享内容、每份 10 人、单附件 25 MB、单份资源 200 MB、全站 5 GB。

HTTP 限流默认值已放宽为：全局每分钟 3000 次、注册设备每小时 20 次、创建共享房间每小时 200 次、申请加入每 10 分钟 100 次。自用部署可在服务器 `.env` 中通过 `COLLAB_GLOBAL_RATE_LIMIT`、`COLLAB_DEVICE_RATE_LIMIT`、`COLLAB_DOCUMENT_RATE_LIMIT`、`COLLAB_JOIN_RATE_LIMIT` 调整，修改后需重启协作服务。

完整功能说明、模块职责和验证边界见仓库的 `docs/collaboration.md`。备份脚本可手动执行；当前仓库不自动安装定时任务。请按服务器现有运维方式安排每日备份并定期做恢复演练。

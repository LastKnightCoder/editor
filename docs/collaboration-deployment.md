# 协作服务部署记录

部署日期：2026-09-06。目标服务器通过 `ssh ali-ecs` 连接。

## 当前配置

- 公网地址：`https://collab.xiongtao.life`。
- 部署目录：`/opt/tau/editor/apps/collaboration-server`。
- 数据目录：`/srv/tau-collab/data`，挂载到容器 `/data`，所有者为 `10001:10001`。
- 镜像版本：`tau-collaboration:20260906-102208-bc0f3b5d`，架构 `linux/amd64`。
- Nginx 配置：`/etc/nginx/conf.d/collab.xiongtao.life.conf`，反代到 `127.0.0.1:3210`，支持 HTTPS 和 WSS。
- 证书目录：`/etc/letsencrypt/live/collab.xiongtao.life`；现有 `certbot-renew.timer` 负责续期，续期成功后检查并重载 Nginx。
- 服务使用单实例 SQLite；Docker 自动重启策略为 `unless-stopped`，内存上限为 768 MB。

服务器上的 `docker-compose.override.yml` 固定本次镜像版本，并限制日志空间：

```yaml
services:
  collaboration:
    image: tau-collaboration:20260906-102208-bc0f3b5d
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

在本地项目根目录执行：

```bash
pnpm deploy:collaboration
```

需要本地 Docker 正在运行、项目依赖已安装，以及免密 `ssh ali-ecs`。此命令部署当前工作目录中的源码，包括未提交的修改；只更新协作服务，不发布桌面客户端。

流程为完整服务端和共享协议测试、生产入口类型检查、本地 `linux/amd64` 构建、上传镜像与同源代码快照、远端备份、在备份副本上验证迁移、切换容器、HTTPS/WSS 和数据库完整性检查。默认基础镜像为 `public.ecr.aws/docker/library/node:24-bookworm-slim`，可通过 `COLLAB_NODE_IMAGE` 指定其他可信 Node 24 镜像。

部署锁防止并发切换。版本号自动采用 UTC 时间与 Git 短提交号；由于包含未提交代码，实际发布内容以保存的源码快照为准。发布快照、备份路径、上一版配置和成功部署的镜像号保存在 `/root/tau-collab-releases/<版本>`。Nginx、证书和 `.env` 保持现有配置。

切换或远端健康检查失败时，脚本恢复上一版部署文件和镜像，返回非零退出码；数据库不会自动还原，以免覆盖更新期间的写入。涉及不兼容迁移时需单独制定恢复方案。手动回切可在服务器将发布目录中的 `previous-compose.override.yml` 恢复到部署目录的 `docker-compose.override.yml`，再执行 `docker compose up -d --no-build --wait --wait-timeout 90`。

当前镜像发布方式不使用 `scripts/update.sh`，该脚本依赖 `git pull` 和服务器联网构建，已被 git 模式的发布路径取代；`scripts/rollback.sh` 修改的 `local` 标签也不会覆盖此处固定的版本标签。

旧镜像和发布目录不自动删除，需按磁盘情况定期清理；发布目录内含备份副本及可能包含 `.env` 的旧部署归档，目录权限为 `700`。

## 服务器端构建（git 模式）

除本地构建外，另有一条不改动本地 Docker 的发布路径，入口为 `pnpm deploy:collaboration:git`（`scripts/deploy-git.sh`）。本地只做提交检查、测试与上传脚本，镜像在服务器上从 git 提交构建。默认的本地构建入口为 `pnpm deploy:collaboration`（`scripts/deploy-local.sh`，即改名前的 `deploy.sh`，内容未变）。

服务器仓库：

- 位置 `/opt/tau-collab-repo`，bare 仓库，通过免密 SSH 从 `git@github.com:LastKnightCoder/editor.git` 拉取，可用 `COLLAB_GIT_REPO` 覆盖。
- 必须位于 `/opt/tau/editor` 之外。`deploy-remote.sh` 会执行 `tar -czf previous-deployment.tar.gz -C "$ROOT" .` 全量留存部署目录用于回切，`.git` 一旦落在其中，每次发布都会多备份一份完整仓库历史，并随发布目录留存到清理为止。
- 用 bare 仓库而非工作区检出：`deploy-remote.sh` 会把源码快照 `cp -a` 进 `/opt/tau/editor`，该目录本身就是可检出的工作树，服务器侧的 git 只需要对象库。这样也不存在 `checkout` 与 `.env`、`docker-compose.override.yml` 冲突的可能。

服务器侧构建由 `scripts/deploy-remote-build.sh` 完成：

- `git fetch --depth=1` 后断言服务器取到的提交与本地待发布的提交一致，保证被构建的就是本地测试通过的那个提交。
- 从提交导出源码到该版本的私有目录，再产出与本地路径等价的 `source.tar.gz`；导出的路径清单与 `deploy-local.sh` 打包的逐项一致。
- 显式 `docker build` 产出 `tau-collaboration:<版本>` 标签，刻意不用 `docker compose build`：compose 会合并 `docker-compose.override.yml`，其中固定的旧版本标签会把新镜像打成旧标签，覆盖正在用于回切的镜像。

切换、备份数据、在备份副本上验证迁移、生成 override、失败回切与 HTTPS/WSS 检查都由未改动的 `deploy-remote.sh` 完成，两条路径行为一致。回切语义也相同：恢复 `previous-compose.override.yml` 后 `docker compose up -d --no-build`，不自动还原数据库。

与本地模式的区别：git 模式只能发布已提交并推送到上游分支的内容，工作区有未提交修改或 `HEAD` 与上游不一致时会直接拒绝执行；Docker 构建缓存产生在服务器上，磁盘增长更快，`pnpm cleanup:collaboration --apply --build-cache` 应定期执行。

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

## 2026-09-06 一键部署

- 已通过 `pnpm deploy:collaboration` 完成真实发布，当前版本为 `tau-collaboration:20260906-102208-bc0f3b5d`。
- 更新前备份：`/srv/tau-collab/backups/20260906-182325`；发布记录和旧配置：`/root/tau-collab-releases/20260906-102208-bc0f3b5d`。
- 完整服务端 26 项测试、共享协议 9 项测试及生产入口类型检查通过。（2026-09-13 更正：桌面模块测试已迁回 `apps/desktop`，服务器 `check` 恢复绿灯，此前的跨端测试别名问题已消除。）
- 正常发布、启动失败回切、公网检查失败回切均完成隔离模拟验证。真实运行验证了备份副本迁移、数据库完整性、HTTPS、WSS 握手，以及运行容器的镜像标签和镜像 ID。
- 远端脚本先上传再执行，避免容器命令消耗 SSH 标准输入中的脚本文本。成功标记仅在版本与健康检查全部通过后写入 `deployed-image.txt`。
- 本次上线检查未创建测试设备或共享内容；未重复双桌面交互与负载测试。

## 2026-09-13 git 模式准备与构建实测

- 已在服务器建立 `/opt/tau-collab-repo`（bare，40MB），`git fetch --depth=1 origin master` 得到 `a87699e1beb142bd64b69c4089d7bb6a3ff6a51e`，与本地 `HEAD`、`origin/master` 三者一致。
- 构建上下文导出验证：`git archive` 导出的七个路径与 `deploy-local.sh` 打包内容逐项一致，含 `patches/better-sqlite3@12.10.0.patch`、`patches/slate-react@0.126.4.patch` 与 `.dockerignore`（首行为 `.git`），导出体积 1.2MB。
- 资源实测：该实例为 2 vCPU / 1888MB 内存 / 无 swap，此前未评估过服务器端构建是否放得下。在 900MB 硬内存上限的一次性容器内执行 Dockerfile 的安装与构建步骤可完整通过，`dist/index.js` 与 `dist/admin.js` 均产出，全程 55 秒；期间主机仍有约 950MB 空闲内存。基础镜像 `public.ecr.aws/docker/library/node:24-bookworm-slim` 拉取正常（16 秒），npm 源可用（个别包有低于 50KiB/s 的告警，未影响完成）。
- 用真实脚本演练 `deploy-remote-build.sh`：提交不一致时以退出码 1 拒绝并提示先 `git fetch`；提交一致时 67 秒构建出 `tau-collaboration:20260912-234212-a87699e1`（478MB），`better-sqlite3` 运行时自检通过，`source.tar.gz` 生成且布局正确。
- 演练产物（镜像与发布目录）已删除，线上容器未受影响，仍为 `tau-collaboration:20260906-102208-bc0f3b5d` 且 healthy。Docker 构建缓存留在服务器上（约 1GB），后续构建可复用；这正是 git 模式的磁盘代价。
- 尚未验证：git 模式的完整发布，以及启动失败与公网检查失败触发的回切演练。前置条件是提交并推送工作区改动，因为该模式只发布已提交内容。

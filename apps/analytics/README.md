# Tau 应用版本与下载统计

仅记录应用版本和官网下载发起次数的 Workers + D1 服务，管理后台和 API 同域；R2 安装包仍经 `dl.taunote.app` 分发。不再采集启动耗时、使用时长、页面访问、会话和崩溃。

- [设计与扩展契约](docs/DESIGN.md)
- [正式部署与回退记录](docs/DEPLOYMENT.md)

正式后台：<https://analytics.taunote.app>。官网 <https://tau-website-cvr.pages.dev> 的下载入口已接入本服务。管理员凭据保存在本机 `~/.config/tau/analytics/admin-token`（0600），不写入仓库；下载摘要秘密独立保存于同目录 download-hash-key。

## 本地运行

需要 Node.js 24、pnpm 与已安装的 workspace 依赖。在仓库根目录：

```sh
pnpm --filter @tau/analytics build:web
pnpm --filter @tau/analytics db:local
```

复制 `infra/.dev.vars.example` 为同目录 `.dev.vars`，分别填写两个独立随机秘密（各至少32字符）。该文件已忽略，不可提交。示例值不能用于正式环境。

```sh
pnpm dev:analytics       # Worker、D1 与 R2 本地模拟，localhost:8787
pnpm dev:analytics:web   # UI 开发，localhost:5181，API代理到8787
```

`wrangler dev` 不读取线上 R2 对象，本地测试安装包需自行写入本地桶。不要为开发启用 remote R2；下载统计不会依赖远程用户数据。

桌面端默认只在打包构建上报。开发验证使用 `TAU_TELEMETRY_DEBUG=1 TAU_ANALYTICS_ENDPOINT=http://localhost:8787/v1/versions pnpm dev`，版本观测进入 development，状态独立存为 `analytics.development.json`；正式状态是 `analytics.json`。设置 `TAU_TELEMETRY_DISABLED=1` 可停止采集和发送。

## 验证

```sh
pnpm check:analytics
pnpm test:analytics
pnpm build:analytics
pnpm --filter @tau/website test
```

build 包括 UI 构建及 Worker dry-run，不发布任何云端变更。测试使用 Node SQLite 执行真实 SQL/事务/触发器，Worker 本地模拟用于核对 D1/R2 绑定。

在本目录执行 `pnpm verify:remote` 可重复验证正式服务：读取本机私有管理员凭据，写入独立 development 版本观测和短期下载测试标识，完成认证/版本上报/旧接口退役/R2校验后在 finally 中按专属UUID/标识清理测试数据。报告只保存非秘密结果，若清理失败会以非零状态退出并报告marker。

## 首次部署

本节命令均在 `apps/analytics` 中执行，用于新环境重建。当前正式配置已绑定独立 tau-analytics D1；迁往其他账号时须先重新创建资源并核对ID，不得复用插件市场数据库。

1. 确认 Cloudflare 登录账号与配置中的 account_id 一致。
2. 创建独立数据库，将返回的 ID 填入正式配置（本地配置保留占位 ID）。不得使用插件市场数据库。

```sh
pnpm exec wrangler d1 create tau-analytics
```

3. 配置两个高熵随机秘密；CLI 交互输入，不放进命令参数或仓库文件。ADMIN_TOKEN 是管理员登录凭据，也是短期会话签名密钥；DOWNLOAD_HASH_KEY 用于每日下载防重复摘要，两者不可共用。

```sh
pnpm exec wrangler secret put ADMIN_TOKEN --config infra/wrangler.production.jsonc
pnpm exec wrangler secret put DOWNLOAD_HASH_KEY --config infra/wrangler.production.jsonc
```

4. 应用迁移并部署；Worker 绑定现有 `tau-release` R2 桶，创建 `analytics.taunote.app` 自定义域名，需对应账号的域名权限。此命令不改写 `dl.taunote.app` 或 `stats.taunote.app`。

```sh
pnpm exec wrangler d1 migrations apply tau-analytics --remote --config infra/wrangler.production.jsonc
pnpm deploy:worker
```

5. 核对 `/health`、后台登录、匿名管理接口401、已知安装包下载302到原 R2 域名，使用开发环境版本观测验证去重。
6. 新服务可用后，再部署官网和发布桌面新版本。不要先部署已经切换下载按钮的官网，否则新统计入口尚不可用。

现有自动更新源保持 R2 直链；后台下载量只包含经过新入口的下载发起。旧版本桌面仍使用旧 Umami；本次不停止 Docker、不删除 Postgres、不混合旧网站模型的累计数据。

## 后续发布与回滚

- SQL 迁移只追加新文件。正式迁移前用 `wrangler d1 export tau-analytics --remote --output <仓库外私有备份路径> --config infra/wrangler.production.jsonc` 保存备份。
- 先部署版本接口与同域后台，再发布桌面版本。0003 回填已有版本观测并停用旧行为投影；旧行为接口返回410，旧二进制仍需升级才能停止发送。
- 新投影可在原始明细保留范围内分批回填；更早数据或未采集属性明确不可恢复。
- 只回退代码不会撤销数据库迁移；0003 已停用旧行为投影，不能用旧行为采集 Worker 回退来恢复新版本接口。修复基于最小版本上报实现向前发布，保留数据库备份。
- 管理员凭据轮换会让现有管理会话失效；下载摘要秘密日内轮换可能导致当天下载重复计数，应尽量在自然日边界轮换。

## API 与统计口径

公开接口：`POST /v1/versions`、`GET /v1/downloads/:filename?channel=website`。版本上报不超过2KiB，只含产品/环境、随机安装ID、版本和观测时间。同版本每天首次启动上报，升级时重新上报；旧 `/v1/events/batch` 直接返回410。

管理接口：`POST /v1/admin/login`、`POST /v1/admin/logout`、`GET /v1/admin/session`，以及 `overview`、`timeseries`、`breakdown`。支持 HttpOnly Cookie 与运维 bearer；凭据不得写入URL。后台只保留“应用版本”和“下载统计”。

统一筛选：product=tau-desktop、environment=production/development、上海日期 from/to，含两端，最多90天。breakdown 只支持 versions/downloads/channels，指标版本为2；留存、事件明细和行为维度已移除。

- 版本分布：每个安装在所选日期内只计最后一次观测版本，不把重复启动或升级前版本重复累计。
- 下载：按日/文件/出口摘要近似去重的发起，不是传输完成或安装成功；自动更新和R2直链不计入。
- 版本日观测与下载聚合保留400天，下载去重保留7天；定时分批清理。
- 0003 不主动删除已有行为历史，旧表仅按既有保留策略清理或冻结，不再参与后台查询。完整模型和上线顺序见[设计](docs/DESIGN.md)。

## 运维观察

监控 Worker 错误率、版本上报429/503和D1写入量/存储/查询耗时。客户端仅在失败时有界补报，没有持续心跳；日志只记录故障标识，不输出请求正文或请求头。

每小时每张表最多清理20000行，达到上限会输出 `analytics_cleanup_backlog`，需要增加清理频率或处理容量；不依赖无限执行的单次定时任务。当前账号为免费计划，D1单库上限500MB、每天10万行写入，投影和索引会放大写入量；接近额度前调整保留/归档或升级计划。付费计划的单库上限为10GB。配置不设置付费专属 CPU 上限。Queues、R2归档和分析存储可后续在服务内部接入，不要求改变已发布客户端的 v1 协议。

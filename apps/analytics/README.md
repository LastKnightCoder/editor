# Tau 产品统计

独立 Workers + D1 服务，管理后台和 API 同域；R2 安装包仍经 `dl.taunote.app` 分发。

- [设计与扩展契约](docs/DESIGN.md)
- [实施与验证记录](docs/IMPLEMENTATION.md)
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

桌面端默认只在打包构建上报。开发验证使用 `TAU_TELEMETRY_DEBUG=1 TAU_ANALYTICS_ENDPOINT=http://localhost:8787/v1/events/batch pnpm dev`，事件进入 development，队列独立存为 `analytics.development.json`；正式队列是 `analytics.json`。设置 `TAU_TELEMETRY_DISABLED=1` 可停止采集和发送。

## 验证

```sh
pnpm check:analytics
pnpm test:analytics
pnpm build:analytics
pnpm --filter @tau/website test
```

build 包括 UI 构建及 Worker dry-run，不发布任何云端变更。测试使用 Node SQLite 执行真实 SQL/事务/触发器，Worker 本地模拟用于核对 D1/R2 绑定。

在本目录执行 `pnpm verify:remote` 可重复验证正式服务：读取本机私有管理员凭据，写入独立 development 测试安装和短期下载测试标识，完成认证/采集/R2校验后在 finally 中按专属UUID/标识清理测试数据。报告只保存非秘密结果，若清理失败会以非零状态退出并报告marker。

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

5. 核对 `/health`、后台登录、匿名管理接口401、已知安装包下载302到原 R2 域名，使用开发环境事件验证省份字段。
6. 新服务可用后，再部署官网和发布桌面新版本。不要先部署已经切换下载按钮的官网，否则新统计入口尚不可用。

现有自动更新源保持 R2 直链；后台下载量只包含经过新入口的下载发起。旧版本桌面仍使用旧 Umami；本次不停止 Docker、不删除 Postgres、不混合旧网站模型的累计数据。

## 后续发布与回滚

- SQL 迁移只追加新文件。正式迁移前用 `wrangler d1 export tau-analytics --remote --output <仓库外私有备份路径> --config infra/wrangler.production.jsonc` 保存备份。
- 新事件先发服务端规则，再发布采集端。新增可选字段、新分析接口不改变旧 v1 行为；不兼容变化使用新信封/事件/指标版本。
- 新投影可在原始明细保留范围内分批回填；更早数据或未采集属性明确不可恢复。
- 部署失败可回退 Worker 版本；只回退代码不会撤销数据库迁移。因此迁移必须兼容上一版 Worker，采用先扩展、后切换、最后退役的顺序。
- 管理员凭据轮换会让现有管理会话失效；下载摘要秘密日内轮换可能导致当天下载重复计数，应尽量在自然日边界轮换。

## API 与统计口径

公开接口：`POST /v1/events/batch`、`GET /v1/downloads/:filename?channel=website`。类型见 `contracts/index.ts`，事件白名单及版本见 `contracts/events.ts`。

管理接口：`POST /v1/admin/login`、`POST /v1/admin/logout`、`GET /v1/admin/session`，以及 `overview`、`timeseries`、`breakdown`、`retention`、`events`。支持 HttpOnly 会话 Cookie，运维也可用 `Authorization: Bearer <ADMIN_TOKEN>`；凭据不得写入 URL。

查询参数：`product=tau-desktop`、`environment=production|development`、`from=YYYY-MM-DD`、`to=YYYY-MM-DD`，日期包含两端，时区固定上海，最多90天。breakdown 的 dimension 支持 provinces/countries/os/versions/events/pages/features/downloads/channels/download_provinces。响应 `meta` 包含指标版本与保留范围。

- 新增安装只来自明确 `first_run=true`；旧安装首次迁入不算新增。
- 活跃是有事件的安装实例，不是已验证的自然人；前台时长只表示窗口聚焦，按会话开始日归属。
- 地域由 Cloudflare 请求元信息提供，未知不补造；活跃分布采用安装每天最后一次事件的地域，跨天可出现在多个分组。
- 下载是按日/文件/出口摘要近似去重的发起，不是传输完成或安装成功；同出口同UA可能合并、换出口可能重复。
- 留存看第N个自然日是否活跃，该日尚未结束时显示“观察中”。
- 明细目标保留30天，下载去重7天，日聚合与会话400天；定时分批删除，清理积压时可能暂时超出目标。

## 运维观察

监控 Worker 错误率、采集429/503、D1写入量/存储/查询耗时与本地离线队列积压。日志只记录故障标识，不输出事件正文或请求头。

每小时每张表最多清理20000行，达到上限会输出 `analytics_cleanup_backlog`，需要增加清理频率或处理容量；不依赖无限执行的单次定时任务。当前账号为免费计划，D1单库上限500MB、每天10万行写入，投影和索引会放大写入量；接近额度前调整保留/归档或升级计划。付费计划的单库上限为10GB。配置不设置付费专属 CPU 上限。Queues、R2归档和分析存储可后续在服务内部接入，不要求改变已发布客户端的 v1 协议。

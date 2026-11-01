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

`deploy:collaboration` 单次发布现有正式实例，保留 Durable Object、R2、已有变量和 Secret；不生成或覆盖管理凭据。可通过 `COLLAB_BUILD_REV` 指定构建标识并在发布后核对 health。部署不回滚数据；发布后核对 health 的产品入口、版本和 ready 状态，再进行审批、WSS 同步与附件下载回归。

日常状态与备份：

```bash
pnpm --filter @tau/collaboration-cloudflare exec node scripts/production.mjs status
pnpm --filter @tau/collaboration-cloudflare exec node scripts/production.mjs backup --execute
```

备份期间暂停新的业务写入并断开连接；客户端保留未确认的 Yjs 更新，恢复连接后补传。备份完成才写入 manifest，恢复时只选择具有完整 manifest 的备份。

## 迁移与恢复

1. 取得一致、完整的旧服务备份，保存在仓库外私有目录；禁止直接复制仍在写入的 SQLite 主文件而漏掉 WAL。
2. 使用 `scripts/export-node.mjs <备份目录> <导出目录>` 从当前 Node 表结构生成元数据、合并后的活动文档状态与附件；新导出的 `metadata.json` 使用格式 6；确认当前协议、编辑回执、修订序号、资产关系及两份历史账本齐全。恢复格式 3/4/5 时使用原始清单，不改版本号：格式 3 要求两份历史账本，格式 4 要求身份账本，格式 5 无历史账本。活动文档必须是正文协议 2 或白板协议 3；缺表、旧正文或协议中仍有冻结/迁移标记时停止，禁止补空账本或改标记绕过验证。原设备摘要、成员状态、协作码、审计及房间 ID 保留。
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

## 服务器身份检查

1. 使用当前服务器地址验证设备注册、鉴权、房间列表和同步；客户端身份按实际地址隔离。
2. 更换地址时验证独立注册，不复用另一个地址的凭据；原本机身份与绑定保持原样。
3. 不调用已退役的 `/v1/devices/merge`，不配置旧来源摘要。旧入口返回 410 时，不把客户端自动改投产品入口当作恢复流程。
4. 升级前导出并备份历史账本，核对现有身份、禁用标记、成员关系与回执不变；历史账本只读保全，不重新开放身份合并接口。活动协议有冻结或迁移标记时停止，不自动解冻。

## 本地开发与隔离原型

`pnpm dev:collaboration` 仍提供本机 Node 参考服务与桌面多窗口开发；Node 包只用于本地、自托管参考和旧数据导出。独立原型不使用正式数据，操作见 [Cloudflare 服务说明](/apps/collaboration-cloudflare/README.md)。

## 保留数据的版本升级

1. 发布前核对当前部署版本、健康状态和管理状态；在仓库外私有目录保存元数据、活动快照与附件，并核对附件 SHA-256。不要打印凭据、签名密钥或正文。
2. 用隔离的 workerd/SQLite/R2 导入原始清单，验证所有活动文档、成员关系、历史账本和资源；通过旧代码到新代码的原地升级、备份恢复及回滚演练后才能操作正式实例。
3. 正式切换前完成一次带 manifest 的服务器备份，然后开启维护模式；复核最终快照、协议及附件与已验证格式一致。
4. 发布到原 Worker 和原实例，不切换数据实例，不执行正式库导入；核对新的构建标识、ready 状态及当前协议版本。当前 Wrangler 默认允许常驻实例延后最多 300 秒切换，上传成功不代表实例已切换；已开启维护时可用 `wrangler versions deploy <新版本ID>@100 --durable-objects-code-update-mode immediate --yes --config wrangler.production.jsonc` 切换，再核对 `/health/ready` 的 `build`。
5. 在恢复写入前逐表核对记录、活动正文状态字节与资源摘要；失败时回滚代码，保留当前数据，不以旧备份覆盖在线数据。通过后恢复服务并再做一次备份。

隔离演练使用仓库外的备份目录，包含原始 `metadata.json`、`documents/<id>`、`assets/<sha256>` 和从线上下载的 `live-worker/index.js`。先构建候选版本，再执行：

```bash
pnpm --filter @tau/collaboration-cloudflare build:production
pnpm --filter @tau/collaboration-cloudflare exec node scripts/verify-preservation.mjs <私有备份目录>
```

脚本仅在本机临时目录启动 Worker，逐表和逐字节核对原地升级、代码回滚及备份恢复，并用独立副本中的合成凭据验证编辑、幂等和重启恢复；结束后删除临时运行数据，保留原始备份。

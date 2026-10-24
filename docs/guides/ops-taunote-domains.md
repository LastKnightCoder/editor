# 产品域名与服务入口

| 域名                    | 目标                          | 维护入口                                                     |
| ----------------------- | ----------------------------- | ------------------------------------------------------------ |
| plugins.taunote.app     | 插件门户 Pages                | [插件平台运维](/apps/plugin-portal/infra/运维手册.md)        |
| plugins-api.taunote.app | 插件平台 Worker               | [插件平台运维](/apps/plugin-portal/infra/运维手册.md)        |
| dl.taunote.app          | 发布资源 R2                   | [客户端构建与发布](/docs/guides/ops-client-build-install.md) |
| collab.taunote.app      | tau-collaboration Worker 路由 | [协作服务操作](/docs/guides/ops-collaboration-deploy.md)     |
| analytics.taunote.app   | 产品统计 Worker               | `apps/analytics/infra/wrangler.production.jsonc`             |
| stats.taunote.app       | Nginx 410 退役响应            | [旧统计停用与恢复](/docs/guides/ops-telemetry-umami.md)      |

协作域名由 Cloudflare Worker 路由和代理 DNS 记录维护，不再指向大陆 ECS 的协作反代。修改前保留域名绑定快照，确认正式实例已通过数据验收，之后按协作操作指南切换并从服务器之外验证 HTTPS 与 WSS。

ECS 上的旧协作与旧统计入口只返回410，不再转发数据；Nginx及ACME证书验证路径保留，旧业务容器停止并禁用自动重启。发布资源的存量别名不随本次停用删除。客户端处理本机旧身份所需的来源摘要仍以正式 Secret 配置，历史域名与凭据不写回仓库。

插件平台 OAuth 回调和网页 API 基址使用产品域名；修改域名时同步核对 OAuth、CORS、下载清单与客户端内置地址。旧统计历史数据的查看与恢复使用私有备份，不恢复公网采集入口。

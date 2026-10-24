# 产品域名与服务入口

| 域名                    | 目标                          | 维护入口                                                     |
| ----------------------- | ----------------------------- | ------------------------------------------------------------ |
| plugins.taunote.app     | 插件门户 Pages                | [插件平台运维](/apps/plugin-portal/infra/运维手册.md)        |
| plugins-api.taunote.app | 插件平台 Worker               | [插件平台运维](/apps/plugin-portal/infra/运维手册.md)        |
| dl.taunote.app          | 发布资源 R2                   | [客户端构建与发布](/docs/guides/ops-client-build-install.md) |
| collab.taunote.app      | tau-collaboration Worker 路由 | [协作服务操作](/docs/guides/ops-collaboration-deploy.md)     |
| analytics.taunote.app   | 产品统计 Worker               | `apps/analytics/infra/wrangler.production.jsonc`             |
| stats.taunote.app       | 旧 Umami 站点的 Nginx 入口    | [旧统计维护资料](/docs/guides/ops-telemetry-umami.md)        |

协作域名由 Cloudflare Worker 路由和代理 DNS 记录维护，不再指向大陆 ECS 的协作反代。修改前保留域名绑定快照，确认正式实例已通过数据验收，之后按协作操作指南切换并从服务器之外验证 HTTPS 与 WSS。

存量客户端使用的历史入口只在运行环境中临时转发或保留资源别名，源码与文档统一使用产品域名。迁移客户端身份所需的来源摘要以正式 Secret 配置，禁止把历史域名或凭据写回仓库。

插件平台 OAuth 回调和网页 API 基址使用产品域名；修改域名时同步核对 OAuth、CORS、下载清单与客户端内置地址。旧统计站点不随协作迁移自动重建。

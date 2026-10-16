# Tau 插件发布门户

接手入口：[运维与部署手册](infra/运维手册.md)。先读当前上线状态与未完成项，再操作云资源。

- [接口协议](docs/协议.md)：前后端字段、状态、错误处理。
- [配置与资源](infra/README.md)：Worker/D1/R2/Pages实际绑定、域名、密钥来源。
- [阶段计划](../../docs/plugin-system/36-C19发布门户第一期.md)：已完成证据与剩余任务。
- [前端开发](web/README.md)：页面、模拟模式和测试。
- [域名与服务器](../../docs/taunote-domain-migration.md)：下载、协作、统计服务。

从仓库根预览部署：

```sh
node apps/plugin-portal/infra/ops.mjs deploy-api
node apps/plugin-portal/infra/ops.mjs deploy-web
```

脚本默认不执行。阅读手册后，加 `--execute` 才执行计划。不在脚本中自动迁移数据库、轮换密钥或删除文件。

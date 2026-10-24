# 旧统计服务停用与历史数据恢复

## 当前入口

正式统计为 [应用版本与下载统计](https://analytics.taunote.app)，源码与操作入口见 [Analytics](/apps/analytics/README.md)。旧 Umami 不再承担产品统计。

`ali-ecs` 的 umami、umami-db 和旧 collaboration-server-collaboration-1 容器均为 exited，重启策略为 no。Nginx 保持运行，旧统计与协作入口的根路径直接返回410，不再代理到容器或Cloudflare；ACME证书验证路径保留。产品协作入口仍由Cloudflare Worker提供，不依赖ECS。

Nginx退役配置样例见 [静态退役响应](/scripts/deployment/nginx.taunote-services.conf)。旧协作转发操作已从 production.mjs 移除，不能重新启用兼容桥接。

## 复核停用状态

```bash
ssh ali-ecs 'docker inspect --format "{{.Name}} {{.State.Status}} {{.HostConfig.RestartPolicy.Name}}" umami umami-db collaboration-server-collaboration-1'
ssh ali-ecs 'systemctl is-active nginx'
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://stats.taunote.app/api/send
curl -fsS https://analytics.taunote.app/health
curl -fsS https://collab.taunote.app/health/ready
```

判据：三个容器均为 exited/no，Nginx为active，旧统计返回410，两个正式服务返回200。旧入口不配置 proxy_pass，不再向旧服务或正式服务转发数据。

## 保留数据与备份

- Umami PostgreSQL数据：ECS `/opt/tau/umami/data`。
- 旧协作数据：ECS `/srv/tau-collab/data`；当前协作事实源为Cloudflare，旧数据不覆盖正式实例。
- 服务器备份目录：`/root/tau-services-retired/2026-10-24-6a3626f9c7/`。
- 本机私有备份目录：`~/.local/share/tau/retired-ecs/2026-10-24-6a3626f9c7/`。

`umami.dump` 是停止Umami应用后、停止PostgreSQL之前取得的一致性pg_dump自定义格式备份，已通过pg_restore目录校验。`service-configs.tar.gz` 保留变更前的三个Nginx配置及旧服务Compose/.env配置，`retirement.json` 保存状态、文件摘要和入口复核结果。备份目录0700、文件0600；配置归档含秘密，不提交仓库、不输出内容。

## 只读查看旧统计

1. 明确需要查看历史数据后，在ECS启动现有umami-db容器；等待pg_isready就绪，再启动现有umami容器。
2. 在本机执行端口转发，只通过本机访问，不恢复公网Nginx代理：

```bash
ssh -L 13000:127.0.0.1:3000 ali-ecs
```

3. 浏览器打开 `http://localhost:13000`。查看完成后停止umami，再停止umami-db，保持重启策略no。
4. 数据目录损坏时，先在独立PostgreSQL实例恢复umami.dump并核对，不直接覆盖保留数据。

不得通过重新启动旧协作容器或恢复整套旧Nginx配置来回退正式协作；正式恢复按 [Cloudflare协作操作](/docs/guides/ops-collaboration-deploy.md) 执行。

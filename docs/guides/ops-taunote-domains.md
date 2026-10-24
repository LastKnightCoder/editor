# taunote.app 域名配置

日常维护入口：[插件平台运维手册](/apps/plugin-portal/infra/运维手册.md)。本页记录产品域名及服务器映射。

2026-10-16。Cloudflare account沿用原账号，新Zone为 `dc2d5737af67a3f10974706ca9476992`。本轮新增域名入口，不迁移数据。

| 域名                    | 目标                                   | 状态                                                                               |
| ----------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| plugins.taunote.app     | tau-plugin-portal.pages.dev，代理CNAME | Pages域名active，包资料流程已首发                                                  |
| plugins-api.taunote.app | Worker tau-plugin-portal-api           | HTTPS健康200、CORS新门户、OAuth redirect_uri新域名                                 |
| dl.taunote.app          | R2 tau-release，最低TLS1.2             | 新旧域名读取publish-template-latest.json均200，SHA256一致                          |
| collab.xiongtao.life    | A 101.133.166.30，仅DNS                | 协作默认入口，部署与验收见[协作服务部署](/docs/guides/ops-collaboration-deploy.md) |
| collab.taunote.app      | A 101.133.166.30，仅DNS                | Nginx别名保留；公网存在阿里云备案拦截，客户端不使用此入口                          |
| stats.taunote.app       | A 101.133.166.30，仅DNS                | Nginx转127.0.0.1:3000，首页和/script.js均200                                       |

服务器使用已有SSH别名ali-ecs。新增 `/etc/nginx/conf.d/taunote-services.conf`，源码留存于 `scripts/deployment/nginx.taunote-services.conf`；远端副本及首次HTTP挑战配置在 `/root/taunote-domain-migration/`。新增虚拟主机，不覆盖旧xiongtao.life配置，不重启业务容器；nginx -t后reload。

Certbot通过webroot `/var/www/certbot`签发SAN证书，名称taunote-services，覆盖collab.taunote.app与stats.taunote.app，有效至2027-01-14。证书路径 `/etc/letsencrypt/live/taunote-services/`；自动续期和nginx检查/reload hook已配置。不要将私钥复制进仓库。

旧dl.xiongtao.life仍绑定tau-release，旧collab/stats继续响应。桌面更新/FFmpeg/模板下载与统计上报使用taunote.app；协作默认入口和部署验收使用上表中的旧域名。没有双域名回退分支；已发布二进制不会自动改变URL，需重新构建并安装客户端后生效。

部署协作服务前核对.env的COLLAB_PUBLIC_URL与[协作服务部署](/docs/guides/ops-collaboration-deploy.md)的公网入口一致；修改环境变量后使用docker compose up --no-build重建容器。公网HTTPS与WSS验收必须从服务器之外执行，不能仅依靠服务器内部健康检查。旧.env备份（含敏感配置）仅在服务器/root/taunote-domain-migration/collab.env.before-taunote，不能入Git。

GitHub OAuth设置由用户修改，后端发出的callback已验证指向新API域名，尚未完成真实登录回调验收。Pages环境VITE_API_BASE_URL已改为新API；前端Direct Upload仍需构建时注入对应变量。

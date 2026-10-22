# taunote.app 域名配置

日常维护入口：[插件平台运维手册](/apps/plugin-portal/infra/运维手册.md)。本页记录产品域名及服务器映射。

2026-10-16。Cloudflare account沿用原账号，新Zone为 `dc2d5737af67a3f10974706ca9476992`。本轮新增域名入口，不迁移数据。

| 域名                    | 目标                                   | 状态                                                                |
| ----------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| plugins.taunote.app     | tau-plugin-portal.pages.dev，代理CNAME | Pages域名active，包资料流程已首发                                   |
| plugins-api.taunote.app | Worker tau-plugin-portal-api           | HTTPS健康200、CORS新门户、OAuth redirect_uri新域名                  |
| dl.taunote.app          | R2 tau-release，最低TLS1.2             | 新旧域名读取publish-template-latest.json均200，SHA256一致           |
| collab.taunote.app      | A 101.133.166.30，仅DNS                | Nginx转127.0.0.1:3210，/health/ready为200，/ws与/events WSS握手通过 |
| stats.taunote.app       | A 101.133.166.30，仅DNS                | Nginx转127.0.0.1:3000，首页和/script.js均200                        |

服务器使用已有SSH别名ali-ecs。新增 `/etc/nginx/conf.d/taunote-services.conf`，源码留存于 `scripts/deployment/nginx.taunote-services.conf`；远端副本及首次HTTP挑战配置在 `/root/taunote-domain-migration/`。新增虚拟主机，不覆盖旧xiongtao.life配置，不重启业务容器；nginx -t后reload。

Certbot通过webroot `/var/www/certbot`签发SAN证书，名称taunote-services，覆盖collab.taunote.app与stats.taunote.app，有效至2027-01-14。证书路径 `/etc/letsencrypt/live/taunote-services/`；自动续期和nginx检查/reload hook已配置。不要将私钥复制进仓库。

旧dl.xiongtao.life仍绑定tau-release，旧collab/stats继续响应，供存量客户端和已有统计脚本使用。2026-10-16源码已统一改为taunote.app：桌面更新/FFmpeg/模板下载、统计上报、共享协作默认值、移动端默认设置和发布/部署脚本。没有新代码双域名回退分支；已发布二进制不会自动改变URL，需新客户端发布后生效。用户已保存的自定义协作地址不擅自覆盖。

协作服务器.env的COLLAB_PUBLIC_URL已切换https://collab.taunote.app并通过docker compose up --no-build重建现有镜像，未发布本地其他代码。旧.env备份（含敏感配置）仅在服务器/root/taunote-domain-migration/collab.env.before-taunote，不能入Git。新旧HTTPS仍可用。

GitHub OAuth设置由用户修改，后端发出的callback已验证指向新API域名，尚未完成真实登录回调验收。Pages环境VITE_API_BASE_URL已改为新API；前端Direct Upload仍需构建时注入对应变量。

# Cloudflare 首次部署记录

## 任务列表

- [完成] Investigate/Triage/Understand the problem
- [完成] 创建独立 D1、配置正式秘密并部署统计域名
- [完成] 验证线上采集、管理认证、地域与 R2 下载链路
- [完成] 发布官网入口切换，核对生产页面并记录回滚信息

调查结果：部署前登录账号与正式 account_id 一致，D1 只有 plugin-portal，tau-analytics Worker 不存在。官网沿用 tau-website 项目（tau-website-cvr.pages.dev）。本次已创建并验证统计服务，再完成官网生产发布。

## 资源

- Cloudflare account：`ba54fcb8459b528b75991a4de5e5d023`
- 新建 D1：`tau-analytics`，ID `d81957ad-5703-4da1-911a-be8805f8cf88`，APAC。
- Worker/域名：`tau-analytics` / `analytics.taunote.app`。
- 私有秘密保存位置：`~/.config/tau/analytics/admin-token`、`download-hash-key`，文件权限0600；不记录值、不入库。

套餐：现有账号为 Workers Free；首次发布因显式 CPU 上限仅支持付费计划而拒绝，已移除该配置，使用免费默认限制，不更改订阅。D1 免费单库500MB、每天10万行写入，索引/投影/清理均计入，后续按实际用量决定是否升级。

官网发布前状态：Pages 项目存在，但 API 返回无历史部署，默认域名返回522；此前没有可回退的正式部署。R2 的 latest.yml 可用（Windows 0.58.0），latest-mac.yml 为404。

首次 Worker 版本：`9e5c86ff-8909-4675-9374-9f9f09a9e6f8`；已绑定自定义域名与每小时17分清理任务。

验证通过的当前 Worker 版本：`7b210fc2-c6da-4999-adac-f7f1a28d832e`（增加实际官网 Pages 域名的来源放行）。50条批量上报及重试、管理查询/登录/安全Cookie/退出、来源控制、静态资源、安全头、R2下载HEAD/302/去重与文件1字节读取均通过。验证标识 `deploy-check-65a44bddc262` 的测试数据已清理。

真实探测出口为 SG，region_code 为 SG-unknown；确认地域来自服务端且忽略客户端伪造的 CN-99。国内省份编码归一化由已有行为测试覆盖，不把本次境外探测声称为国内实际省份验收。

## 官网切换结果

- 生产部署：`b3f3f3d1-d44c-4c17-8f81-e9a6ca7548fd`，分支 master，Cloudflare 显示 Environment=Production。
- 生产地址：`https://tau-website-cvr.pages.dev`，部署快照：`https://b3f3f3d1.tau-website-cvr.pages.dev`，均返回200。
- 下载按钮实际指向 `https://analytics.taunote.app/v1/downloads/Tau-v0.58.0-win32.exe?channel=website`；HEAD 返回302，目标为原 R2 地址，页面不再含安装包直链按钮。
- 后置验证采用HEAD，不增加正式下载次数。未发布桌面新版本，现有旧端继续使用旧 Umami，新埋点需随桌面下一次发布接入。
- 2026-10-18 本地类型/20项Analytics测试/8项官网测试及构建通过；本轮未做视觉验收。

## 备份与回退

- D1初始备份：`~/.local/share/tau/analytics/backups/2026-10-18T03-42-08-032Z.sql`，权限0600。
- 官网发布前元信息：`~/.local/share/tau/analytics/deployments/2026-10-18/website-before.json`；验证报告同目录 `deploy-check-65a44bddc262.json`。
- 稳定 Worker 版本为上文7b210fc2；日后代码回退使用明确版本，不能把创建密钥时的占位脚本版本当作可用回退目标。回退代码不回退数据库。
- 此前官网无历史部署，不能承诺回滚到旧生产快照；若需撤回统计入口，临时恢复 build/release.ts 的 R2 直链按钮并重新发布官网即可，自动更新源无需修改。

## 范围

创建独立 D1，配置正式秘密与 analytics.taunote.app，验证新统计服务后再切换官网生产下载入口。保留工作区已有改动，不发布桌面安装包，不停止旧 Umami。

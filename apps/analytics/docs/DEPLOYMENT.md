# 统计服务正式部署

## 当前线上配置

| 项目             | 值                                                                            |
| ---------------- | ----------------------------------------------------------------------------- |
| 服务与管理后台   | https://analytics.taunote.app                                                 |
| Worker           | tau-analytics                                                                 |
| 当前 Worker 版本 | `7d725bc0-77a9-4960-a192-999f68d2927d`，100% 流量                             |
| 版本标签         | `versions-only-20261024`                                                      |
| D1               | tau-analytics，`d81957ad-5703-4da1-911a-be8805f8cf88`                         |
| 已应用迁移       | 0001_analytics.sql、0002_versioned_projections.sql、0003_minimal_versions.sql |
| 定时清理         | 每小时 UTC 第17分钟                                                           |
| 上线日期         | 2026-10-24                                                                    |

正式资源以 [Wrangler 配置](/apps/analytics/infra/wrangler.production.jsonc) 为准。现有部署沿用 Workers Free 和既有 Secrets，不新增订阅，不修改 R2 下载域名、官网项目或插件门户数据库。

## 生效范围

- 只接收 `POST /v1/versions` 的最小应用版本观测；同安装同日更新最新观测，重复与乱序请求不增加安装数。
- 旧 `POST /v1/events/batch` 返回410，不读取行为正文、不写入数据库；旧行为明细与留存查询返回404。
- 管理后台只有“应用版本”和“下载统计”，指标版本为2。
- 官网下载入口仍验证 R2 对象并跳转，保留按日/安装包/出口摘要近似去重的下载发起统计；自动更新与直链不计入。
- 0003 已回填11条历史版本观测并移除 project_event 触发器，project_download 触发器保留；没有删除历史事件、会话或下载记录。

本次仅发布服务端和同域管理后台，没有发布桌面安装包。已安装旧版客户端可能继续尝试旧接口，但服务端已拒收；客户端停止生成行为请求、改发每日版本观测仍需发布并安装桌面新版。旧Umami已在ECS停用，私有备份与历史查看步骤见 [旧统计停用与恢复](/docs/guides/ops-telemetry-umami.md)。

## 源码与备份

部署从独立源码快照完成，没有把共享工作区其他任务的改动混入产物。Git 基线为 `9fbcefaa2`，快照包含部署时工作区中的应用版本统计改动；不能仅凭该基线提交重建此次部署。

私有部署目录：`~/.local/share/tau/analytics/deployments/2026-10-24/versions-2a4e1f4671/`。

- `source.tar.gz`：部署源码及共享 UI/主题依赖快照；SHA-256 为 `5b588d0d857f1393e0064739ceb6fe4a868ef972a8790dcdd8696a4c2ac74e08`。
- `manifest.json`：逐文件摘要和目标资源，排除 node_modules、构建产物和本地秘密文件。
- `backup-verification.json`：备份完整性、外键、记录数量及迁移演练结果。
- `asset-verification.json`：线上后台 JS/CSS 与构建产物逐文件摘要对账结果。
- `deployment-verification.json`：当前100%流量版本、迁移状态与测试数据清理复核结果。

迁移前 D1 备份：`~/.local/share/tau/analytics/backups/2026-10-24-versions-2a4e1f4671.sql`，658766字节、权限0600，SHA-256 为 `87e8f4fa58dc1e286492812cb9d3fa373517a6394e735b607f4e3849b60091fb`。备份在内存 SQLite 恢复后通过 integrity_check、foreign_key_check；按实际备份演练0003，历史表记录数量保持不变。备份可能含用户数据，只保存在本机私有目录，不上传仓库。

## 验证证据

独立部署快照通过 TypeScript、20项统计服务/客户端行为测试、Vite后台构建和Worker dry-run。正式部署的启动耗时为1ms。

公网验证报告：`~/.local/share/tau/analytics/deployments/2026-10-24/deploy-check-2477caa94149.json`。已验证：

- 健康检查、管理员登录、安全Cookie、匿名访问拒绝和退出登录。
- development 独立版本观测的上报、重复确认与版本分布计数为1。
- 旧行为接口410，原始事件与留存管理接口404。
- 官网CORS允许，其他来源拒绝。
- R2对象校验、HEAD/302跳转、下载按日去重和实际文件1字节范围读取。
- 后台静态资源与安全响应头；线上JS/CSS摘要与独立快照一致，界面结构仅含两个统计页签。

测试标识 `deploy-check-2477caa94149` 的版本观测、下载回执和下载聚合已定向清理；另行查询确认残留数量均为0。没有对真实用户记录执行清理，没有进行视觉验收。

## 后续发布与恢复

1. 核对正式账号、目标D1和待应用迁移；保留当前源码与线上版本记录。
2. 在私有目录导出D1并验证可恢复；在备份副本演练新迁移。
3. 按 [设计](/apps/analytics/docs/DESIGN.md) 的顺序应用迁移、部署Worker及后台、运行远端验证；测试数据必须定向清理并复核。
4. 服务端验证成功后再发布桌面客户端，旧安装包不会随Worker更新自动替换。

0003 已停用旧事件投影，不能直接回退到旧行为采集版本 `7b210fc2-c6da-4999-adac-f7f1a28d832e` 来恢复新协议。代码问题基于最小版本上报实现向前修复；数据库恢复需核对事故时间和后续写入，不能把回退Worker版本当作回退D1。原始事件与版本统计的口径不重新解释，现有数据库备份和下载对象保留。

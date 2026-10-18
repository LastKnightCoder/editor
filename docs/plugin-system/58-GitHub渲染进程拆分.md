# GitHub渲染进程同步插件拆分

- COMPLETE：Investigate/Triage/Understand the problem。旧数据库Provider与资源Adapter共用Contents API工具，普通上传先GET获取SHA再PUT，条件创建不传SHA，读取Base64，列举逐目录递归。
- COMPLETE：独立插件使用公开SDK、宿主fetch及同一Contents API语义，完成协议测试。
- COMPLETE：旧配置与资源账本迁移，删除旧同步Provider、资源Adapter、同步专用GitHub工具及设置分支；保留资源上传与GitHub账号工具。
- COMPLETE：真实Electron与相关回归、干净克隆构建、固定产物和提交；成果保留codex/plugin-renderer-boundary，不合并master。

## 边界与行为

只提供渲染入口main.js，在context.sync注册五方法；网络复用context.fetch，保留五分钟请求超时。无需Node入口或新SDK API。普通上传读取现有SHA后更新；条件创建直接PUT且不传SHA，冲突返回false，由客户端快照协议确认提交结果。读取继续使用Contents API返回的Base64，不引入大文件下载或Git Trees新协议。

按上一阶段确认的口径，资源调度统一使用现有插件参数，不保留GitHub专属限流设置或按ID特判。旧资源路径列举错误会抛出，数据库路径会吞掉错误；沿已确认的插件列举口径，仅404视为空目录，认证/服务失败继续上报。提交说明统一为Update文件名，不再按数据库/资源调用方区分文案；文件路径、仓库、分支及提交协议不变。

## 迁移与删除清单

通用插件资源调度配置为并发5、每秒50次、重试3次、间隔1秒、退避倍数2；现有执行器额外将并发上限限制为3，因此实际并发上限为3。旧GitHub为并发1、每秒0.5次、重试5次、间隔5秒、退避倍数3；本轮沿用户已经确认的统一调度选择，不保留专用参数。服务端限流或分支写入冲突仍由现有失败/重试流程处理，不引入插件专用队列。

- sync.github的repo/branch/pathPrefix以及integration.github的token/user.name迁入tau.sync-github配置；已有插件配置优先，明确停用意图、自动同步、数据库版本保留。
- 旧资源账本github-<repo>-<branch>.json迁入pluginSyncStatusFile对应路径。保存设置成功后删除旧账本，失败保留原配置重试。
- 删除GithubSyncProvider、GithubAdapter、GithubResourceSyncOptions、ESync.Github及旧设置表单；四种同步方式全部通过插件，设置页只呈现插件贡献的配置。
- utils/github.ts中的uploadFileToGithub/downloadFileFromGithub/listGithubFiles为同步独占，消费者清零后删除。账号信息、仓库/分支查询、图片上传和CDN转换工具仍有消费者，保留；integration.github与imageBed.github不删除。
- codec、CLI及其他插件API不在本轮范围。默认分发独立插件ZIP，主项目不保存作者源码。

## 验收

使用隔离Contents API服务覆盖Authorization、ref/branch、路径编码、SHA覆盖、无SHA条件创建竞争、Base64读取、递归列举和404/403/服务失败。复用Electron四阶段脚本验证启用/重启、迁移、快照发布、响应丢失确认、资源转发及窗口退出清理；不访问真实GitHub同步仓库或用户配置。视觉由用户验收。

## 完成验证与维护

- 独立源码：[tau-plugin-github](https://github.com/LastKnightCoder/tau-plugin-github)，版本0.1.0，公开SDK0.10.0。无需新增SDK发布；完整源码提交和产物摘要在plugins/distribution.json。
- GitHub干净克隆后冻结安装、5项作者测试和构建通过，无本地SDK快照依赖。
- 桌面9个测试文件共63项回归、TypeScript检查与Vite正式构建通过；覆盖插件配置保存失败/重试、旧配置与账本迁移、资源任务、快照和用量同步。旧GitHub同步消费者搜索清零。
- 最终ZIP通过真实Electron的install/restart/migrate/migrate-restart；S3、OSS、WebDAV同样四阶段回归通过。测试有意触发停用/卸载拒绝等错误，以脚本退出码及阶段JSON报告判定成功。

```sh
# 独立作者仓库
pnpm install --frozen-lockfile
pnpm test
pnpm build

# 客户端仓库，使用隔离目录和测试服务
node apps/desktop/scripts/sync-storage/run-client.mjs /path/to/tau.sync-github-0.1.0.zip
node scripts/plugins/build-distribution.mjs
```

报告保存在output/sync-client。启动此分支后，旧GitHub同步目标会自动迁移；在「设置 → 同步」确认仓库所有者、仓库、分支和路径仍为原值，再按原流程检查、上传或下载。账号与连接里的GitHub信息继续用于独立图片上传等功能，插件配置改动不会回写共享账号。

本轮未验收真实GitHub同步仓库，未操作真实用户配置。下一步为用户实际目标验收；四种同步存储拆分已经齐全，codec与其他架构工作仍不在本轮范围。

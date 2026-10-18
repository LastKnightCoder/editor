# WebDAV渲染进程插件拆分

## 阶段计划

- COMPLETE：Investigate/Triage/Understand the problem。核对数据库同步、资源同步、WebDAV宿主模块、独立资源上传/下载消费者及资源账本路径。
- COMPLETE：用户确认条件创建正确返回false，列举仅忽略404，其他错误继续抛出。
- COMPLETE：从最新公开模板创建独立WebDAV插件，使用公开SDK和官方浏览器WebDAV客户端，通过宿主fetch执行五方法与同步配置表单。
- COMPLETE：迁移旧配置、启用意图和资源账本；删除旧同步Provider、资源Adapter及无消费者IPC，保留资源上传/下载。
- COMPLETE：协议测试、配置迁移回归、真实Electron生命周期及干净克隆构建；固定产物，成果保留独立分支，不合并master。

## 执行边界

沿用55纠偏方案与56 OSS实现：只有main.js渲染入口，通过context.sync.register注册提供方，网络复用context.fetch；不增加Node后台入口、CLI同步、能力声明或连接门槛。数据库内容、快照、冲突处理、资源扫描和账本仍由客户端负责。codec不在本轮范围。

当前依赖webdav 5.10.0提供官方browser入口与公开getPatcher传输扩展；实现时验证该扩展能接入插件所属context.fetch，不能替换全局fetch、导入宿主私有模块或恢复Node执行。若公共传输扩展不能满足要求，应先讨论，不添加SDK私有补丁。

## 已确认的旧行为差异处理

1. 旧WebDavSyncProvider.createFileIfAbsent调用webdav-upload，指定overwrite:false及If-None-Match:*。webdav库收到412时返回false，但WebDavModule.upload忽略返回值并返回URL，Provider因此误报true。共享snapshot-publication明确依赖false判断未创建成功。现保留条件请求，将false正确传回，不改变发布协议。
2. 旧数据库同步listFiles捕获所有错误返回空列表；资源WebDavAdapter只将404视为空目录，其他错误抛出。现统一沿资源行为，逐目录忽略404，认证/服务故障继续失败，避免把读取失败当成空远端。

以上两项已经用户确认，按此实现。

资源调度统一使用现有插件参数（并发5、每秒50次、重试3次、间隔1秒、退避倍数2）。旧WebDAV为并发2、每秒5次、间隔2秒；用户明确选择统一，不新增调度设置、插件能力字段或按插件ID的特判。 配置中的并发5还受现有执行器上限3限制，实际并发最多3；未修改该上限。

## 配置与删除清单

- 旧sync.webdav.pathPrefix与integration.webdav的url/username/password迁入sync.plugin.configurations["tau.sync-webdav"]；已有插件配置优先。仅旧活动方式为webdav时切换活动插件；保留自动同步、数据库版本和明确停用意图。
- 沿用migrateSyncPluginSettings保存成功后删除旧账本的机制。旧账本为webdav-<md5(URL.host)前8位>-<md5(pathPrefix或空串)前8位>.json，URL解析失败时原代码使用完整url。新账本使用pluginSyncStatusFile，不能因切换实现丢失同步历史。
- 删除WebDavSyncProvider、工厂/配置判定/同步设置的WebDAV分支、资源WebDavAdapter及资源选项。同步配置由插件注册到现有设置页。
- webdav-upload仍被useUploadResource使用，webdav-download仍被utils/resouce.ts使用，故保留相应宿主方法及integration.webdav凭据。webdav-exists、webdav-list在同步消费者退役后再次检查引用，清零后删除。
- 保留目录递归创建、普通PUT覆盖、路径前缀、二进制内容和认证方式；不引入新存储协议。

## 验收要求

使用本机隔离WebDAV协议服务覆盖认证、MKCOL、PUT、GET、PROPFIND、条件创建竞争、412、404、认证失败、递归列举和中文/空格路径。测试执行官方浏览器构建及真实宿主fetch，不用Node客户端替代渲染插件。另测旧配置/账本迁移失败重试、启停与重启恢复、任务期间禁止停用、窗口退出清理及S3/OSS回归。真实用户配置和远端目录未经指定不用于测试；视觉由用户验收。

## 维护与本地验收

完成验证：作者5项测试、桌面10个文件共63项相关回归通过；桌面TypeScript检查及Vite正式构建通过。最终源码经GitHub干净克隆、冻结安装、测试和构建后固定ZIP；最终ZIP通过Electron的install/restart/migrate/migrate-restart四阶段，包含丢失条件写入响应后的提交确认、资源转发及窗口断开清理。S3和OSS均通过同样四阶段回归。提交前消费者搜索确认旧WebDAV同步Provider、Adapter及exists/list IPC已清零。

源码独立维护在[tau-plugin-webdav](https://github.com/LastKnightCoder/tau-plugin-webdav)，当前版本0.1.0，公开SDK0.10.0，无需新增npm发布。主仓库仅保存固定产物，完整源码提交与摘要见plugins/distribution.json。

```sh
# 作者仓库
pnpm install --frozen-lockfile
pnpm test
pnpm build

# 客户端仓库，隔离Electron验收，不使用真实配置或插件目录
node apps/desktop/scripts/sync-storage/run-client.mjs /path/to/tau.sync-webdav-0.1.0.zip
node scripts/plugins/build-distribution.mjs
```

已有用户启动此分支后，旧WebDAV目标自动改为tau.sync-webdav，启用意图和自动同步保持。设置页选择该插件，确认服务器与路径仍是原值；配置表单来自插件。独立资源上传/下载仍使用integration.webdav，迁移不删除或修改这份共享账号设置。插件新配置由现有宿主保存，不会将密码写入资源账本。

报告在output/sync-client。测试中拒绝任务期间卸载、停用插件和关闭窗口会产生预期错误日志，按退出码与四阶段JSON报告判断。真实服务器验收尚未执行，不将本机协议测试表述为生产验收。成果保留codex/plugin-renderer-boundary，暂不合并master；后续剩余GitHub同步拆分另行推进。

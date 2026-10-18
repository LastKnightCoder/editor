# OSS渲染进程插件拆分

沿用55纠偏后的边界：只有main.js渲染入口，通过context.sync.register提供五方法，网络统一走context.fetch。CLI同步已删除，不恢复；codec与发布渲染不改，不合并master。

- COMPLETE：Investigate/Triage/Understand the problem。浏览器版ali-oss支持自定义urllib传输；没有Node get/head，读取使用其公开签名URL API。
- COMPLETE：独立OSS作者项目切换公开SDK0.10.0、浏览器构建与宿主fetch，验证实际浏览器SDK，不使用Node替代测试。
- COMPLETE：复用现有一次性配置/资源账本迁移及宿主任务管理，删除旧OSS同步Provider、资源Adapter和无消费者的同步IPC，保留资源上传/列桶。
- COMPLETE：固定插件分发、真实Electron迁移及签名验证、失败恢复、干净克隆构建，成果保留在独立分支codex/plugin-renderer-boundary，不合并master。

## 行为边界

普通上传统一PUT是用户已确认的取舍。createFileIfAbsent保留现有桶版本控制检查和x-oss-forbid-overwrite:true；不修改版本提交、冲突处理或恢复。只有404视为不存在，权限错误继续失败，分页由插件内部完成。

普通PUT保留private ACL、Standard存储类型；普通与条件上传均显式启用MD5校验，与旧Node SDK默认行为一致。浏览器SDK默认关闭MD5，因此需显式传入选项；类型包遗漏的选项仅局部补齐类型，不改SDK实现。

ali-oss使用与原实现相同的6.23.0版本及官方浏览器构建。SDK负责签名、上传、列举、桶版本控制请求；GET/HEAD通过SDK签名URL由宿主fetch执行。传输适配器只适配SDK响应形状与超时，不实现另一套OSS签名、不调用SDK私有接口，不新增宿主API。

## 迁移与删除清单

- 旧sync.aliOSS迁入sync.plugin.configurations["tau.sync-oss"]，保留自动同步、数据库版本和已有明确启停意图。已有新配置优先；凭据以当前桌面使用的integration.aliOSS有效值为准，缺失时回退旧内嵌凭据。
- 迁移alioss资源账本为现有插件账本，成功保存设置后再删除旧账本；失败保留旧设置重试。integration.aliOSS仍被上传/列桶使用，不删除。
- 删除桌面AliOSSSyncProvider、资源AliossAdapter、ESync.AliOSS及对应设置/工厂/判断分支；删除已无消费者的OSS同步读写IPC。保留主进程put-object/get-bucket-list，因为资源上传与设置仍调用。
- 不从旧草稿恢复CLI，不引入Node后台入口或运行时文件包。源码放独立OSS仓库，主仓库只固定包。
- 仅使用临时目录和测试服务；不访问生产桶，不修改真实用户同步配置或插件目录。外观由用户验收。

## 交付与验收

- 作者源码：[tau-plugin-oss](https://github.com/LastKnightCoder/tau-plugin-oss)，版本0.1.1。主仓库distribution.json固定完整源码提交和文件摘要；不依赖本地SDK快照，不需要发布新版SDK。
- GitHub干净克隆后执行`pnpm install --frozen-lockfile`、`pnpm test`、`pnpm build`通过，6项官方浏览器SDK测试覆盖MD5、私有ACL、覆盖写入、签名读取、权限失败、条件创建、分页及版本检查。
- 桌面相关10个测试文件、61项测试通过，TypeScript检查与Vite正式构建通过。最终0.1.1 ZIP的同步设置组件测试通过。
- OSS最终ZIP及S3 0.2.0均通过真实Electron的install/restart/migrate/migrate-restart四阶段；覆盖配置与启用状态、读写、快照提交、资源转发、丢失响应后确认、任务期间启停保护和窗口退出清理。OSS测试服务独立校验V1签名，未用Node版SDK替代插件执行。
- 本机HTTP服务模拟OSS协议，未对真实OSS桶进行验收；不把上述结果描述为生产服务验收。

复现：在独立作者仓库构建ZIP，然后在客户端仓库运行：

```sh
node apps/desktop/scripts/sync-storage/run-client.mjs /path/to/tau.sync-oss-0.1.1.zip
node scripts/plugins/build-distribution.mjs
```

脚本只使用隔离临时目录，报告在output/sync-client；拒绝停用、窗口断开等故障测试会产生预期错误日志，以脚本退出码及四阶段报告判定。用户后续在此分支启动桌面端，检查「设置 → 同步」中的OSS插件配置、原同步目标及手动上传/下载；真实同步前仍应确认目标配置。

下一步为用户实际OSS目标验收；WebDAV/GitHub继续保留原实现，另行拆分。codec TODO不属于本轮。

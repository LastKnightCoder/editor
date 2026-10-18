# OSS同步插件拆分

> 本文保留阶段历史。同步插件的Node执行方案已撤回，CLI同步已删除；当前执行边界以[55纠偏方案](55-插件渲染进程边界纠偏.md)为准。codec另列TODO，本轮不处理。

- COMPLETE：Investigate/Triage/Understand the problem。已核对桌面数据库、资源、CLI存储实现和共享凭据消费者。
- COMPLETE：用户确认普通上传统一PUT；createFileIfAbsent保持旧版本控制检查和防覆盖头。
- COMPLETE：从GitHub最新模板建立本地OSS作者项目，使用公开SDK0.9.0实现五方法与配置组件；6项本地HTTP协议测试通过。
- IN_PROGRESS：确认Node运行时文件打包方案；现有单文件限制阻碍完整插件构建，暂不绕过校验。
- 待执行：扩展已有一次性配置/账本迁移，接入默认分发，清除旧OSS同步实现及专用入口。
- 待执行：私有读取、条件创建、失败恢复、CLI与Electron迁移验收，干净克隆构建与维护文档。

## 已核对的行为

| 行为      | 桌面数据库同步                                                          | CLI及资源同步                      |
| --------- | ----------------------------------------------------------------------- | ---------------------------------- |
| 普通上传  | HEAD后按存在与否选择create/update，设置Standard/private和防覆盖头       | 直接SDK PUT                        |
| 原子创建  | 查询桶版本控制，Enabled/Suspended拒绝，PUT带x-oss-forbid-overwrite:true | CLI相同；资源不调用                |
| 读取/存在 | SDK签名GET/HEAD，只有404视为不存在                                      | 相同                               |
| 列表      | 内部分页，映射相对路径；桌面失败返回空数组                              | 资源内部分页，失败交现有计划层处理 |
| 凭据      | integration.aliOSS；sync.aliOSS保存桶/区域/路径                         | CLI还读取旧sync.aliOSS内嵌凭据     |

用户已确认普通上传统一为直接PUT，createFileIfAbsent保持既有防覆盖规则。不按调用端分支，不更改快照发布、版本、冲突或恢复算法。既有桶版本控制限制不升级为安装前探测，也不要求额外声明能力。

## 迁移与删除边界

迁移应用级sync.aliOSS及现有资源同步账本，保留启用意图、自动同步、数据库版本和共享integration.aliOSS。后者仍被资源上传等业务消费，不随同步插件化删除。复用S3已有加载、设置挂载、CLI、进程间占用与包分发机制，不新增SDK服务。

删除目标：桌面AliOSSSyncProvider、资源AliossAdapter、CLI alioss.ts、对应同步表单/工厂/类型分支。条件创建IPC目前只有同步Provider消费，消费者清零后删除；ali-oss模块其它接口逐项核对，不删除上传等仍有调用的公共能力。

仅在隔离目录/本地测试服务验证，不修改用户生产同步配置或远端对象。源码采用独立仓库，客户端固定构建产物。存储与设置API可复用SDK0.9.0；分发契约是否需要调整由下述打包方案决定。

## 打包边界：需先确认通用方案

作者目录为 `~/.codex/worktrees/sync-storage/tau-plugin-oss`。6项测试使用真实ali-oss SDK，仅将测试构造器的Endpoint指向本机HTTP服务；覆盖签名读取、普通PUT无HEAD、并发条件创建、桶版本控制拒绝、分页、404与403区分。未访问真实远端，仅核对用户本机同步方式和路径（aliOSS、/note），未输出凭据。

ali-oss6.23.0与现有宿主版本一致。其urllib按需加载proxy-agent，代理链包括vm2及按路径加载的运行时文件。模板的单文件bundling依赖检查先后发现proxy-agent、可选编译器和require.resolve('../../bin/coffee')，不能靠将它们标为external并借用宿主依赖来宣布构建通过。探索中尝试补齐的颜色/源码映射/CoffeeScript依赖已撤回；生产源码没有别名、空模块或OSS专用加载分支。

建议扩展通用的Node运行时文件分发能力，统一覆盖manifest摘要、ZIP校验、安装、后台模块解析及模板。仍保留五方法和sync入口，不增加存储能力声明。此方案尚待确认，不把它混作已完成的OSS插件。

当前桌面/CLI旧实现删除和配置/账本迁移为工作区中的未提交改动，尚未完成分发接线及全量回归。主分支、用户插件目录和生产配置均未修改；OSS仓库尚未创建远端或推送。

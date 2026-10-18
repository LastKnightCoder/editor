# Tau S3 同步存储插件（开发中）

实现最小Node同步提供方：uploadFile、downloadFile、fileExists、listFiles、createFileIfAbsent。所有请求统一使用SDK签名，支持私有桶；不存在返回false，权限错误不会伪装成不存在。条件写入与客户端版本提交规则保持不变。

使用pnpm管理。SDK同步入口尚未发布，开发阶段依赖相邻editor/output/c30-wiring-sdk中的SDK/UI打包快照，不复制类型；尚不能仅克隆本仓库便独立构建。运行pnpm check、pnpm test、pnpm build，生成dist/tau.sync-s3-0.1.1.zip。AWS SDK版本对齐旧桌面与CLI的3.948.0，不额外设置重试或校验和策略。

在匹配的开发客户端插件页安装ZIP、重启并启用，然后在“设置→同步→同步插件”选择S3并保存配置。配置组件使用settings.register的target: "sync"，通过syncConfig.value/save读写应用级配置；后台使用同一插件ID的sync入口，任务结束由宿主释放。停用保留配置，任务进行时不能卸载或停用。pnpm install:local也可将构建产物安装到约定目录，之后重启客户端。

完整ZIP、配置界面及真实Electron的安装/启用/配置落盘/上传下载/重启恢复已在隔离目录验证。匹配客户端将旧S3同步配置迁入插件配置；CLI读取同一份已安装后台。真实服务测试请使用独立测试库与远端前缀。不能把本地测试服务通过等同于所有S3服务兼容。

凭据属于运行配置，不放入源码或测试夹具。真实验收仅使用随机隔离前缀。条件写入保留旧桌面的IfNoneMatch请求及false返回控制流；提交确认由客户端完成，不通过先查询再覆盖模拟，不增加能力声明或安装前的服务商探测。现有条件写入兼容性问题与插件迁移分开处理。

# 同步存储插件

需要 SDK 0.10.0 及以上，以及包含渲染端同步注册支持的 Tau 0.59.0 客户端构建。插件只在渲染进程执行，沿用main.js入口，不声明manifest.sync，也不提供Node后台产物。

## 注册与职责

在activate(context)中调用context.sync.register({ id: context.pluginId, name, create })。一个插件注册一个提供方，create(config)根据本次任务的JSON配置返回下列五个方法；停用或激活失败时注册自动回收。create在真正发起任务时调用，打开配置页不会连接存储服务。

| 方法                            | 返回值                    | 用途                                                 |
| ------------------------------- | ------------------------- | ---------------------------------------------------- |
| uploadFile(name, bytes)         | Promise<boolean>          | 普通上传                                             |
| downloadFile(name)              | Promise<Uint8Array>       | 读取对象                                             |
| fileExists(name)                | Promise<boolean>          | 检查对象是否存在                                     |
| listFiles(prefix?)              | Promise<RemoteFileInfo[]> | 内部完成分页，返回相对路径、名称、大小及可选修改时间 |
| createFileIfAbsent(name, bytes) | Promise<boolean>          | 按远端原子条件创建对象                               |

SyncProvider、SyncProviderDefinition和RemoteFileInfo类型从@tau/plugins/sync导入。该模块仅提供纯契约与声明辅助函数，不是Node执行入口。

客户端负责同步内容、对象命名、版本提交、冲突、资源计划和恢复。插件负责存储服务请求，不增加能力声明、服务商探测或独立同步引擎。条件创建不能用先查询再覆盖替代；请求失败后由客户端按原提交规则核验结果。

## 网络与依赖

通过context.fetch发送请求。它由宿主提供网络传输，并与插件生命周期关联。签名、URL与协议逻辑在插件内执行；浏览器可用的SDK可以把自己的HTTP传输接到context.fetch。

普通npm依赖随main.js按浏览器目标打包；不导入fs、http、Node Buffer或其他Node内置模块，不借用宿主node_modules，不另打包Node依赖目录。保留模板external配置。

## 配置界面

通过context.settings.register({ id: "sync", title, target: "sync", component })将配置表单挂在“设置→同步”。每个插件注册一个同步配置分区。

组件从PluginSettingsProps.syncConfig.value读取配置，通过await syncConfig.save(config)保存。字段和校验由插件定义；失败时保留输入并展示错误。凭据不要写入日志或工作区context.storage；宿主按插件ID在本机应用级保存配置。

客户端每次任务固定配置。关闭设置页不影响任务，停用插件保留配置；运行中的任务阻止停用和卸载。窗口关闭或崩溃时任务不会转移到Node进程继续执行。CLI不再提供同步功能。

## 从旧同步示例升级

SDK0.9.0的manifest.sync/sync.js示例已撤回。将存储实现作为普通模块由main.js导入，在activate内注册，并改用浏览器兼容依赖及context.fetch；删除manifest.sync，重新打包。不要通过其他字段恢复Node入口。

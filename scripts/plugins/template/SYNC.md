# 同步存储插件

需要 SDK 0.9.0 及以上和包含同步插件支持的 Tau 0.59.0 客户端。插件提供存储操作与配置表单，客户端负责数据库、资源、用量同步和冲突处理；CLI也可调用同一后台入口。

后台从@tau/plugins/sync导入defineSyncProvider、SyncProvider与RemoteFileInfo。defineSyncProvider接收id、name、create(config)；id与manifest.id一致，create根据本次任务配置返回提供方。用户只填写服务地址、桶、路径与凭据，没有能力声明或服务商认证流程。

同步存储插件的manifest可声明sync为sync.js，模板从src/sync.ts构建Node后台入口；main.js继续承载UI。@tau/plugins/sync由客户端后台提供，保留模板external配置。普通npm依赖打包进sync.js，Node内置模块保留运行时引用。

提供方只有uploadFile、downloadFile、fileExists、listFiles、createFileIfAbsent五个操作，使用Uint8Array、boolean和RemoteFileInfo[]等现有返回形状。分页在listFiles内部聚合；不新增stat/remove、流式参数、公开游标、目标身份字段或统一错误码。

上传返回false或抛异常的处理由现有客户端控制流承担。createFileIfAbsent保留现有版本提交调用，不要求所有服务使用同一个HTTP头；响应异常后仍由客户端核验提交记录。不能用检查后覆盖偷换其含义，也不要求安装前进行额外探测。同步内容、冲突判断与恢复归客户端。

后台入口同样参与manifest摘要、ZIP检查和安装事务。不要手动删掉完整性字段或把源码路径直接交给宿主执行。构建后通过客户端插件页安装ZIP，启用后在“设置→同步”选择插件并保存配置。

## 配置界面

在前端activate中调用context.settings.register({ id: "sync", title: "同步存储", target: "sync", component: SyncSettings })，每个插件注册一个同步配置分区。客户端将它放在“设置→同步”，插件详情页的设置入口也跳转到这里。

组件接收PluginSettingsProps，使用syncConfig.value初始化表单，提交时await syncConfig.save(config)。配置必须为JSON值；字段与校验由插件定义。保存失败保留输入并展示错误，保存成功后用户使用客户端已有的检查、上传和下载按钮。凭据不要写入日志或context.storage，后者按工作区隔离，不是同步配置的存储位置。

客户端在应用级按插件ID保存配置，并为每次任务提供固定快照。停用插件保留配置；后台任务运行时不能停用或卸载。作者不需要实现会话、dispose、能力探测或同步冲突引擎。CLI也从同一约定目录加载该后台入口，尊重启用意图；任务回收和进程间占用由客户端管理。

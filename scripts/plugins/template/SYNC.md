# 同步存储入口（开发版）

开发分支已按最小协议对齐，尚未发布到npm。现有npm 0.8.0不包含此入口；同步设置挂载和正式客户端接线仍未完成。

后台从@tau/plugins/sync导入defineSyncProvider、SyncProvider与RemoteFileInfo。defineSyncProvider接收id、name、create(config)；id与manifest.id一致，create根据本次任务配置返回提供方。用户只填写服务地址、桶、路径与凭据，没有能力声明或服务商认证流程。

同步存储插件的manifest可声明sync为sync.js，模板从src/sync.ts构建Node后台入口；main.js继续承载UI。@tau/plugins/sync由客户端后台提供，保留模板external配置。普通npm依赖打包进sync.js，Node内置模块保留运行时引用。

提供方只有uploadFile、downloadFile、fileExists、listFiles、createFileIfAbsent五个操作，使用Uint8Array、boolean和RemoteFileInfo[]等现有返回形状。分页在listFiles内部聚合；不新增stat/remove、流式参数、公开游标、目标身份字段或统一错误码。

上传返回false或抛异常的处理由现有客户端控制流承担。createFileIfAbsent保留现有版本提交调用，不要求所有服务使用同一个HTTP头；响应异常后仍由客户端核验提交记录。不能用检查后覆盖偷换其含义，也不要求安装前进行额外探测。同步内容、冲突判断与恢复归客户端。

后台入口同样参与manifest摘要、ZIP检查和安装事务。不要手动删掉完整性字段或把源码路径直接交给宿主执行。发布SDK与正式客户端后再调整最低版本和安装说明。

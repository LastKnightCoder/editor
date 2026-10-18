# 同步存储入口（开发版）

此能力正在开发，尚未发布到npm，设置挂载与正式同步接线仍未完成，不可用于生产同步。现有npm 0.8.0不包含本文接口。

同步存储插件的manifest可声明sync为sync.js，模板从src/sync.ts构建Node后台入口；main.js继续承载UI。后台从@tau/plugins/sync导入defineSyncStorage、SyncStorageError和类型，该入口由客户端后台提供，须保留external配置。普通npm依赖会打包进sync.js，Node内置模块保留运行时引用。

后台入口不导入React、Electron、桌面store或数据库模块。export default defineSyncStorage声明id、name和open，id与manifest.id一致。open接收配置快照与signal，返回stat/read/write/list/remove/dispose及target信息；各操作只处理相对对象名和字节流，数据库协议和冲突处理归客户端。

create-only写入必须使用服务端原子条件，已存在返回already-exists。权限、网络和取消等失败必须报错，不能回落为不存在或空目录。请求异常后远端可能已提交，客户端会核验，插件不能擅自覆盖。所有连接和流须响应取消与dispose。

后台入口同样参与manifest摘要、ZIP检查和安装事务。不要手动删掉完整性字段或把源码路径直接交给宿主执行。发布SDK与正式客户端后再调整最低版本和安装说明。

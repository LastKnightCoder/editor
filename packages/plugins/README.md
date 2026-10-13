# 应用插件契约与开发宿主

本包验证应用插件 API 和生命周期，当前只用于受信任的内置代码及本地开发样本。没有第三方安装入口、权限界面或安全沙箱。第三方默认受限、明确授权后可高信任的产品规则保留，后续另行实现。

## 入口

- `@tau/plugins`：definePlugin、插件实例、上下文、命令、JSON 和资源清理契约。
- `@tau/plugins/host`：PluginHost、存储适配器及内存存储。插件代码不应导入此入口。

每个宿主绑定一个工作区和一个共享存储适配器。宿主使用 `registerTrusted` 显式登记可信定义，再 `enable`；仅注册不会执行插件代码。每次启用调用 `create` 生成独立实例。命令全名是 `插件ID:局部命令ID`，重复注册报错。

插件只通过注入的 `PluginContext` 注册命令和使用自己的存储。`register` 管理订阅等资源；命令自动登记清理。`deactivate` 用于释放业务资源，调用时 signal 已取消，不能用它进行新的存储写入。应在正常操作期间完成保存。

停用立即取消旧实例信号，随后执行 deactivate 和逆序清理；一个清理失败不阻止其他清理。重新启用创建新上下文，旧回调无法通过上下文继续操作。激活失败也回收已有贡献，之后可以再次启用。unregister 删除定义但保留数据；dispose 停止整个工作区宿主。

## 数据和并发

存储只有异步 get/set/delete，数据是 JSON 副本，按工作区和插件隔离。当前不提供通用事务、SQL 或全局设置对象。get 后 set 不承诺原子读改写；如果将来需要并发计数等场景，再设计相应的版本检查或事务 API，不伪造保证。

存储适配器接收宿主产生的 scope，实际写入提交前必须校验其 signal。提交后的副作用不会因停用自动回滚；在途命令的旧结果会被宿主拒绝。操作异常正常返回调用方，不改变其他已启用插件。

此处的作用域约束防止正常代码意外串库和旧回调写入，不限制恶意同进程代码。未接入超时强杀、内存限额或跨进程 RPC，不用于不可信插件。

## 运行

```sh
pnpm --filter @tau/plugins check
pnpm --filter @tau/plugins test
pnpm --filter @tau/plugins build
pnpm --filter @example/plugin-workbench demo
```

示例插件在 [plugin-workbench](../../examples/plugin-workbench/README.md)，只依赖公开契约。包仍为工作区 private，不发布 npm，不承诺稳定的第三方 SDK 版本。

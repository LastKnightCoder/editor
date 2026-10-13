# 应用插件契约与开发宿主

本包验证应用插件 API 和生命周期，当前只用于受信任的内置代码及本地开发样本。没有第三方安装入口、权限界面或安全沙箱。第三方默认受限、明确授权后可高信任的产品规则保留，后续另行实现。

## 入口

面向作者的产品/领域 API 从 `@tau/plugins` 根入口获取，UI 组件从 `@tau/ui` 获取（PS-015）；不直接依赖 `@tau/editor/api` 等内部包。当前 SDK 提供基础、页面和开发台编辑器契约。

- `@tau/plugins`：definePlugin、插件实例、上下文、命令、JSON 和资源清理契约。
- `@tau/plugins/host`：PluginHost、存储适配器及内存存储。插件代码不应导入此入口。
- `@tau/plugins/node`：Node 私有文件存储适配器，由宿主选择目录；不进入插件公开上下文。

后两项是当前内部宿主开发入口，不属于作者 SDK 契约；外部发布前收回或移至宿主包。不会通过根入口暴露宿主类或 Node 能力。统一入口只承诺受支持的公开能力，不是内部包导出的全集。

每个宿主绑定一个工作区和一个共享存储适配器。宿主使用 `registerTrusted` 显式登记可信定义，再 `enable`；仅注册不会执行插件代码。每次启用调用 `create` 生成独立实例。命令全名是 `插件ID:局部命令ID`，重复注册报错。

## 页面

`context.pages.register({ id, title, component, match?, getId? })` 返回可打开和注销的句柄，自动随插件回收。`open(params?)` 的参数只支持字符串、有限数字与布尔值，缺省为空；完成表示导航请求已交给宿主，不代表组件所有副作用已执行。组件从 PluginPageProps 取得自己的 context 与只读 params。单实例及参数实例由页面宿主处理，宿主不支持页面时注册明确报错。

核心仅使用 React 的类型，根入口没有 React/DOM 运行时依赖。桌面适配及双入口示例见 [C03 文档](../../docs/plugin-system/12-C03桌面页面与UI接入.md)。内部 host 入口还提供 createBrowserStorage，要求宿主显式注入 Storage，不在模块加载时访问 window。

宿主可通过 subscribe/getRevision 响应状态与命令变化，listPlugins/listCommands 供开发台和命令面板使用；这些不是作者的公共业务 API。

插件只通过注入的 `PluginContext` 注册命令和使用自己的存储。`register` 管理订阅等资源；命令自动登记清理。`deactivate` 用于释放业务资源，调用时 signal 已取消，不能用它进行新的存储写入。应在正常操作期间完成保存。

停用立即取消旧实例信号，随后执行 deactivate 和逆序清理；一个清理失败不阻止其他清理。重新启用创建新上下文，旧回调无法通过上下文继续操作。激活失败也回收已有贡献，之后可以再次启用。unregister 删除定义但保留数据；dispose 停止整个工作区宿主。

## 编辑器

`context.editor.register({ scene: "workbench", extension, codecs? })` 返回自动回收的 Disposable。扩展通过根入口的 `defineEditorExtension`、`defineEditorElement` 与 `EditorElementRenderProps` 定义，沿用现有编辑器协议。当前开放节点、命令、热键和节点菜单；不开放原始 Slate 包装器，也不承诺内部扩展接口全集。Slate/React 仍是作者声明的生态依赖。

扩展 ID、节点 type、命令 ID 和 codec type 使用 `插件ID.` 前缀，避免碰撞内核及其他插件。自定义节点可增强根入口 `EditorElementMap`，行内类型同时登记 `EditorInlineElementMap`。纯 codec 的类型为 `EditorMarkdownCodec`，定义放在独立文件，避免执行端加载 UI。

宿主缺少编辑器适配器或场景不受支持时明确报错。桌面开发台统一检查注册冲突，并为编辑器命令补上只读和旧插件作用域守卫；异步任务仍须主动取消，不能持有旧编辑器在 await 后直接写入。生产正文、Y.Doc 协作、外部历史和异步编辑提交 API 尚未接入。

开发台按贡献集合变化重建 Slate 实例，保存并恢复原始正文、历史与选区；组件本地状态、焦点和在途操作不迁移。详情及可复现路径见 [C04](../../docs/plugin-system/13-C04编辑器扩展接入.md)。

## 数据和并发

存储只有异步 get/set/delete，数据是 JSON 副本，按工作区和插件隔离。当前不提供通用事务、SQL 或全局设置对象。get 后 set 不承诺原子读改写；如果将来需要并发计数等场景，再设计相应的版本检查或事务 API，不伪造保证。

存储适配器接收宿主产生的 scope，实际写入提交前必须校验其 signal。提交后的副作用不会因停用自动回滚；在途命令的旧结果会被宿主拒绝。操作异常正常返回调用方，不改变其他已启用插件。

此处的作用域约束防止正常代码意外串库和旧回调写入，不限制恶意同进程代码。未接入超时强杀、内存限额或跨进程 RPC，不用于不可信插件。

文件适配器按工作区与插件组合的摘要选择文件，默认每个命名空间最多 1 MiB；写入通过同目录临时文件、文件同步和原子替换完成，失败保留旧值。损坏或不兼容版本明确报错，不静默覆盖。每个数据目录只有一个写入适配器，同一进程的多个宿主应共享它；不支持多个进程同时写同一目录，也不承诺跨文件事务或整机掉电后的目录持久性。

每次读取从磁盘获取，因而重建适配器后可恢复；队列串行合并同命名空间的键写入，避免不同键相互覆盖。提交点前检查取消信号，提交发起后不声称停用能撤回已经开始的原子替换。

## 运行

```sh
pnpm --filter @tau/plugins check
pnpm --filter @tau/plugins test
pnpm --filter @tau/plugins build
pnpm --filter @example/plugin-workbench demo
```

示例插件在 [plugin-workbench](../../examples/plugin-workbench/README.md)，只依赖公开契约。包仍为工作区 private，不发布 npm，不承诺稳定的第三方 SDK 版本。

包内 `build` 使用 esbuild 生成内部 ESM 验证产物，workspace 包保持 external；类型由 `check` 单独验证，当前 exports 仍指向源码。原来的 tsc 单目录输出不适用于跨包编辑器类型图，现阶段不生成可发布声明包。独立 SDK 的声明打包、共享依赖和无私有路径构建属于 P6，不能把这里的 dist 当作可独立安装的 npm 包。

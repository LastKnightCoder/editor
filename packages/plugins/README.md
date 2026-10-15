# 应用插件契约与开发宿主

本包提供应用插件 API 和生命周期，当前统一按完整宿主权限在同一环境运行，用于内置插件和本地开发流程，不划分可信/受限产品档位。registerTrusted 是保留的宿主方法名。第三方生产安装仍待实现；权限界面、沙箱和安全体系后续统一设计，见 PS-031。

## 入口

核心与协议全部由 TypeScript 维护：`src/contract.ts` 是作者生命周期、命令和私有存储契约，`src/index.ts` 保留原公开导出；`src/host.ts` 是桌面和示例共用的正式宿主，`src/lifecycle.ts`、`src/storage.ts`、`src/file-storage.ts` 承担清理和存储。`scripts/` 只做构建/启动/验收编排，不维护第二套宿主。QuickJS/WASM 选型与权限隔离暂停，历史实验见专题 24/25，当前流程不依赖它们。

面向作者的产品/领域 API 从 `@tau/plugins` 根入口获取，UI 组件从 `@tau/ui` 获取（PS-015）；不直接依赖 `@tau/editor/api` 等内部包。当前 SDK 提供基础、页面、自定义设置和开发台编辑器契约。

- `@tau/plugins`：definePlugin、插件实例、上下文、命令、JSON 和资源清理契约。
- `@tau/plugins/host`：PluginHost、存储适配器及内存存储。插件代码不应导入此入口。
- `@tau/plugins/node`：Node 私有文件存储适配器，由宿主选择目录；不进入插件公开上下文。

后两项是当前内部宿主开发入口，不属于作者 SDK 契约；外部发布前收回或移至宿主包。不会通过根入口暴露宿主类或 Node 能力。统一入口只承诺受支持的公开能力，不是内部包导出的全集。

每个宿主绑定一个工作区和一个共享存储适配器。宿主使用 `registerTrusted` 显式登记可信定义，再 `enable`；仅注册不会执行插件代码。每次启用调用 `create` 生成独立实例。命令全名是 `插件ID:局部命令ID`，重复注册报错。

## 页面

`context.pages.register({ id, title, component, match?, getId? })` 返回可打开和注销的句柄，自动随插件回收。`open(params?)` 的参数只支持字符串、有限数字与布尔值，缺省为空；完成表示导航请求已交给宿主，不代表组件所有副作用已执行。组件从 PluginPageProps 取得自己的 context 与只读 params。单实例及参数实例由页面宿主处理，宿主不支持页面时注册明确报错。

核心仅使用 React 的类型，根入口没有 React/DOM 运行时依赖。桌面适配及双入口示例见 [C03 文档](../../docs/plugin-system/12-C03桌面页面与UI接入.md)。内部 host 入口还提供 createBrowserStorage，要求宿主显式注入 Storage，不在模块加载时访问 window。

宿主可通过 subscribe/getRevision 响应状态与命令变化，listPlugins/listCommands 供开发台和命令面板使用；这些不是作者的公共业务 API。

C08-A 为 activate 设置 10 秒期限；取消后最多再等 5 秒，不延长原期限。deactivate 和全部逆序资源清理共用 5 秒预算，超时后仍调用其余清理函数。激活超时或清理失败进入 restart-required，普通激活错误且清理成功仍可重试；listPlugins 的 error 保留失败原因。宿主重建时通过内部 restartRequired 集合共享隔离身份，不能通过注销/重新登记绕过；桌面在窗口内保留该集合，并等旧宿主收尾后建立新宿主。提前调用 dispose 的资源仍跟踪其 Promise，不把未决清理当成成功。详见 [C08](../../docs/plugin-system/18-C08生命周期与管理收口.md)。

插件只通过注入的 `PluginContext` 注册命令和使用自己的存储。`register` 管理订阅等资源；命令自动登记清理。`deactivate` 用于释放业务资源，调用时 signal 已取消，不能用它进行新的存储写入。应在正常操作期间完成保存。

停用立即取消旧实例信号，随后执行 deactivate 和逆序清理；一个清理失败不阻止其他清理。重新启用创建新上下文，旧回调无法通过上下文继续操作。激活失败也回收已有贡献，之后可以再次启用。unregister 删除定义但保留数据；dispose 停止整个工作区宿主。

## 自定义设置

`context.settings.register({ id, title, description?, component })` 注册设置分区，返回自动回收的 `PluginSettingsHandle`（id/open/dispose）。组件从 `PluginSettingsProps.context` 取得实例作用域，读写使用既有 context.storage；无需直接导入桌面设置 store，也没有重复的 settings.get/set。

同一插件内局部 id 不得重复；打开已注销/停用的句柄或在无适配器宿主注册会报错。桌面统一从「设置 → 插件」进入，每插件有宿主管理详情，注册的分区作为详情内分组；open 仍定位原分组，不进入 Page。停用后管理信息和启用按钮保留，自定义组件和 Portal 卸载；重新启用读取原值。每次挂载拥有独立查询缓存与局部错误边界，防止旧异步结果污染新分区。对象级配置与单次操作参数留在业务页面。

首个样本采用即时保存，保存成功后更新 UI，失败显示错误并可重试。这里只保存本机工作区偏好，没有通用未保存草稿守卫、同步或凭证服务。见 [C05](../../docs/plugin-system/14-C05自定义设置接入.md)。

## 编辑器

`context.editor.register({ scene: "workbench", extension, codecs? })` 返回自动回收的 Disposable。扩展通过根入口的 `defineEditorExtension`、`defineEditorElement` 与 `EditorElementRenderProps` 定义，沿用现有编辑器协议。当前开放节点、命令、热键和节点菜单；不开放原始 Slate 包装器，也不承诺内部扩展接口全集。Slate/React 仍是作者声明的生态依赖。

扩展 ID、节点 type、命令 ID 和 codec type 使用 `插件ID.` 前缀，避免碰撞内核及其他插件。自定义节点可增强根入口 `EditorElementMap`，行内类型同时登记 `EditorInlineElementMap`。纯 codec 的类型为 `EditorMarkdownCodec`，定义放在独立文件，避免执行端加载 UI。

宿主缺少编辑器适配器或场景不受支持时明确报错。桌面开发台统一检查注册冲突，并为编辑器命令补上只读和旧插件作用域守卫；异步任务仍须主动取消，不能持有旧编辑器在 await 后直接写入。生产正文、Y.Doc 协作、外部历史和异步编辑提交 API 尚未接入。

开发台按贡献集合变化重建 Slate 实例，保存并恢复原始正文、历史与选区；组件本地状态、焦点和在途操作不迁移。详情及可复现路径见 [C04](../../docs/plugin-system/13-C04编辑器扩展接入.md)。

## 标准 fetch

context.fetch 的类型直接是 typeof globalThis.fetch，使用 RequestInit、Request、Headers、FormData、Response 与 AbortSignal。非 2xx 正常返回，正文通过 json/text/blob/arrayBuffer/formData 或 body 流读取；超时由调用方使用 AbortSignal.timeout。没有 PluginHttpMethod、JSON DTO、连接 ID 或额外传输限制。

宿主注入 fetch 执行器；SDK 只将激活期 signal 与调用方信号合并，停用取消请求及响应流。桌面底层使用主进程原生 fetch，通过内部 IPC 按需传输；旧 nodeFetch 及其选项/IPC/消费者已迁移，不保留兼容层。内部 hasBody 等元信息不导出为作者 API。

执行环境是宿主 Node，不自动继承页面 Cookie/CORS；认证由业务负责。微信读书样本通过业务依赖取得已有账号配置并以标准请求头认证，不在 SDK 增加全局凭证接口。支持二进制、multipart 与流，见 [C06](../../docs/plugin-system/15-C06真实服务API与微信读书书单.md)。实际账号尚未联调。

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

包内 `build` 使用 esbuild 生成内部 ESM 验证产物，workspace 包保持 external；类型由 `check` 单独验证，当前工作区 exports 仍指向源码，不把这里的 dist 当作独立 npm 包。

C07 已提供仓库根 `node scripts/plugins/package-sdk.mjs`，生成独立安装的 @tau/plugins/@tau/ui 开发契约压缩包：声明闭包随包交付、只开放根入口，运行实现由桌面宿主提供。作者模板在 scripts/plugins/template，完整步骤和边界见 [C07](../../docs/plugin-system/17-C07独立插件开发与加载.md)。`node scripts/plugins/verify-external.mjs` 在临时仓库外目录完成安装、构建与真实 Electron 验证；C09 已接手动重载、失败恢复和完整构建自动监听，尚未发布公共 npm 或开放生产安装。

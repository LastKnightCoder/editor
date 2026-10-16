# API 使用说明

`import { definePlugin } from "@tau/plugins"`。入口默认导出插件定义；`create()` 每次启用创建新实例，实例实现 `activate(context)`，可选 `deactivate()`。异步激活和停用受宿主管理。不要把工作区状态放在模块全局。

| 接口                                          | 用途                                                 |
| --------------------------------------------- | ---------------------------------------------------- |
| context.pluginId / workspaceId                | 当前插件与工作区身份                                 |
| context.signal                                | 生命周期结束时中止异步工作                           |
| context.commands.register({ id, title, run }) | 注册命令；id 为插件内局部 ID，run 接收并返回 JSON 值 |
| context.storage.get / set / delete            | 异步私有 JSON 存储，按插件和工作区隔离，停用保留     |
| context.pages.register                        | 注册 React 页面，返回句柄可调用 open()               |
| context.settings.register                     | 注册 React 设置区域                                  |
| context.editor                                | 编辑器扩展契约，具体签名以 npm 类型声明为准          |
| context.fetch                                 | 网络请求                                             |
| context.register({ dispose })                 | 托管自定义订阅或资源，停用或激活失败时回收           |

页面和设置组件从 props.context 获取当前上下文。模板演示命令打开页面、异步读取/保存计数、设置区域与对话框。注册的命令、页面和设置由宿主在停用时清理；自行创建的计时器等资源通过 context.register 回收。

UI 从 `@tau/ui` 导入，例如 Button、Panel、Dialog、DialogBody。颜色使用 `--tau-*` 主题变量。插件自己的 CSS 会单独打包为 main.css，由宿主随生命周期加载和清理；不要依赖宿主扫描插件源码生成 Tailwind 类。

不允许导入 `@tau/plugins/host`、`@tau/plugins/node` 或客户端源码；这些不是作者入口。完整签名使用编辑器类型提示查看，`src/contract-check.ts` 是只参与类型检查的示例，不进入运行产物。

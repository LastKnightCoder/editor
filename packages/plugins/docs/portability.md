# 跨端插件契约

Tau 使用同一个 `@tau/plugins` SDK 表达公共能力，平台宿主提供实现。开发产物为 `0.36.0-dev.0`，未发布到 npm。公共契约、统一模板和格式 3 校验供受控开发使用；客户端接线与分发边界见[跨端宿主架构](/docs/architecture/plugin-portability.md)，生产中心仍只接受原有格式。

## 页面与功能入口

`context.pages.register` 声明页面内容、参数、身份，返回页面句柄。`context.navigation.registerEntry` 声明用户发现功能的入口，引用本插件本次激活注册的有效页面。任务管理可以有一个入口，却有列表、详情、设置等多个页面，因此注册页面不能自动增加侧栏条目。

入口的位置由宿主决定：桌面侧栏与 Android/iOS 的“我的 · 插件功能”消费同一声明。作者不依赖容器内部实现，也不操作宿主 history。旧 `sidebar` API 继续代表桌面专属分组、子项与拖放，不被静默转换成移动功能。

```tsx
const page = context.pages.register({
  id: "tasks",
  title: "任务管理",
  component: TasksPage,
});
context.navigation.registerEntry({ id: "tasks", title: "任务管理", page });
```

入口可提供 icon、params。宿主校验入口 ID、标题、重复注册、参数和页面归属，注册结果进入插件资源回收；没有导航适配器时明确报错。页面手动注销时同时回收绑定入口，即使清理失败也继续清理其他资源；停用后旧页面句柄不可再打开。运行时贡献计数使用 navigation 类别；这不修改中心协议。

页面组件可在 effect 中调用 pageContext.registerLeaveGuard(guard)，返回 false 阻止离开，清理时注销。异步守卫需处理自己的保存失败，不能自行跳过导航仲裁。

页面内部布局允许变化：桌面可以列表/详情并排，手机逐页进入；数据操作、ID、参数与保存语义共用。优先响应式布局，差异大才拆分组件。

## 环境与能力

每次读取 `context.environment` 都取得环境源的最新不可变快照。静态编辑器组件通过 `usePluginEnvironment()` 读取对应渲染宿主注入的环境，不依赖 activate，也不缓存全局插件 context。博客与只读内容同样需要由自己的渲染宿主注入环境，不能假定桌面激活已经发生。

| 字段              | 含义                                                 |
| ----------------- | ---------------------------------------------------- |
| platform          | desktop / android / ios / web / unknown              |
| layout            | compact / wide / unknown，界面形态与操作系统分别表达 |
| input.touch       | 宿主识别到触摸输入能力                               |
| input.finePointer | 宿主识别到精细指针输入能力                           |
| capabilities      | 版本化 PluginCapability 词表，不代表数据授权或沙箱   |

平台不等于屏幕大小或输入方式，平板和触摸桌面不能只靠 isMobile 决定所有交互。插件不自行猜 User-Agent，运行容器识别集中在宿主。

没有显式环境适配的旧宿主，context 返回 unknown 与空能力；组件树没有环境 Provider 时，hook 明确报错。宿主使用 `@tau/plugins/environment-host` 的 Provider 和快照函数注入；作者只使用 SDK 根入口的 hook 和类型。

宿主可使用 createPluginEnvironmentStore(initial)，把同一个 source 传入 PluginHost 的 environmentSource 和 Provider 的 source。update 只允许修改 layout/input，语义未变化时不通知；platform 与版本化能力集合在会话内固定。hook 自动订阅/注销，context getter 读取最新快照。宿主负责把 resize、输入媒体查询接到 source.update；createBrowserPluginEnvironment 仅在宿主显式传入 Window 后订阅媒体查询，不猜测 User-Agent。旧 environment/value 快照注入仍可用。

## 编辑器的职责边界

| 内容                                              | 归属       | 跨端要求                        |
| ------------------------------------------------- | ---------- | ------------------------------- |
| 节点结构、codec、校验与业务操作                   | 插件       | 共用插件 ID、节点类型与字段     |
| 选中框、插入入口、标准源码容器、块菜单/拖拽的呈现 | 编辑器宿主 | 同一语义可以有不同平台交互      |
| 图库排序、复杂绘图等插件自己的编辑体验            | 插件       | 可拆桌面/移动组件，操作同一数据 |

例如乐谱块声明编辑源码、导出、移动等动作，桌面可以提供工具条/右键/拖拽把手，移动可以提供触摸按钮/底部菜单/上下移动。标准交互由宿主改造，避免每个插件各写一遍长按与菜单；插件内部的特殊编辑体验仍由作者负责。

标准源码组件通过每个编辑器的宿主服务选择交互，插件继续使用 SourceBlockEditor/useSourceBlock。宿主必须在 UI 与节点提交 API 同时执行只读限制，不能仅隐藏按钮。保存/取消、返回与异步提交失效属于宿主职责；作者专有手势仍由作者适配。

原始 ABC 包没有直接消费新环境 hook，环境差异由它调用的宿主源码组件读取。计数器直接消费同一 SDK 的环境 hook，用同一个入口声明跨端展示。

宿主从 blockPanel 生成触摸插入动作与桌面菜单。完整移动拖拽、复杂菜单、中文输入法和手感需要分别验收；不能把组件可渲染视作整个桌面交互已移动化。

## 作者项目与兼容范围

一个模板体系维护公共作者契约与构建流程；公共逻辑、数据模型、渲染优先共享，差异明显时拆分视图。计数器源文件是固定测试样本，不是第二套移动 SDK 或独立移动模板产品；现有公开模板仓库没有在本轮发布更新。

移动支持分别判断显示、插入、编辑；只读展示不能冒充完整编辑兼容。未安装或能力不足时保留原始节点。独立开发格式 3 通过 targets 的 elements 声明 none/render/edit，并与实际节点贡献对账；缺失默认 none。宿主通过 adaptPortablePluginDefinition 投影贡献，并把同一支持表接入编辑器提交保护；单纯校验清单不会改变编辑器。旧生产 manifest 语义不变，不以无 Node 依赖自动认定兼容。

普通 Web 插件可以由三端加载同一 JS/CSS 包。桌面 Node 后台、外部程序和通用原生调用不是共同能力。当前最小验证的单包单入口，不是整个生态永久禁止平台入口/产物差异的裁决；正式多平台发布协议没有随验证改变。

## 跨端开发包与作者闭环

`@tau/plugins/portable` 提供格式 3 的纯校验与兼容判断，profile 为 web-v1；各目标独立声明最低版本、required/optional 能力和节点等级。旧 validatePluginManifest 与生产分发校验仍拒绝格式 3。宿主的 evaluatePortablePluginPackage 在求值前检查 profile/平台/版本/必需能力，并在求值后核对节点清单；文件完整性由读取器先校验。

web 平台用于静态渲染环境，不能通过应用激活兼容检查；新的博客内容消费者仍需单独接线。格式 3 不包含 backend、whiteboard 或 Skill；不将桌面系统能力作为手机可选能力下发。

统一模板默认生成跨端开发包，也保留旧桌面格式构建路径供原有作者和回归使用。页面入口、编辑器起点和构建器都在同一套模板中，未发布或推送到外部模板仓库。新 SDK/UI tarball 通过 use-local-sdk.mjs 放进忽略的 .sdk 目录，模板锁文件使用相对 file 依赖。发行器生成声明闭包和 portable 校验模块，不公开 environment-host/host/rendering 等宿主入口。

仓库外验证脚本为 scripts/plugins/verify-portable-author.mjs：在带空格与中文的独立目录安装 tarball，构建页面和编辑器示例，验证冻结安装、三端声明、完整性与拒绝路径。它不等于正式客户端或真机运行验证。

## 可信执行边界

插件与宿主共享 React/JavaScript 环境。模块白名单、数据授权、完整性摘要和错误边界不构成恶意代码沙箱，也不能抢占主线程死循环。跨端 API 可用性、用户数据授权与平台商店审核是独立判断。

运行结构见 [客户端宿主](/docs/architecture/plugin-portability.md)，复现步骤见 [操作指南](/docs/guides/plugin-portability-hosts.md)。

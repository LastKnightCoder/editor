<!-- 由 scripts/plugins/sync-author-docs.mjs 从 packages/plugins/docs/api-support.md 生成，请勿单独编辑。 -->

# 插件 API 支持矩阵

本表描述 SDK 0.36.0 与当前仓库宿主实现，不是所有旧客户端的能力承诺。桌面 0.59.1 接入格式 3 的 v2 中心安装、更新/恢复和启动装配；旧格式继续支持。Android/iOS 0.2.1 起的正式构建支持固定插件中心安装与启用，Android 0.2.2 包含新版阅读态与插入面板适配；仍需服务端允许目标平台和相应版本通过审核，iOS 正式发行待签名。网页插件中心只浏览与分发，不执行插件。

一个 SDK 允许不同宿主实现不同子集。类型中有方法不代表该端可用；`capabilities` 只列当前版本已实现的能力，`permissions` 只声明业务授权上限，两者不能互代。不能通过删除 required、改格式号或伪报 edit 绕过限制。

## 上下文 API

“已接”表示存在真实适配或公共实现；“部分”后的边界是支持范围；“未接”不能靠作者改布局解决。Android 与 iOS 目前具有相同 API 子集，但交互验收分别进行。

| API                                                                                                   | 桌面                                       | Android                                 | iOS                | 作者责任与边界                                                                                   |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------ |
| `context.pluginId`、`context.workspaceId`、`context.signal`、`context.register`                       | 已接                                       | 已接                                    | 已接               | 数据按工作区隔离；监听/连接交给 register；异步响应检查 signal；不依赖系统退出一定调用 deactivate |
| `context.environment`、`usePluginEnvironment()`                                                       | 已接                                       | 已接                                    | 已接               | 用能力判接口、layout/input 判交互；静态正文不缓存 activate 的 context                            |
| `context.pages`                                                                                       | 已接                                       | 已接                                    | 已接               | 共用页面参数、身份和离开守卫；窄屏布局、触摸操作由作者适配                                       |
| `context.navigation`                                                                                  | 侧栏入口                                   | “我的”功能入口                          | “我的”功能入口     | 页面与入口分别注册；不操作宿主 history 或导入宿主路由                                            |
| `context.commands`                                                                                    | 注册与命令面板已接                         | 部分：注册/回收已接，无统一插件命令面板 | 同 Android         | 命令注册不自动产生手机可点击入口，主要功能另注册 navigation                                      |
| `context.storage`                                                                                     | 工作区 KV                                  | 工作区 SQLite KV                        | 工作区 SQLite KV   | JSON 私有数据；单值上限 1 MiB；不是业务数据库、结构化集合或安全凭据库                            |
| `context.settings`                                                                                    | 插件设置及领域设置已接                     | 部分：插件自己的设置页                  | 同 Android         | 移动不支持带 target 的领域设置；调用可选设置前检查 settings.v1                                   |
| `context.editor`                                                                                      | 动态 register 限工作台；普通正文用静态贡献 | 动态 register 未接                      | 动态 register 未接 | 跨端正文通过 definePlugin 的 editorExtensions/editorCodecs，不能在 activate 动态注册来替代       |
| `context.fetch`                                                                                       | 宿主原生传输已接                           | 未接                                    | 未接               | 插件中心能联网不代表插件有网络适配；本轮不承诺原生网络、Cookie、CORS 或下载后台续传              |
| `context.services`                                                                                    | 按宿主注入服务                             | 未注入作者业务服务                      | 同 Android         | 不把类型中的编译、媒体、转换等服务当成移动通用能力                                               |
| `context.permissions`                                                                                 | 业务授权已接                               | 未接                                    | 未接               | 含移动目标的格式 3 包必须 permissions 为空；界面显示权限说明不等于授权可用                       |
| `context.data`、`context.content`                                                                     | 已接，按权限与修订校验                     | 未接                                    | 未接               | Tau 的卡片/文章/任务/日程读写及 ContentRef 正文，与插件私有 KV 分开                              |
| `context.entities`、`context.records`、`context.links`、`context.transaction`                         | 已接                                       | 未接                                    | 未接               | 即使读写本插件自己的实体/集合不需业务权限，也仍需要移动宿主适配；不能用 KV 支持推断这些接口可用  |
| `context.events`                                                                                      | 业务事件已接                               | 未接                                    | 未接               | 插件自己的 React 状态与业务数据库变更订阅不是同一能力                                            |
| `context.app`                                                                                         | 内容选择/打开/宿主动作已接                 | 未接                                    | 未接               | pages.open 只打开插件页面，不等于可以打开或修改 Tau 内容                                         |
| `context.ai`                                                                                          | 已接，需声明和授权                         | 未接                                    | 未接               | 不绕过宿主模型分配、额度或授权自行假定可用                                                       |
| `context.mcp`、`context.chat`                                                                         | 已接                                       | 未接                                    | 未接               | 工具注册、外部传输和聊天自定义渲染不是移动公共子集                                               |
| `context.flashcards`                                                                                  | 已接                                       | 未接                                    | 未接               | 正文插件块不会自动加入移动闪卡编辑场景                                                           |
| `context.excerpts`、`context.materials`                                                               | 已接                                       | 未接                                    | 未接               | 应用自身能显示材料，不表示提供了插件 API                                                         |
| `context.sidebar`、`context.home`、`context.actions`、`context.views`                                 | 已接                                       | 未接                                    | 未接               | 跨端入口改用 navigation；首页面板、对象动作、详情区块不得自动映射为手机支持                      |
| `context.notifications`                                                                               | 已接                                       | 未接                                    | 未接               | 不承诺移动系统通知或后台通知                                                                     |
| `context.sync`、`context.upload`、`context.tts`、`context.images`、`context.video`、`context.publish` | 领域提供方已接                             | 未接                                    | 未接               | 移动内置功能与插件提供方协议独立；无对应能力名可声明为 optional 来绕过                           |
| `context.backend`                                                                                     | 格式 2 独立后台与授权已接                  | 格式 3 不支持                           | 格式 3 不支持      | Node、子进程、本机程序继续留在旧桌面包；本轮不迁移                                               |

## 正文、UI 与交互

| 能力                                               | 已实现范围                                                                      | 作者需要适配                                               | 宿主未接或待验收                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 静态 editorExtensions/editorCodecs                 | 三端共用节点/codec；移动普通正文与预览装配；none/render/edit 同时约束界面和提交 | 为各平台如实声明全部节点，公共数据与节点 type 不变         | 移动闪卡等其他 Kit 不自动装配；格式 3 博客分发未接                            |
| useElement、SourceBlockEditor/useSourceBlock       | 公共节点操作、只读保护、草稿保存/取消；ABC 已在两端模拟器编辑保存               | 使用标准组件；处理外部更新、取消、失活；专有编辑器自行适配 | 真机软键盘、中文输入法、最低 WebView 待验收                                   |
| 插入与块菜单                                       | 手机触摸插入、上下移动/删除等标准命令                                           | 自定义编辑动作不能仅有 hover/右键；手机提供可点击入口      | 完整长按拖拽、边缘手势、平板与手感待验收                                      |
| Dialog/Drawer 与页面退出                           | 公共浮层回收和系统返回仲裁，页面离开守卫                                        | 关闭/取消不误保存；复杂布局使用响应式或分开视图            | 不是所有 @tau/ui 控件都已逐项完成移动交互验收                                 |
| ContentEditor/ContentPreview、EntityRef 等业务组件 | 桌面有相应内容/引用适配                                                         | 不能因为组件可导入就宣称手机可编辑任意 Tau 正文            | 移动作者业务组件适配未接；区别于插件节点在已有正文中的渲染                    |
| 媒体与资源                                         | 正文节点资源声明与原文保留                                                      | 在 nodes 声明资源字段；分别验证目标场景                    | 不承诺移动作者媒体 API 的上传/缓存/查看器全集；普通包内展示不等于领域服务已接 |
| 白板、Skill、博客静态模板                          | 保持原桌面协议                                                                  | 继续维护旧格式；无需批量改包                               | 不纳入 formatVersion 3 / web-v1；web 环境只表示只读渲染上下文                 |
| 搜索、摘要与同步                                   | 移动保留插件原始节点及 KV；前端导入导出使用 codec                               | 新字段保持旧版可读，代码回退不回退数据                     | 移动搜索不索引插件内部源码；真实同步冲突、长文资源预算待验收                  |

## 能力词表的准确含义

当前跨端宿主提供 `commands.v1`、`storage.v1`、`pages.v1`、`navigation.v1`、`settings.v1`、`ui.dialog.v1`、`editor.elements.v1`、`editor.codecs.v1`、`editor.source.v1`。其范围以上表为准，例如 commands.v1 不承诺手机命令面板，settings.v1 不承诺领域设置，editor.elements.v1 不代表动态 context.editor.register。

没有登记能力名的桌面 API 不属于已承诺的移动可选能力，不能自行发明 data.v1、fetch.v1 等名称。当前移动目标的非空 permissions 会在模板构建、中心上传和移动求值前被拒绝。

作者/上传严格校验使用 validatePortablePluginManifest 或更严格的 validatePortableDistributionManifest，未知能力（包括 optional 拼错）均拒绝。客户端使用 readPortablePluginManifest 保留有界、合法的未来能力名称：未知 required 在兼容检查中作为缺能力拒绝，未知 optional 保留但不可用。optional 不是自动补实现；作者调用前仍检查实际环境并提供降级。未知字段、格式、profile、权限词表和节点等级仍拒绝。

## 作者选择与发行边界

1. 先列出插件用到的 API；全部落在移动已接范围，才声明对应移动 target。
2. 若仅交互不同，共用数据/codec，按 layout 与 input 提供移动操作；适配未完成的节点填 render 或 none。
3. 若依赖宿主未接的业务能力，保留桌面版本，不用改清单假装兼容。计数器和 ABC 的结论不能外推到所有插件。
4. 旧格式 1/2 继续支持；旧客户端经 v1 只收到旧包。增加平台需同一插件 ID 的更高版本，不覆盖已发布 ZIP、重命名节点或自动清数据。
5. 使用插件 SDK 0.36.0 与 UI 0.4.0；中心 v2 接收格式 3；普通提交人工批准，具审核权限的作者本人通过已绑定仓库 CI 发布可自动批准。平台适配与功能测试由作者负责，不要求审核者测试或填写验证记录。是否可安装由客户端版本、能力与中心开关共同决定，不能由 npm 版本推断。移动中心首次安装默认保存启用意图，下次打开生效；桌面新装默认停用，用户启用后重启内容插件；更新保留显式启停选择。任意开发 URL 安装仅限调试构建。

已完成的自动测试与模拟器行为验证不替代真机、最低系统、完整 IPA、桌面原生安装包发行、未知旧作者迁移或应用商店验收。

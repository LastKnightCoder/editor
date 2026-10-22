# 跨端插件验证宿主

## 边界

`apps/mobile/src/plugin-spike/` 是独立验证宿主，共用现有 SDK、移动 router、EditorKit 与 Markdown 管线。桌面通过隔离的 Electron 窗口运行，Android/iOS 通过当前 Tauri 项目的独立应用标识运行。桌面窗口使用验证壳的侧栏，不代表已经接入正式桌面 Page/Sidebar；移动入口也不改变正式“我的”页面。

普通 Vite 构建不引用验证入口。显式 `plugin-spike` 模式才替换 HTML 入口，输出位于忽略目录 `dist-plugin-spike/`。生产插件中心、正式 manifest 与客户端安装流程没有修改。公共 API 的唯一说明在 [SDK 跨端契约](/packages/plugins/docs/portability.md)。

## 加载与执行

本地 Vite 插件提供两个固定包的快照：计数器由同一份 TypeScript 源文件构建，ABC 读取仓库固定版本的原始 JS/CSS。客户端先校验 manifest、固定身份范围、大小与 SHA-256，再一次性保存到独立 localStorage 命名空间，通过既有 CJS 求值器、PluginHost 与 ContentPluginRegistry 装配。

ABC 的 desktop manifest 原样保留，加载器仅对两个固定可信样本开放。它不推断任意桌面插件都可用于移动，也不实现 ZIP 安装器、新正式包格式或独立签名。平台审核、自动升级和商店发布不属于这个入口。

三端使用同一计数器/ABC 产物。计数器通过 pages/navigation 注册页面与入口，宿主按环境决定入口位置；Provider 向页面和静态内容组件注入环境快照。运行时不提供不可信插件隔离。

## 编辑器与页面

内容套件由 `getMobileContentKit().extend()` 派生，显式加入验证 registry 的扩展，保留类型冲突检查。正式移动 EditorKit 默认不装配插件的行为不变。

插入动作来自插件 blockPanel；源码组件由验证宿主注入，桌面保留共享源码组件，移动用文本面板与既有 Sheet 返回仲裁。节点修改进入 Slate 撤销/重做。正文、计数均保存到验证专用存储，codec 与渲染使用同一版本的 ABC。

插件页面由一个通用 router 页承载，页面与入口分离；参数规范化，浮层关闭登记到页面返回链。页面隐藏、插件失活或应用不可见时 pageContext 不报告为活跃。

自动验证从清空 history 快照后的根页开始，单独验证数据重载；它不证明任意历史页面栈的重启恢复。手动入口保留正常 router 行为。

## 验证与诊断

原生 WebView 内执行行为断言，报告包含容器标识、平台环境、包摘要、检查项与失败原因。桌面/Android 通过本地 HTTP POST 回传；iOS 开发资源代理使用同源 GET 携带有限的测试报告，避免 WebKit 的跨源明文请求限制。该接口只用于本地固定样本，不承载用户内容或生产遥测。

报告保存在 `output/mobile-plugin-spike/`，不入库。验证模式关闭热更新，避免断言与模块替换相互干扰。视觉、真实触摸手感、输入法、长按拖拽、资源预算与商店审核分别验收，不由行为报告替代。

正式桌面宿主未注入新环境和导航适配时，环境为 unknown，功能入口注册明确不支持；没有新增生产侧栏或安装入口。复现见 [操作指南](/docs/guides/plugin-portability-spike.md)。

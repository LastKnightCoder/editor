# 对话界面组件

消息与对话容器从 `@tau/chat-ui` 接入；只需要消息、Markdown、思考和工具行时使用 `@tau/chat-ui/conversation`，纯工具渲染注册使用 `@tau/chat-ui/renderers`。

## 消息界面语言

消息操作、思考耗时、代码复制、文档引用标签与通用工具状态使用 `src/locales/message.*.json`，支持简体中文、繁体中文与英文。组件继承 `@tau/i18n/react` 的 `I18nRuntimeProvider`，独立使用默认简体中文；显式传入的动作名由宿主维护。

`formatElapsed(ms, locale?)`、`formatToolDuration(ms, locale?)` 和 `toolStatusText(execution, locale?)` 接受显式语言，省略时默认简体中文。计算与执行状态不因语言改变，思考计时、展开状态、代码/正文和工具原始输入输出保留。工具渲染失败后只更新提示，不重新调用已失败的渲染器；替换注册的渲染器仍按原规则恢复。

容器空态、预览卡片及审批/提问交互的专属界面由其所属模块继续维护，不以消息词典覆盖宿主或插件内容。

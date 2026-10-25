export * from "./components/ChatComponents";
// 对话消息 UI（D-048）：桌面与浏览器扩展共用
export * from "./components/Message";
export {
  default as MarkdownRenderer,
  type MarkdownRendererProps,
} from "./components/MarkdownRenderer";
export {
  default as ChatContainerCore,
  type ChatContainerCoreProps,
  type ChatContainerCoreHandle,
  type ChatContainerCoreMessageRendererParams,
} from "./ChatContainerCore";
// 工具卡片通用件与工具交互（审批条、提问卡）：桌面与浏览器扩展共用，宿主经 configureToolInteractions 接入
export * from "./components/ToolCard";
export * from "./interactions";

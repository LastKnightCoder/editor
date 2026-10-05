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

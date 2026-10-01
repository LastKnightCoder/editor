/**
 * 桌面对话 UI 共享层（D-048）：消息、思考、工具调用、代码块、markdown 组件。
 * 对话页、停靠栏与项目 / PDF / 视频笔记等域内对话共用；@tau/shared 的同名旧组件留给浏览器扩展。
 */

export { MessageView } from "./MessageView";
export type {
  MessageViewProps,
  MessageViewImage,
  MessageViewFile,
  MessageMarkdownParams,
} from "./MessageView";
export { ReasoningBlock, formatElapsed } from "./ReasoningBlock";
export { ToolCallBlock, ToolCallRow, toolStatusText, formatToolDuration } from "./ToolCallRow";
export { FoldRow, FoldBody } from "./FoldRow";
export { CodeBlock, normalizeCodeLanguage, usePrismHighlighter } from "./CodeBlock";
export { tauPrismTheme } from "./prismTheme";
export { useChatMarkdownComponents } from "./useChatMarkdownComponents";

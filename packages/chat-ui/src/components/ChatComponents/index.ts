// 类型
export type {
  ToolCallStatus,
  ToolCallExecutionState,
  ToolCallPayload,
  ContentBlockType,
  TextContentBlock,
  ReasoningContentBlock,
  ToolCallsContentBlock,
  ContentBlock,
  MessageRole,
  ChatMessage as ChatMessageType,
} from "@tau/shared/chat-renderers";
export type { ToolCallCustomRenderer, ToolCallCustomRendererProps } from "../../../renderers";

// 组件
export {
  ToolCallDisplay,
  type ToolCallDisplayProps,
  type ToolCallDefaultItemRenderParams,
} from "./ToolCallDisplay";
export {
  ChatMarkdownRenderer,
  CodeBlockPreviewCard,
  buildCodeBlockPreviewPayload,
  type ChatMarkdownRendererProps,
  type CodeBlockPreviewPayload,
  type CodeBlockPreviewCardProps,
} from "./ChatMarkdownRenderer";
export {
  toolCallRendererRegistry,
  registerToolCallRenderer,
  registerToolCallRenderers,
  unregisterToolCallRenderer,
  getToolCallRenderer,
} from "../../../renderers";
export {
  buildLegacyAssistantDisplayBlocks,
  getDisplayTextFromBlocks,
} from "@tau/shared/chat-renderers";

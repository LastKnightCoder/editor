export { If } from "@tau/ui";
export { default as For } from "./components/For";
export { PortalToBody } from "@tau/ui";
export { ErrorBoundary } from "@tau/ui";
export { default as EditText } from "./components/EditText";
export { default as ResizeHandle } from "./components/ResizeHandle";
export { default as ModernTabs } from "./components/ModernTabs";
export {
  default as VideoPlayer,
  type VideoPlayerProps,
} from "./components/MediaPlayer/VideoPlayer";
export {
  default as AudioPlayer,
  type AudioPlayerProps,
  type AudioPlayerFooterContext,
} from "./components/MediaPlayer/AudioPlayer";
export { formatTime } from "./components/MediaPlayer/formatTime";
export { default as CustomCheckbox } from "./components/CustomCheckbox";
export { default as SelectDropDown } from "./components/SelectDropDown";
export { default as Webview } from "./components/Webview";
export type { EditTextHandle } from "./components/EditText";
export type { WebviewRef, WebviewProps } from "./components/Webview";
export { default as FullscreenPortal } from "./components/FullscreenPortal";
export { default as LazySyntaxHighlighter } from "./components/LazySyntaxHighlighter";

// Remark 插件
export { default as remarkDocumentReference } from "./utils/remark-document-reference";
export {
  extractMentionRefsFromText,
  findActiveMentionQuery,
  parseContentLinkAttributes,
  serializeMentionRef,
  type MentionQueryMatch,
} from "./utils/chat-mentions";
export {
  DEFAULT_CHAT_INPUT_PLACEHOLDER,
  resolveChatInputModifierLabel,
  resolveChatInputPlaceholder,
} from "./utils/chat-input-placeholder";
export {
  CODE_BLOCK_LANGUAGE_OPTIONS,
  normalizeCodeBlockLanguageDisplayName,
  type CodeBlockLanguageOption,
} from "./utils/code-block-language";
export { markdownCustomDirectives } from "./utils/markdown-custom-directives";
export {
  CONTENT_ELEMENT_TYPES,
  PRIVATE_BLOCK_TYPES,
  privateBlockPlaceholderText,
  type ContentElementType,
} from "./utils/editor-element-coverage";

// ChatInputArea 组件
export {
  default as ChatInputArea,
  type ChatDropdownItem,
  type ChatInputAreaHandle,
  type ChatInputAreaProps,
  type ChatInputAreaServices,
  type ThinkingLevel,
  type MessageContentItem,
  type MentionEntityType,
  type MentionRef,
  type ChatContextUsage,
} from "./components/ChatInputArea";

// 对话输入框部件（＋ 添加面板、上下文用量环、工具行 chip），桌面与浏览器扩展共用
export * from "./components/ChatComposer";

// 聊天展示投影与消息类型
export {
  getDisplayTextFromBlocks,
  type ContentBlockType,
  type TextContentBlock,
  type ReasoningContentBlock,
  type ToolCallsContentBlock,
  type MessageRole,
  type ChatMessageType,
} from "./chat-renderers";

export {
  Role,
  type TextContent,
  type ImageContent,
  type FileContent,
  type MessageContent,
  type ProviderMetadata,
  type ToolCallStatus,
  type ToolCallPayload,
  type ToolCallExecutionState,
  type AssistantBlockState,
  type AssistantTextBlock,
  type AssistantReasoningBlock,
  type AssistantToolCallBlock,
  type AssistantBlock,
  type ResponseContentBlock,
  type ContentBlock,
  type ModelUsage,
  type RequestMessage,
  type ResponseMessage,
  type ChatSessionMessage,
  type ChatSessionRecord,
  type ChatGroup,
  type CreateChatGroup,
  type UpdateChatGroup,
} from "./chat-core/messages";

export { createChatMessageClientId } from "./chat-core/messageSchema";

export {
  syncAssistantDerivedFields,
  ensureAssistantMessage,
  getAssistantToolExecutions,
  getAssistantContentBlocks,
  createAssistantMessage,
  applyAssistantTextSnapshot,
  applyAssistantReasoningSnapshot,
  applyAssistantToolCallsSnapshot,
  finalizeAssistantTurn,
  applyAssistantProviderMetadataSnapshot,
  buildAssistantHistoryMessages,
} from "./chat-core/assistantBlocks";

export {
  applyChatStreamEvent,
  type ChatStreamEvent,
  type ChatStreamTurnEvent,
  type ChatStreamRunEvent,
} from "./chat-core/streamEvents";

export {
  AI_RUN_METHODS,
  createRunEventFilter,
  type AiRunApprovalRequest,
  type AiRunEvent,
  type AiRunEventNotification,
  type AiRunQuestionRequest,
  type AiRunStartParams,
  type AiRunSnapshot,
  type AiRunStateResult,
} from "./chat-core/aiRunProtocol";

export { APPEARANCE_METHODS, type AppearanceThemePayload } from "./appearanceProtocol";

export { BUILT_IN_VIEW_TYPES } from "./types/database";

export type {
  ColumnDef,
  CellValue,
  RowData,
  DataTable,
  DatabaseData,
  DataTableViewType,
  GalleryViewConfig,
  CalendarViewConfig,
  KanbanViewConfig,
  KanbanCardTemplate,
  KanbanCardDisplayConfig,
  TableViewConfig,
  DataTableView,
  CreateDataTableView,
  UpdateDataTableView,
  FilterLogicOperator,
  FilterCondition,
  FilterGroup,
  FilterNode,
  SortRule,
  GroupRule,
  GroupGranularity,
  ValidationRule,
  DatabaseHookResult,
} from "./types/database";

export {
  useBilibiliVideo,
  useBilibiliVideoWithContext,
  BilibiliVideoDepsProvider,
  type UseBilibiliVideoDeps,
  type UseBilibiliVideoResult,
  type BiliBiliVideoMetaInfo,
  type StreamProgress,
  type StreamProgress as BilibiliStreamProgress,
  type BilibiliCacheProgress,
} from "./hooks/useBilibiliVideo";

export {
  useYoutubeVideo,
  useYoutubeVideoWithContext,
  YoutubeVideoDepsProvider,
  type UseYoutubeVideoDeps,
  type UseYoutubeVideoResult,
  type YouTubeVideoMetaInfo,
  type StreamProgress as YoutubeStreamProgress,
  type YoutubeCacheProgress,
  type StreamOption,
} from "./hooks/useYoutubeVideo";

export {
  useEditDatabase,
  useEditDatabaseWithContext,
  EditDatabaseDepsProvider,
  type UseEditDatabaseDeps,
  type UseEditDatabaseResult,
} from "./hooks/useEditDatabase";

export {
  default as useChatAutoScroll,
  type ScrollToBottomOptions,
  type UseChatAutoScrollOptions,
} from "./hooks/useChatAutoScroll";

export {
  useRemoteVideo,
  useRemoteVideoWithContext,
  RemoteVideoDepsProvider,
  type UseRemoteVideoDeps,
  type UseRemoteVideoResult,
  type RemoteVideoStreamProgress,
  type RemoteVideoCacheProgress,
} from "./hooks/useRemoteVideo";
export { useDocumentTheme } from "./hooks/useDocumentTheme";

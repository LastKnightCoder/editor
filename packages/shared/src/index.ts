export { default as If } from "./components/If";
export { default as For } from "./components/For";
export { default as PortalToBody } from "./components/PortalToBody";
export { default as ErrorBoundary } from "./components/ErrorBoundary";
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
} from "./components/MediaPlayer/AudioPlayer";
export { formatTime } from "./components/MediaPlayer/formatTime";
export { default as CustomCheckbox } from "./components/CustomCheckbox";
export { default as ImageGallery } from "./components/ImageGallery";
export { default as SelectDropDown } from "./components/SelectDropDown";
export { default as Webview } from "./components/Webview";
export type { EditTextHandle } from "./components/EditText";
export type { WebviewRef, WebviewProps } from "./components/Webview";
export { default as Katex } from "./components/Katex";
export { default as ImageCropper } from "./components/ImageCropper";
export { default as FullscreenPortal } from "./components/FullscreenPortal";
export { default as LazySyntaxHighlighter } from "./components/LazySyntaxHighlighter";
export {
  default as MarkdownRenderer,
  type MarkdownRendererProps,
} from "./components/MarkdownRenderer";

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
  ContextUsageIndicator,
  getContextUsageSummary,
  formatTokenCount,
  resolveNewChatTooltipOpen,
  shouldCloseNewChatTooltip,
} from "./components/ChatInputArea";

// 聊天组件
export {
  StatusBadge,
  ToolCallDisplay,
  ChatToolCallDisplay,
  ChatToolCallDefaultItem,
  ReasoningDisplay,
  ChatMessage,
  ChatMarkdownRenderer,
  CodeBlockPreviewCard,
  buildCodeBlockPreviewPayload,
  ChatMessageView,
  toolCallRendererRegistry,
  registerToolCallRenderer,
  registerToolCallRenderers,
  unregisterToolCallRenderer,
  getToolCallRenderer,
  buildLegacyAssistantDisplayBlocks,
  getDisplayTextFromBlocks,
  type StatusBadgeProps,
  type ToolCallDisplayProps,
  type ToolCallDefaultItemRenderParams,
  type ChatToolCallDisplayProps,
  type ChatToolCallDefaultItemProps,
  type ReasoningDisplayProps,
  type ChatMessageProps,
  type ChatMarkdownRendererProps,
  type CodeBlockPreviewPayload,
  type CodeBlockPreviewCardProps,
  type ChatMessageViewProps,
  type ChatMessageViewFile,
  type ChatMessageViewImage,
  type ChatMessageViewMarkdownRenderParams,
  type ToolCallCustomRenderer,
  type ToolCallCustomRendererProps,
  type ContentBlockType,
  type TextContentBlock,
  type ReasoningContentBlock,
  type ToolCallsContentBlock,
  type MessageRole,
  type ChatMessageType,
} from "./components/ChatComponents";

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

export {
  CHAT_MESSAGE_SCHEMA_VERSION,
  createChatMessageClientId,
  migrateAssistantMessage,
  migrateChatSessionMessages,
  getAssistantToolExecutionsFromBlocks,
} from "./chat-core/messageSchema";

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

export type { CropperTransform, ImageCropperProps } from "./components/ImageCropper/types";

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

export {
  default as ChatContainerCore,
  type ChatContainerCoreProps,
  type ChatContainerCoreHandle,
  type ChatContainerCoreMessageRendererParams,
} from "./chat-core/ChatContainerCore";

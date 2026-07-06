export { default as If } from "./components/If";
export { default as For } from "./components/For";
export { default as PortalToBody } from "./components/PortalToBody";
export { default as ErrorBoundary } from "./components/ErrorBoundary";
export { default as EditText } from "./components/EditText";
export { default as ResizeHandle } from "./components/ResizeHandle";
export { default as ModernTabs } from "./components/ModernTabs";
export { default as CustomCheckbox } from "./components/CustomCheckbox";
export { default as ImageGallery } from "./components/ImageGallery";
export { default as CustomModal } from "./components/CustomModal";
export { default as SelectDropDown } from "./components/SelectDropDown";
export type { ThemeColors } from "./components/CustomModal";
export { default as showCustomModal } from "./components/CustomModal/showCustomModal";
export { default as Webview } from "./components/Webview";
export type { EditTextHandle } from "./components/EditText";
export type { WebviewRef, WebviewProps } from "./components/Webview";
export {
  default as WebviewUrlInputForm,
  type WebviewUrlInputFormProps,
  type WebviewUrlInputFormServices,
  type WebviewUrlInputFormNotify,
  type WebviewUrlSourceType,
} from "./components/WebviewUrlInputForm";
export { default as Katex } from "./components/Katex";
export { default as PlantUML } from "./components/PlantUML";
export { default as TikZ } from "./components/TikZ";
export { default as Typst } from "./components/Typst";
export { default as ImageCropper } from "./components/ImageCropper";
export { default as FullscreenPortal } from "./components/FullscreenPortal";
export { default as LazySyntaxHighlighter } from "./components/LazySyntaxHighlighter";
export { default as MermaidRenderer } from "./components/MermaidRenderer";
export type { MermaidRendererProps } from "./components/MermaidRenderer";
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
export {
  MERMAID_THEME_NAMES,
  detectMermaidDiagramType,
  renderMermaidWithFallback,
  type MermaidThemeName,
  type MermaidRenderStyle,
  type MermaidRenderPreference,
  type MermaidDisplayMode,
  type MermaidRenderEngine,
  type MermaidDiagramType,
  type MermaidRenderResult,
} from "./utils/mermaid-render-core";

// ChatInputArea 组件
export {
  default as ChatInputArea,
  type ChatInputAreaHandle,
  type ChatInputAreaProps,
  type ChatInputAreaServices,
  type ReasoningEffort,
  type IResource as ChatInputResource,
  type IResourceSource as ChatInputResourceSource,
  type CreateResourceParams as ChatInputCreateResourceParams,
  type MessageContentItem,
  type MentionEntityType,
  type MentionRef,
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
  type ToolCallStatus,
  type ToolCallExecutionState,
  type ToolCallPayload,
  type ContentBlockType,
  type TextContentBlock,
  type ReasoningContentBlock,
  type ToolCallsContentBlock,
  type ContentBlock,
  type MessageRole,
  type ChatMessageType,
} from "./components/ChatComponents";

export type {
  CropperTransform,
  ImageCropperProps,
} from "./components/ImageCropper/types";

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

export type {
  ChatSessionCore,
  ChatModelCore,
  ChatModelFeaturesCore,
  ChatProviderCore,
} from "./chat-core/types";
export type {
  ChatRuntimeAdapter,
  ChatRuntimeSettings,
  ChatRuntimeCallbacks,
  ChatRuntimeStream,
} from "./chat-core/runtime";
export {
  default as ChatContainerCore,
  type ChatContainerCoreProps,
  type ChatContainerCoreHandle,
  type ChatContainerCoreMessageRendererParams,
} from "./chat-core/ChatContainerCore";

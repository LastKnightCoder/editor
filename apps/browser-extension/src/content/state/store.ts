import { create } from "zustand";
import type {
  AiRunApprovalRequest,
  AiRunQuestionRequest,
  ChatSessionMessage,
} from "@tau/shared/chat-core";
import type { HighlightColor, ModelOption, WebAnnotation } from "@tau/shared/browser-companion";
import type { ConnectionStatus } from "../../shared/messages";

export type PanelTab = "chat" | "annotations" | "note";
export type QuickKind = "explain" | "translate" | "summarize";

export interface Rect {
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
}

export const toRect = (rect: DOMRect | Rect): Rect => ({
  top: rect.top,
  left: rect.left,
  bottom: rect.bottom,
  right: rect.right,
  width: rect.width,
  height: rect.height,
});

/** 选中的文字（新选区或点中的已有标注） */
export interface SelectionTarget {
  rect: Rect;
  text: string;
  /** 已有标注：工具条换成换色 / 批注 / 删除 */
  annotationId: string | null;
  /** 选区所在段落编号（问 AI 时带上，便于引用） */
  block: number | null;
}

export interface QuoteContext {
  text: string;
  block: number | null;
}

export interface QuickBubble {
  kind: QuickKind;
  quote: QuoteContext;
  rect: Rect;
  runId: string | null;
  text: string;
  status: "streaming" | "done" | "error";
  error?: string;
}

export interface ChatState {
  loaded: boolean;
  sessionId: string;
  messages: ChatSessionMessage[];
  runId: string | null;
  error: string | null;
  quote: QuoteContext | null;
  usePage: boolean;
  useAnnotations: boolean;
  models: ModelOption[];
  model: ModelOption | null;
  /** Tau 推来的等待项（工具审批、ask-question），按 toolCallId 对应到工具行 */
  approvals: AiRunApprovalRequest[];
  questions: AiRunQuestionRequest[];
}

export interface CompanionState {
  status: ConnectionStatus;
  /** 当前页面地址（SPA 路由变化时更新） */
  pageUrl: string;
  panelOpen: boolean;
  tab: PanelTab;
  side: "left" | "right";
  /** 悬浮球中心离视口顶部的比例（0–1），按站点记忆 */
  orbRatio: number;
  hiddenOnSite: boolean;
  coachSeen: boolean;
  annotations: WebAnnotation[];
  /** 页面上找不到原文的标注 id */
  unlocated: string[];
  filter: HighlightColor | null;
  selection: SelectionTarget | null;
  editingNoteId: string | null;
  pinnedNoteId: string | null;
  hoverNoteId: string | null;
  bubble: QuickBubble | null;
  chat: ChatState;
  toast: string | null;
  /** 滚动 / 尺寸 / DOM 变化后递增，页边标记据此重算位置 */
  layoutVersion: number;
}

export const initialChat = (sessionId: string): ChatState => ({
  loaded: false,
  sessionId,
  messages: [],
  runId: null,
  error: null,
  quote: null,
  usePage: true,
  useAnnotations: false,
  models: [],
  model: null,
  approvals: [],
  questions: [],
});

export const useCompanion = create<CompanionState>()(() => ({
  status: { state: "unpaired" },
  pageUrl: "",
  panelOpen: false,
  tab: "chat",
  side: "right",
  orbRatio: 0.62,
  hiddenOnSite: false,
  coachSeen: true,
  annotations: [],
  unlocated: [],
  filter: null,
  selection: null,
  editingNoteId: null,
  pinnedNoteId: null,
  hoverNoteId: null,
  bubble: null,
  chat: initialChat(""),
  toast: null,
  layoutVersion: 0,
}));

export const setState = useCompanion.setState;
export const getState = useCompanion.getState;

export const patchChat = (patch: Partial<ChatState> | ((chat: ChatState) => Partial<ChatState>)) =>
  setState(state => ({
    chat: { ...state.chat, ...(typeof patch === "function" ? patch(state.chat) : patch) },
  }));

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export const showToast = (message: string) => {
  setState({ toast: message });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setState({ toast: null }), 2400);
};

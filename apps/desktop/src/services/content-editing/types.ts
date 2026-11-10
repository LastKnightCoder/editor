import type { ContentEditState } from "@/commands/content";
import { Descendant } from "slate";
import type { PositionMapper } from "@tau/markdown";

export type EntityType =
  | "card"
  | "article"
  | "project-item"
  | "diary-moment"
  | "vl-note"
  | "vl-resource"
  | "whiteboard";
export type SnapshotSource = "active-session" | "database";

export interface MarkdownPoint {
  line: number;
  ch: number;
}

export interface SerializedPoint {
  path: number[];
  offset: number;
}

export interface SerializedSelection {
  anchor: SerializedPoint;
  focus: SerializedPoint;
  isCollapsed: boolean;
}

export interface ContentSnapshot {
  editState?: Pick<ContentEditState, "state" | "identity"> & {
    contentId: number;
    databaseName: string;
    selection?: SerializedSelection;
  };
  revision?: string;
  id: string;
  createdAt: number;
  content: Descendant[];
  markdown: string;
  hash: string;
  lineOffsets: number[];
  positionMap: PositionMapper;
  source: SnapshotSource;
}

export interface ActiveEditingSession {
  id: string;
  contentId: number;
  entityType: EntityType;
  entityId: number | string;
  tabType?: string;
  focused: boolean;
  selection: SerializedSelection | null;
  snapshot: ContentSnapshot;
  updatedAt: number;
  focusedAt: number;
}

export type EditLocator =
  | { kind: "full-document" }
  | { kind: "markdown-range"; start: MarkdownPoint; end: MarkdownPoint }
  | { kind: "slate-path"; path: number[] }
  | { kind: "active-selection" }
  | { kind: "active-block" }
  | { kind: "match-id"; matchId: string };

interface BaseEditOperation {
  id?: string;
  locator: EditLocator;
  /** 一句话说明为什么改（有出处附上），随逐条建议展示给用户 */
  reason?: string;
}

export interface InsertOperation extends BaseEditOperation {
  op: "insert";
  text: string;
  position?: "start" | "end" | "before" | "after";
}

export interface DeleteOperation extends BaseEditOperation {
  op: "delete";
}

export interface ReplaceOperation extends BaseEditOperation {
  op: "replace";
  text: string;
  expectedText?: string;
}

export type EditOperation = InsertOperation | DeleteOperation | ReplaceOperation;

export interface ResolvedOffsetRange {
  start: number;
  end: number;
  locator: EditLocator;
}

export interface AppliedPatch {
  operationId: string;
  op: EditOperation["op"];
  start: number;
  end: number;
  beforeText: string;
  afterText: string;
  charDelta: number;
}

export interface EditApplyResult {
  markdown: string;
  hash: string;
  patches: AppliedPatch[];
}

export type ContentEditProposalStatus =
  | "pending_review"
  | "applied"
  | "rejected"
  | "superseded"
  | "restored"
  | "apply_conflicted";

export interface ContentEditChangePreview {
  operationId: string;
  op: EditOperation["op"];
  beforeTextPreview: string;
  afterTextPreview: string;
  charDelta: number;
}

export interface ContentEditDiffSummary {
  patchCount: number;
  insertedChars: number;
  deletedChars: number;
  changePreviews: ContentEditChangePreview[];
}

export interface ContentEditProposalRecord {
  databaseName?: string;
  proposalId: string;
  conversationKey: string;
  contentId: number;
  sourceToolName: string;
  status: ContentEditProposalStatus;
  beforeMarkdown?: string;
  beforeHash: string;
  afterHash: string;
  snapshotId: string;
  snapshotSource: SnapshotSource;
  targetSource: ResolvedContentTarget["source"];
  proposalFilePath: string;
  diffSummary: ContentEditDiffSummary;
  patches: AppliedPatch[];
  createdAt: number;
  updatedAt: number;
  checkpointId?: string;
  feedbackHistory: string[];
  lastError?: string;
  commitPending?: boolean;
  agentLabel?: string;
  /** 已拆成逐条建议，状态以主进程建议记录为准 */
  suggestions?: boolean;
}

export interface ContentEditCheckpointRecord {
  databaseName?: string;
  checkpointId: string;
  proposalId: string;
  contentId: number;
  beforeHash: string;
  afterHash: string;
  filePath: string;
  /** 逐条建议的检查点：撤销这些已接受的条目，不读缓存文件 */
  suggestionIds?: string[];
  createdAt: number;
  updatedAt: number;
  restoredAt?: number;
  lastRestoreError?: string;
}

export interface ContentEditProposalCachePayload {
  markdown: string;
  baseline?: import("@tau/collaboration").ScopedContentBaseline;
}

export type ContentEditCheckpointCachePayload = {
  content: Descendant[];
  markdown: string;
  hash: string;
};

export interface ContentEditRendererPayload {
  kind: "content-edit-proposal";
  proposalId: string;
  conversationKey: string;
  contentId: number;
  sourceToolName: string;
  status: ContentEditProposalStatus;
  beforeHash: string;
  afterHash: string;
  snapshotId: string;
  diffSummary: ContentEditDiffSummary;
  patches: AppliedPatch[];
  checkpointId?: string;
  targetSource: ResolvedContentTarget["source"];
  lastError?: string;
  createdAt: number;
  updatedAt: number;
  beforeMarkdown?: string;
  proposedMarkdown?: string;
  matched?: {
    start: number;
    end: number;
    confidence: number;
    matchId: string;
  };
}

export type ContentEditReviewDecisionAction = "apply" | "reject" | "feedback";

export interface ContentEditReviewDecision {
  action: ContentEditReviewDecisionAction;
  feedback?: string;
  submittedAt: number;
}

export type ContentEditReviewSessionStatus = "pending" | "submitted" | "completed" | "cancelled";

export interface ContentEditReviewSessionRecord {
  sessionId: string;
  toolCallId: string;
  toolName: string;
  conversationKey: string;
  rawInput: string;
  proposalId: string;
  payload: ContentEditRendererPayload;
  status: ContentEditReviewSessionStatus;
  decision?: ContentEditReviewDecision;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  cancelReason?: string;
}

export interface ContentEditReviewToolResult {
  type: "content-edit-review-result";
  action: "applied" | "rejected" | "feedback";
  submittedAt: number;
  contentId: number;
  message: string;
  proposalId: string;
  conversationKey: string;
  checkpointId?: string;
  feedback?: string;
  /** 逐条处理结果；部分接受时 action 为 applied，Agent 据此只重做退回的条目 */
  items?: {
    id: string;
    status: import("@/types/content-suggestion").ContentSuggestionStatus;
    blockId?: string;
    beforeText: string;
    afterText: string;
    feedback?: string;
    error?: string;
  }[];
  proposal?: {
    sourceToolName: string;
    proposedMarkdown?: string;
    diffSummary: ContentEditDiffSummary;
    patches: AppliedPatch[];
  };
}

export interface RangeCandidate {
  matchId: string;
  snapshotId: string;
  start: number;
  end: number;
  excerpt: string;
  confidence: number;
}

export interface ResolvedContentTarget {
  contentId: number;
  entityType?: EntityType;
  entityId?: number | string;
  /** 激活编辑会话（active-session 来源）或旧宿主透传的标识 */
  sessionId?: string;
  /** 编辑宿主的种类标签（旧 Tab 体系遗留的自由字符串，仅作诊断透传） */
  tabType?: string;
  source: "explicit" | "active-session";
}

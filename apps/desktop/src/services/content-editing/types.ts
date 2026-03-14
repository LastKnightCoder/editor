import { Descendant } from "slate";
import { TabType } from "@/types/tab";
import { PositionMapper } from "@/utils/positionMapper";

export type EntityType = "card" | "article" | "document-item" | "project-item";
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
  entityId: number;
  tabId?: string;
  paneId?: string;
  tabType?: TabType;
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

export type EditOperation =
  | InsertOperation
  | DeleteOperation
  | ReplaceOperation;

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

export type ContentWritePermission = "review_required" | "auto_apply_allowed";

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
  proposalId: string;
  conversationKey: string;
  contentId: number;
  sourceToolName: string;
  status: ContentEditProposalStatus;
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
}

export interface ContentEditCheckpointRecord {
  checkpointId: string;
  proposalId: string;
  contentId: number;
  beforeHash: string;
  afterHash: string;
  filePath: string;
  createdAt: number;
  updatedAt: number;
  restoredAt?: number;
  lastRestoreError?: string;
}

export interface ContentEditProposalCachePayload {
  markdown: string;
}

export interface ContentEditCheckpointCachePayload {
  content: Descendant[];
  markdown: string;
  hash: string;
}

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
  currentPermission: ContentWritePermission;
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

export type ContentEditReviewSessionStatus =
  | "pending"
  | "submitted"
  | "completed"
  | "cancelled";

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
  entityId?: number;
  tabId?: string;
  paneId?: string;
  tabType?: TabType;
  source: "explicit" | "active-session" | "active-tab";
}

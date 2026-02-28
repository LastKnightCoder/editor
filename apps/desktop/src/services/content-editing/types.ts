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

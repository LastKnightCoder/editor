import type Database from "better-sqlite3";
import type { IpcMainInvokeEvent } from "electron";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import type { ContentSessionTarget, ContentSessionSnapshot } from "@tau/collaboration";
import type { CollaborationSession, CollaborationState, ContentNode } from "@tau/collaboration";
import type { CollaborationClient } from "./client";
import type { CollaborationAssetService } from "./asset-service";
import type { CollaborationLocalStore } from "./local-store";
import type { ContentLocalState, InputDraftIdentity } from "./content-local-state";

export interface CollaborationView {
  documentId: string;
  windowId: number;
  clientIds: number[];
  inputIdentity: InputDraftIdentity;
}

export interface RuntimeSession {
  info: CollaborationSession;
  doc: Y.Doc;
  awareness: Awareness;
  assets?: CollaborationAssetService;
  store?: CollaborationLocalStore;
  replaceContent?: (
    content: ContentNode[],
    contracts: import("@tau/db-schema/content-contracts").ContentContractDictionary | undefined,
    expectedRevision: string | undefined
  ) => Promise<void>;
  provider?: HocuspocusProvider;
  dirty: boolean;
  projectionDirty?: boolean;
  drainingViews?: Set<string>;
  /** 宿主补丁在应用和广播前先写入协作缓存。 */
  persistNodeUpdate?: (update: Uint8Array) => void;
  retainNodeState?: (candidate: Y.Doc) => void;
}

export interface CollaborationIpcContext {
  store: CollaborationLocalStore;
  contentState: ContentLocalState;
  client: CollaborationClient;
  assets: CollaborationAssetService;
  serverUrl(): string;
  sessions: Map<string, RuntimeSession>;
  /** 按 documentId 获取当前会话，未加载时读取本机缓存。 */
  findSession(id: string): RuntimeSession | undefined;
  views: Map<string, CollaborationView>;
  state(): CollaborationState;
  changed(session?: RuntimeSession): void;
  refresh(): Promise<void>;
  databaseForEvent(event: IpcMainInvokeEvent): { db: Database.Database; name: string };
  requireSession(id: string): RuntimeSession;
  whiteboardRoom(id: string): import("@tau/collaboration").SharedWhiteboardInfo | undefined;
  openContent(
    event: IpcMainInvokeEvent,
    target: ContentSessionTarget
  ): Promise<ContentSessionSnapshot>;
  acknowledgeFreeze(viewId: string, requestId?: string): void;
  prepareLeave(session: RuntimeSession): Promise<void>;
  createContent(
    event: IpcMainInvokeEvent,
    contentId: number,
    sourceType?: string,
    sourceId?: number,
    sourceTitle?: string
  ): Promise<{ documentId: string; code: string }>;
  /** 签发协作码并缓存明文（服务器只存哈希） */
  issueInvitation(
    serverUrl: string,
    documentId: string
  ): Promise<{ code: string; expiresAt: number }>;
  removeView(id: string): void;
  clearBinding(session: RuntimeSession, discard?: boolean): Promise<void>;
  discardLocal(session: RuntimeSession): Promise<void>;
  removeSession(session: RuntimeSession): Promise<void>;
  finishLeave(session: RuntimeSession): Promise<void>;
  flushResources(): Promise<void>;
}

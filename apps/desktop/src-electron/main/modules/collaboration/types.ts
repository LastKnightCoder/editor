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

export interface RuntimeSession {
  info: CollaborationSession;
  doc: Y.Doc;
  awareness: Awareness;
  privateNodes: Map<string, ContentNode>;
  /** 视图上报的激活 Tab（tabs 块 collabId → pane tabKey），落库投影时合并 */
  viewActiveTabs: Map<string, string>;
  provider?: HocuspocusProvider;
  dirty: boolean;
  projectionDirty?: boolean;
  drainingViews?: Set<string>;
}

export interface CollaborationIpcContext {
  store: CollaborationLocalStore;
  client: CollaborationClient;
  assets: CollaborationAssetService;
  serverUrl(): string;
  sessions: Map<string, RuntimeSession>;
  views: Map<string, { documentId: string; windowId: number; clientIds: number[] }>;
  state(): CollaborationState;
  changed(session?: RuntimeSession): void;
  refresh(): Promise<void>;
  databaseForEvent(event: IpcMainInvokeEvent): { db: Database.Database; name: string };
  requireSession(id: string): RuntimeSession;
  noteActiveTab(session: RuntimeSession, blockId: string, tabKey: string): void;
  openContent(event: IpcMainInvokeEvent, target: ContentSessionTarget): ContentSessionSnapshot;
  acknowledgeFreeze(viewId: string): void;
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
  removeSession(session: RuntimeSession): void;
  finishLeave(session: RuntimeSession): Promise<void>;
  flushResources(): Promise<void>;
}

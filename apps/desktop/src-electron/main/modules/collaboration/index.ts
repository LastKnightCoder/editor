import {
  ContentSessionRuntime,
  type ContentDatabase,
  type ContentRuntimeStorage,
} from "../content-runtime";
import type { ContentOpenContext, LocalContentSharingAccess } from "../content-runtime/sharing";
import { getLocalContentRuntime } from "../content-runtime/composition";
import { createDesktopContentServices } from "../content-runtime/desktop-services";
import {
  DEFAULT_COLLABORATION_URL,
  type ContentSessionTarget,
  type ContentSessionSnapshot,
  type CollaborationState,
  type JoinRequest,
  type ScopedContentSubmission,
  type ScopedContentResult,
  type SharedDocumentInfo,
  type SharedDocumentListing,
  type SourceBinding,
  type SourceType,
} from "@tau/collaboration";
import type { IpcMainInvokeEvent } from "electron";
import type { HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import type { WebSocket } from "ws";
import { join } from "node:path";
import PathUtil from "../../utils/PathUtil";
import databaseModule from "../database";
import { restoreContentBinding } from "./content-repository";
import { CollaborationAssetService } from "./asset-service";
import { CollaborationClient } from "./client";
import { registerCollaborationIpc } from "./ipc-controller";
import type { RuntimeSession } from "./types";
import { CollaborationLocalStore } from "./local-store";
import type { ScopedWriteOptions } from "../content-runtime/agent/suggestion-service";
import { getDevelopmentServerUrl } from "./dev-server";
import { SharedContentReplacement } from "./shared-content-replacement";
import { contentSession } from "./content-sessions";
import {
  openSharedContent,
  finishOpenedPublish,
  state,
  roomAddress,
  assertContentRoom,
  openRoom,
  connectEvents,
  listRooms,
  refresh,
  refreshRooms,
  syncRemoteDocument,
  openRemoteDocument,
  loadRemoteDocument,
} from "./rooms";
import { transport, attach } from "./connections";
import { createContent, publishSession, issueInvitation } from "./publication";
import {
  prepareLeave,
  demoteSession,
  clearBinding,
  discardLocal,
  removeSession,
  revoke,
  finishLeave,
  persistBeforeClose,
} from "./closure";
import { flushResources, preserveOwnerImages } from "./resource-sync";
import { readSharedAgentState, submitSharedAgentEdit } from "./agent-edits";

type SharedContentSessions = Pick<
  ContentSessionRuntime,
  | "activeSession"
  | "activeSessions"
  | "acknowledgeFreeze"
  | "broadcast"
  | "changed"
  | "databaseForEvent"
  | "discardRemoteSession"
  | "find"
  | "findContent"
  | "findLocalSource"
  | "freeze"
  | "initDurability"
  | "install"
  | "ipcViews"
  | "isProjecting"
  | "loadCached"
  | "project"
  | "removeSession"
  | "removeView"
  | "removeWindowViews"
  | "requireSession"
  | "shutdown"
  | "startAutoFlush"
  | "unfreeze"
>;

export class CollaborationManager {
  name = "collaboration";
  client!: CollaborationClient;
  private replacements!: SharedContentReplacement;
  content!: SharedContentSessions;
  store!: CollaborationLocalStore;
  assets!: CollaborationAssetService;
  transports = new Map<string, HocuspocusProviderWebsocket>();
  events = new Map<string, WebSocket>();
  requests: JoinRequest[] = [];
  refreshing?: Promise<void>;
  readonly remoteDocuments = new Map<string, Map<string, SharedDocumentListing>>();
  readonly listing = new Map<string, Promise<Map<string, SharedDocumentListing>>>();
  readonly openingRooms = new Map<string, Promise<RuntimeSession>>();
  syncingResources = false;
  error?: string;
  stopped = false;
  pendingCreates = new Map<string, Promise<{ documentId: string; code: string }>>();
  finishingLeaves = new Set<string>();
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  private disconnectLocalRuntime?: () => void;

  constructor(private readonly getLocalRuntime: () => LocalContentSharingAccess) {}

  get localRuntime() {
    return this.getLocalRuntime();
  }

  private openSharedContent(
    event: ContentOpenContext,
    target: ContentSessionTarget,
    check: () => void
  ): Promise<ContentSessionSnapshot> {
    return openSharedContent(this, event, target, check);
  }

  finishOpenedPublish(
    db: ContentDatabase["db"],
    source: SourceBinding,
    session: RuntimeSession
  ): Promise<void> {
    return finishOpenedPublish(this, db, source, session);
  }

  private assertReplacementSession(session: RuntimeSession) {
    const { id, mode, serverUrl, status, frozen, leaving, source } = session.info;
    if (
      mode === "local" ||
      status !== "active" ||
      frozen ||
      leaving ||
      this.content.activeSession(id) !== session ||
      !source
    )
      throw new Error("共享正文会话已变化，原候选已保留");
    const db = databaseModule.getDatabase(source.databaseName);
    if (!db?.open || contentSession(db, source.contentId) !== session)
      throw new Error("原资料库或正文绑定已变化，原候选已保留");
    const bound = restoreContentBinding(db, source.databaseName, id, serverUrl);
    if (
      !bound ||
      bound.contentId !== source.contentId ||
      bound.contentCreatedAt !== source.contentCreatedAt
    )
      throw new Error("原资料库或正文绑定已变化，原候选已保留");
    return bound;
  }

  async recoverReplacement(session: RuntimeSession) {
    try {
      if (
        !session.info.source ||
        !this.replacements.hasPending(session.info.serverUrl, session.info.id)
      )
        return;
      if (await this.replacements.recover(session)) await this.content.project(session);
    } catch (error) {
      // 仍在等待回执的候选留在共享库，后续打开、刷新或重试继续查询。
      if (!(error instanceof Error) || !error.message.startsWith("CONTENT_REPLACEMENT_PENDING:"))
        console.warn("[collaboration] 共享正文整篇替换对账未完成", error);
    }
  }

  get serverUrl() {
    return getDevelopmentServerUrl() || DEFAULT_COLLABORATION_URL;
  }
  get nickname() {
    return this.store.get("nickname", "Tau 用户");
  }
  private state(): CollaborationState {
    return state(this);
  }
  roomAddress(id: string): string | undefined {
    return roomAddress(this, id);
  }

  assertContentRoom(room: SharedDocumentListing) {
    return assertContentRoom(this, room);
  }

  private openRoom(id: string): Promise<RuntimeSession> {
    return openRoom(this, id);
  }

  /** 白板发布或加入后立即刷新房间列表，避免等待定时刷新。 */
  refreshShared(): Promise<void> {
    return this.refresh();
  }
  transport(url: string) {
    return transport(this, url);
  }
  private attach(session: RuntimeSession) {
    return attach(this, session);
  }
  private prepareLeave(session: RuntimeSession): Promise<void> {
    return prepareLeave(this, session);
  }

  connectEvents(url: string): Promise<void> {
    return connectEvents(this, url);
  }
  listRooms(url: string) {
    return listRooms(this, url);
  }

  refresh(): Promise<void> {
    return refresh(this);
  }

  refreshRooms(): Promise<void> {
    return refreshRooms(this);
  }

  syncRemoteDocument(url: string, info: SharedDocumentInfo): Promise<void> {
    return syncRemoteDocument(this, url, info);
  }

  openRemoteDocument(url: string, info: SharedDocumentInfo): Promise<RuntimeSession> {
    return openRemoteDocument(this, url, info);
  }

  loadRemoteDocument(url: string, info: SharedDocumentInfo): Promise<RuntimeSession> {
    return loadRemoteDocument(this, url, info);
  }

  private createContent(
    event: IpcMainInvokeEvent,
    contentId: number,
    sourceType?: SourceType,
    sourceId?: number,
    sourceTitle?: string
  ) {
    return createContent(this, event, contentId, sourceType, sourceId, sourceTitle);
  }

  publishSession(
    event: IpcMainInvokeEvent,
    session: RuntimeSession,
    target: { contentId: number; sourceType?: SourceType; sourceId?: number; sourceTitle?: string }
  ) {
    return publishSession(this, event, session, target);
  }

  demoteSession(session: RuntimeSession): Promise<void> {
    return demoteSession(this, session);
  }

  issueInvitation(serverUrl: string, documentId: string) {
    return issueInvitation(this, serverUrl, documentId);
  }

  private flushResources(): Promise<void> {
    return flushResources(this);
  }

  private readSharedAgentState(session: RuntimeSession) {
    return readSharedAgentState(this, session);
  }

  private submitSharedAgentEdit(
    session: RuntimeSession,
    request: ScopedContentSubmission,
    updateHash: string,
    check: () => void,
    { signal, undo }: ScopedWriteOptions
  ): Promise<ScopedContentResult> {
    return submitSharedAgentEdit(this, session, request, updateHash, check, { signal, undo });
  }

  preserveOwnerImages(session: RuntimeSession, references?: Iterable<string>) {
    return preserveOwnerImages(this, session, references);
  }

  /** 解除本地绑定并递增发布代次。discard=true（丢弃本地改动退出）时跳过最后的
   *  投影与进行中检查——丢弃语义下不应再写库，绑定清理必须尽力完成。 */
  clearBinding(session: RuntimeSession, discard = false): Promise<void> {
    return clearBinding(this, session, discard);
  }
  discardLocal(session: RuntimeSession): Promise<void> {
    return discardLocal(this, session);
  }
  removeSession(session: RuntimeSession): Promise<void> {
    return removeSession(this, session);
  }
  revoke(session: RuntimeSession, reason: "closed" | "revoked"): Promise<void> {
    return revoke(this, session, reason);
  }
  finishLeave(session: RuntimeSession): Promise<void> {
    return finishLeave(this, session);
  }

  persistBeforeClose(session: RuntimeSession): Promise<void> {
    return persistBeforeClose(this, session);
  }

  documentClient(): CollaborationClient {
    if (!this.client) throw new Error("文档传输服务未就绪");
    return this.client;
  }

  private initializeContentRuntime(storage: ContentRuntimeStorage) {
    this.store = storage.store;
    this.assets = storage.assets;
    this.replacements = new SharedContentReplacement(
      storage.store,
      storage.contentState,
      storage.nodeUpdates,
      () => this.client,
      session => this.assertReplacementSession(session)
    );
    this.content = new ContentSessionRuntime(storage, {
      attach: session => this.attach(session),
      broadcastState: () => this.content.broadcast("collaboration:state", this.state()),
      flushResources: () => void this.flushResources(),
      preserveOwnerImages: session => this.preserveOwnerImages(session),
      retryReplacement: this.replacements.retry.bind(this.replacements),
      submitReplacement: this.replacements.submit.bind(this.replacements),
      scheduleSuggestionValidation: (workspaceId, contentId, document) =>
        this.localRuntime.scheduleSuggestionValidation(workspaceId, contentId, document),
    });
  }

  async init() {
    const appDirectory = PathUtil.getAppDir();
    const store = new CollaborationLocalStore(join(appDirectory, "collaboration"));
    this.client = new CollaborationClient(store);
    const assets = new CollaborationAssetService(store, appDirectory, url =>
      this.client.identity(url)
    );
    const storage = createDesktopContentServices(store, assets);
    this.initializeContentRuntime(storage);
    // 打不开的缓存由 loadCached 备份后丢弃，共享会话随后按远端快照重建，本机正文按主库重建
    for (const info of this.store.list()) {
      if (
        info.mode !== "local" &&
        (info.role === "owner" ||
          info.pending ||
          info.leaving ||
          this.assets.hasPending(info.id) ||
          this.replacements.hasPending(info.serverUrl, info.id))
      )
        this.content.loadCached(info.id, info);
    }
    this.content.initDurability();
    registerCollaborationIpc({
      nodeUpdates: storage.nodeUpdates,
      store: this.store,
      contentState: storage.contentState,
      client: this.client,
      assets: this.assets,
      serverUrl: () => this.serverUrl,
      findSession: id => this.content.find(id) ?? this.localRuntime.find(id),
      views: this.content.ipcViews,
      state: this.state.bind(this),
      changed: this.content.changed.bind(this.content),
      refresh: this.refresh.bind(this),
      databaseForEvent: this.content.databaseForEvent.bind(this.content),
      requireSession: this.content.requireSession.bind(this.content),
      roomAddress: this.roomAddress.bind(this),
      openRoom: this.openRoom.bind(this),
      acknowledgeFreeze: this.content.acknowledgeFreeze.bind(this.content),
      prepareLeave: this.prepareLeave.bind(this),
      createContent: this.createContent.bind(this),
      issueInvitation: this.issueInvitation.bind(this),
      removeView: this.content.removeView.bind(this.content),
      presenceSnapshot: session => this.localRuntime.presenceSnapshot(session),
      clearBinding: this.clearBinding.bind(this),
      discardLocal: this.discardLocal.bind(this),
      removeSession: this.removeSession.bind(this),
      finishLeave: this.finishLeave.bind(this),
      flushResources: this.flushResources.bind(this),
    });
    this.connectLocalRuntime();
    this.content.startAutoFlush();
    this.refreshInterval = setInterval(() => void this.refresh(), 15000);
    this.refreshInterval.unref();
    void this.refresh();
  }

  private connectLocalRuntime() {
    const localRuntime = this.localRuntime;
    this.disconnectLocalRuntime = localRuntime.connectSharing({
      open: this.openSharedContent.bind(this),
      find: this.content.find.bind(this.content),
      findContent: this.content.findContent.bind(this.content),
      readAgentState: this.readSharedAgentState.bind(this),
      submitAgentEdit: this.submitSharedAgentEdit.bind(this),
      broadcastPresence: (documentId, update) =>
        this.content.broadcast("collaboration:awareness", { documentId, update }),
      removeWindowViews: id => this.content.removeWindowViews(id),
    });
  }

  /** 受控退出收尾：停止后台任务并断开所有协作连接 */
  shutdown(): void {
    this.disconnectLocalRuntime?.();
    this.disconnectLocalRuntime = undefined;
    this.content?.shutdown();
    this.stopped = true;
    this.remoteDocuments.clear();
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    for (const socket of this.events.values()) socket.close();
    for (const transport of this.transports.values()) transport.disconnect();
  }
}

export default new CollaborationManager(getLocalContentRuntime);

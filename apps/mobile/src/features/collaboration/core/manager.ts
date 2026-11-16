// 协作运行时单例：会话编排（发现 / 连接 / 重连 / 退出）、事件流与 presence 汇聚。
//
// 与桌面端的架构差异：桌面主进程与渲染进程分处两个 JS 环境，需要 Y.Doc 副本 + IPC
// 批量转发与重试队列；移动端协作运行时与编辑器同处一个 WebView，视图直接复用会话的
// Y.Doc / Awareness，因此无需桌面端的 IPC 文档副本与转发重试。
//
// 本文件只保留门面：字段与同步透传存根，实现按域拆在 core/ 各文件，跨域调用一律经
// manager 派发（保持方法解析经过实例，测试方可拦截）。
import { HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import {
  DEFAULT_COLLABORATION_URL,
  type CollaborationSession,
  type ContentNode,
  type JoinRequest,
  type SharedDocumentInfo,
  type SharedDocumentListing,
} from "@tau/collaboration";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import type * as tauri from "../../../services/tauri";
import type { RuntimeSession } from "./types";
import {
  retain,
  release,
  hasPendingUpdates,
  hasPendingJoins,
  start,
  bindLifecycle,
  runStartLoop,
  stop,
  pendingStart,
  whenReady,
  readStoredNickname,
  startPolling,
  teardown,
} from "./lifecycle";
import {
  session,
  openDocument,
  listRooms,
  refresh,
  refreshRooms,
  recoverCachedSessions,
  act,
  joinByCode,
  decideJoinRequest,
  rotateInvitation,
  removeMember,
  updateNickname,
} from "./rooms";
import {
  reconnect,
  openSession,
  refreshProtocol,
  rebuildSession,
  createSession,
  discardCache,
  loadState,
  revokeSession,
  disposeSession,
} from "./sessions";
import {
  transport,
  pauseProvider,
  attach,
  connectEvents,
  scheduleEventsReconnect,
} from "./connections";
import { flushCache, preserveInputDraft, persist, flush } from "./persistence";
import { shareContent } from "./publication";
import { leave, leaveSession, finishClose, clearLocalBindings } from "./closure";
import { project } from "./projection";
import {
  resourceContext,
  assertResourceSession,
  prepareResource,
  uploadSharedResource,
  resolveResource,
  prepareFragment,
  notePendingAssets,
  processResources,
} from "./assets";
import { changed } from "./broadcast";

export class CollaborationManager {
  sessions = new Map<string, RuntimeSession>();
  rooms = new Map<string, SharedDocumentListing>();
  listing?: Promise<Map<string, SharedDocumentListing>>;
  leaves = new Map<string, Promise<void>>();
  /** 编辑页和后台恢复共享同一个在途打开。 */
  opening = new Map<string, Promise<RuntimeSession>>();
  transports = new Map<string, HocuspocusProviderWebsocket>();
  eventSockets = new Map<string, WebSocket>();
  pendingJoins = new Map<string, number>();
  requests: JoinRequest[] = [];
  readonly serverUrl = DEFAULT_COLLABORATION_URL;
  nickname = "Tau 用户";
  deviceId?: string;
  error?: string;
  refreshing?: Promise<void>;
  starting: Promise<void> | null = null;
  /** start 的最新目标配置：启动过程中 stop→start 交错时，由启动循环接续消费 */
  desired: { nickname: string } | null = null;
  refreshTimer: ReturnType<typeof setInterval> | null = null;
  resourceTimer: ReturnType<typeof setInterval> | null = null;
  idleTimer: ReturnType<typeof setTimeout> | null = null;
  lifecycleCleanup: (() => void) | null = null;
  refCount = 0;
  stopped = true;
  broadcastSummary = "";

  retain() {
    return retain(this);
  }

  release() {
    return release(this);
  }

  hasPendingUpdates() {
    return hasPendingUpdates(this);
  }

  hasPendingJoins() {
    return hasPendingJoins(this);
  }

  get configuredServerUrl() {
    return this.serverUrl;
  }

  get configuredNickname() {
    return this.nickname;
  }

  start(options: { nickname: string }): Promise<void> {
    return start(this, options);
  }

  bindLifecycle() {
    return bindLifecycle(this);
  }

  runStartLoop(): Promise<void> {
    return runStartLoop(this);
  }

  stop() {
    return stop(this);
  }

  session(documentId?: string) {
    return session(this, documentId);
  }

  pendingStart(): Promise<void> | null {
    return pendingStart(this);
  }

  whenReady() {
    return whenReady(this);
  }

  readStoredNickname(): Promise<string> {
    return readStoredNickname(this);
  }

  openDocument(documentId: string): Promise<CollaborationSession> {
    return openDocument(this, documentId);
  }

  flushCache(documentId: string) {
    return flushCache(this, documentId);
  }

  preserveInputDraft(documentId: string, draft: tauri.CachedInputDraft) {
    return preserveInputDraft(this, documentId, draft);
  }

  reconnect(documentId: string) {
    return reconnect(this, documentId);
  }

  listRooms() {
    return listRooms(this);
  }

  refresh(): Promise<void> {
    return refresh(this);
  }

  refreshRooms() {
    return refreshRooms(this);
  }

  recoverCachedSessions(cached: tauri.CachedContentSession[]) {
    return recoverCachedSessions(this, cached);
  }

  act<T>(action: (serverUrl: string) => Promise<T>): Promise<T> {
    return act<T>(this, action);
  }

  joinByCode(code: string) {
    return joinByCode(this, code);
  }

  decideJoinRequest(requestId: string, approve: boolean) {
    return decideJoinRequest(this, requestId, approve);
  }

  rotateInvitation(documentId: string) {
    return rotateInvitation(this, documentId);
  }

  removeMember(documentId: string, deviceId: string) {
    return removeMember(this, documentId, deviceId);
  }

  updateNickname(nickname: string) {
    return updateNickname(this, nickname);
  }

  leave(documentId: string): Promise<void> {
    return leave(this, documentId);
  }

  leaveSession(documentId: string) {
    return leaveSession(this, documentId);
  }

  finishClose(record: tauri.CachedContentSession) {
    return finishClose(this, record);
  }

  clearLocalBindings(documentId: string) {
    return clearLocalBindings(this, documentId);
  }

  shareContent(
    source: {
      contentId: number;
      title: string;
      content: unknown[];
      bannerBg?: string;
      bannerPosition?: string;
      sourceType?: string;
      sourceId?: number;
    },
    guard?: () => void,
    expectedRef?: string
  ): Promise<{ documentId: string; code: string; expiresAt: number }> {
    return shareContent(this, source, guard, expectedRef);
  }

  project(
    documentId: string,
    plugin?: {
      token: string;
      database: string;
      pluginId: string;
      taskOperationId?: number;
      taskRestoreId?: number;
      timeZone?: string;
    },
    guard?: () => Promise<void>,
    background = false,
    closing = false
  ): Promise<void> {
    return project(this, documentId, plugin, guard, background, closing);
  }

  resourceContext(session: RuntimeSession) {
    return resourceContext(this, session);
  }

  assertResourceSession(session: RuntimeSession) {
    return assertResourceSession(this, session);
  }

  prepareResource(documentId: string, reference: string): Promise<string> {
    return prepareResource(this, documentId, reference);
  }

  uploadSharedResource(documentId: string, file: File): Promise<string> {
    return uploadSharedResource(this, documentId, file);
  }

  resolveResource(documentId: string, reference: string): Promise<string> {
    return resolveResource(this, documentId, reference);
  }

  prepareFragment(
    documentId: string,
    sourceId: string,
    content: ContentNode[],
    contracts: ContentContractDictionary
  ) {
    return prepareFragment(this, documentId, sourceId, content, contracts);
  }

  notePendingAssets(session: RuntimeSession) {
    return notePendingAssets(this, session);
  }

  processResources(session: RuntimeSession): Promise<void> {
    return processResources(this, session);
  }

  persist(session: RuntimeSession, update: Uint8Array = new Uint8Array()) {
    return persist(this, session, update);
  }

  startPolling() {
    return startPolling(this);
  }

  teardown() {
    return teardown(this);
  }

  openSession(info: SharedDocumentInfo): Promise<RuntimeSession> {
    return openSession(this, info);
  }

  refreshProtocol(session: RuntimeSession): Promise<void> {
    return refreshProtocol(this, session);
  }

  rebuildSession(session: RuntimeSession, reason: string) {
    return rebuildSession(this, session, reason);
  }

  createSession(info: SharedDocumentInfo): Promise<RuntimeSession> {
    return createSession(this, info);
  }

  discardCache(info: SharedDocumentInfo, reason: string): Promise<null> {
    return discardCache(this, info, reason);
  }

  loadState(documentId: string) {
    return loadState(this, documentId);
  }

  transport(url: string) {
    return transport(this, url);
  }

  pauseProvider(session: RuntimeSession) {
    return pauseProvider(this, session);
  }

  attach(session: RuntimeSession, closing = false) {
    return attach(this, session, closing);
  }

  connectEvents(url: string) {
    return connectEvents(this, url);
  }

  scheduleEventsReconnect(url: string) {
    return scheduleEventsReconnect(this, url);
  }

  revokeSession(session: RuntimeSession, kind: "revoked" | "closed") {
    return revokeSession(this, session, kind);
  }

  disposeSession(documentId: string) {
    return disposeSession(this, documentId);
  }

  flush(session: RuntimeSession) {
    return flush(this, session);
  }

  changed() {
    return changed(this);
  }
}

export const collaborationManager = new CollaborationManager();

export type { RuntimeSession };

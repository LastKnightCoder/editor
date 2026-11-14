import { readDocumentIdentity } from "@tau/collaboration";
import { matchingInputDrafts, nodeRetentions } from "./retention";
// 协作运行时单例：会话编排（发现 / 连接 / 重连 / 退出）、事件流与 presence 汇聚。
//
// 与桌面端的架构差异：桌面主进程与渲染进程分处两个 JS 环境，需要 Y.Doc 副本 + IPC
// 批量转发与重试队列；移动端协作运行时与编辑器同处一个 WebView，视图直接复用会话的
// Y.Doc / Awareness，因此无需桌面端的 IPC 文档副本与转发重试。
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import {
  DEFAULT_COLLABORATION_URL,
  createNodeDocument,
  applyNodeDocumentUpdate,
  readNodeDocument,
  validateNodeDocument,
  collectNodeDocumentResources,
  isCollaborationResource,
  isVideoResource,
  type SharedContent,
  NODE_DOCUMENT_VERSION,
  type SourceBinding,
  type CollaborationEvent,
  type CollaborationSession,
  type ContentNode,
  type JoinRequest,
  type SharedDocumentInfo,
  type SharedDocumentListing,
} from "@tau/collaboration";
import { base64ToBytes, bytesToBase64 } from "@tau/collaboration/src/encoding";
import * as tauri from "../../../services/tauri";
import { parseInvokeError } from "../../../services/errors";
import {
  clearCachedInvitation,
  readCachedInvitation,
  writeCachedInvitation,
} from "./invitation-cache";
import * as rest from "./rest";
import {
  localizeDocumentResources,
  prepareDocumentResources,
  localizeFragmentResources,
  registerContentResourceSource,
} from "./resources";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { pushCollaborationNotice, setCollaborationState, useCollaborationStore } from "./store";

/** 列表新鲜度主要靠 /events 推送，轮询只作兜底（桌面为 15s，移动端放宽省电） */
const REFRESH_INTERVAL_MS = 60_000;
const EVENT_RECONNECT_MS = 5_000;
/** 退出前等待同步的上限，超时后保留会话并拒绝退出。 */
const FLUSH_TIMEOUT_MS = 10_000;
const DOCUMENT_STATE_MAX_ATTEMPTS = 3;
const JOIN_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
/** 最后一个协作页面关闭且没有活跃会话后，运行时再保留的空闲窗口 */
const IDLE_STOP_DELAY_MS = 30_000;

type RuntimeSession = {
  inputDrafts: Map<string, tauri.CachedInputDraft>;
  info: CollaborationSession;
  doc: Y.Doc;
  awareness: Awareness;
  provider: HocuspocusProvider | null;
  writeTail: Promise<void>;
  pendingUpdates: Uint8Array[];
  saveError?: { frozen: boolean };
  nodeViews: Record<string, Record<string, unknown>>;
  projection?: Promise<void>;
  close?: tauri.CachedContentSession["close"];
  assetsPending?: boolean;
  resourceGeneration?: number;
  resourcesDirty?: boolean;
  resourceTask?: Promise<void>;
  /** 会话拆除时摘除 doc 上的标题监听 */
  detachDocListener?: () => void;
  releaseResourceSource?: () => void;
};

function describeError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

function canRetryRead(error: unknown) {
  const { code } = parseInvokeError(error);
  return (
    [
      "COLLAB_NETWORK",
      "COLLAB_TIMEOUT",
      "COLLAB_REQUEST_FAILED",
      "COLLAB_RATE_LIMITED",
      "COLLAB_CAPACITY",
      "COLLAB_MAINTENANCE",
    ].includes(code) || /^COLLAB_HTTP_(429|5\d\d)$/.test(code)
  );
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

class CollaborationManager {
  private sessions = new Map<string, RuntimeSession>();
  private rooms = new Map<string, SharedDocumentListing>();
  private listing?: Promise<Map<string, SharedDocumentListing>>;
  private leaves = new Map<string, Promise<void>>();
  /** 编辑页和后台恢复共享同一个在途打开。 */
  private opening = new Map<string, Promise<RuntimeSession>>();
  private transports = new Map<string, HocuspocusProviderWebsocket>();
  private eventSockets = new Map<string, WebSocket>();
  private pendingJoins = new Map<string, number>();
  private requests: JoinRequest[] = [];
  private readonly serverUrl = DEFAULT_COLLABORATION_URL;
  private nickname = "Tau 用户";
  private deviceId?: string;
  private error?: string;
  private refreshing?: Promise<void>;
  private starting: Promise<void> | null = null;
  /** start 的最新目标配置：启动过程中 stop→start 交错时，由启动循环接续消费 */
  private desired: { nickname: string } | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private resourceTimer: ReturnType<typeof setInterval> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private lifecycleCleanup: (() => void) | null = null;
  private refCount = 0;
  private stopped = true;

  /** 运行时持有计数（协作页面挂载 +1 / 卸载 -1）：归零且无活跃会话后延迟空闲停止 */
  retain() {
    this.refCount += 1;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  release() {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount > 0 || this.idleTimer) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      // 有活跃会话或未同步改动时推迟停止，下一轮空闲检查再试
      if (
        this.refCount > 0 ||
        this.hasPendingUpdates() ||
        this.sessions.size > 0 ||
        this.hasPendingJoins()
      ) {
        this.release();
        return;
      }
      this.stop();
    }, IDLE_STOP_DELAY_MS);
  }

  private hasPendingUpdates() {
    for (const session of this.sessions.values()) if (session.info.pending) return true;
    return false;
  }

  private hasPendingJoins() {
    const now = Date.now();
    for (const [documentId, expiresAt] of this.pendingJoins) {
      if (expiresAt <= now) this.pendingJoins.delete(documentId);
    }
    return this.pendingJoins.size > 0;
  }

  get configuredServerUrl() {
    return this.serverUrl;
  }

  get configuredNickname() {
    return this.nickname;
  }

  /** 启动运行时（服务器固定为 DEFAULT_COLLABORATION_URL，与桌面端一致）；已启动时重复调用为幂等。
   *  昵称变更不触发重启——请用 updateNickname 同步，避免打断进行中的同步。 */
  start(options: { nickname: string }): Promise<void> {
    this.desired = { nickname: options.nickname.trim() || "Tau 用户" };
    this.starting ??= this.runStartLoop();
    return this.starting;
  }

  private bindLifecycle() {
    if (this.lifecycleCleanup || typeof window === "undefined") return;
    const recover = () => {
      if (this.stopped || document.visibilityState === "hidden") return;
      void this.refresh();
      for (const session of this.sessions.values()) {
        if (session.info.connection === "offline" || session.info.connection === "error")
          void this.reconnect(session.info.id);
      }
    };
    window.addEventListener("online", recover);
    document.addEventListener("visibilitychange", recover);
    this.lifecycleCleanup = () => {
      window.removeEventListener("online", recover);
      document.removeEventListener("visibilitychange", recover);
      this.lifecycleCleanup = null;
    };
  }
  private async runStartLoop(): Promise<void> {
    try {
      while (this.desired) {
        // 取走式消费：await 期间收到的新目标（开关）由下一轮循环接续处理
        const target = this.desired;
        this.desired = null;
        if (this.stopped) {
          this.teardown();
          this.nickname = target.nickname;
          this.stopped = false;
          this.bindLifecycle();
          setCollaborationState({
            serverUrl: this.serverUrl,
            nickname: this.nickname,
            status: "starting",
            error: undefined,
          });
          try {
            const identity = await rest.getIdentity(this.serverUrl, this.nickname);
            this.deviceId = identity.id;
            await this.refresh();
            if (this.stopped) break; // 启动等待期被 stop：就此收手，不重建轮询
            this.startPolling();
          } catch (failure) {
            this.error = describeError(failure, "协作服务初始化失败");
            this.stopped = true;
            this.changed();
            throw failure;
          }
        }
      }
    } finally {
      this.starting = null;
      // 循环退出（被 stop 打断/启动失败）时可能残留未被消费的新目标
      // （等待期内的 stop→start 交错）：接续启动，避免运行时静默停摆
      if (this.desired) {
        const revived = this.runStartLoop();
        // 该 promise 无直接调用方（原 start() 持有的是旧循环的 promise）：
        // 兜底吞掉 rejection 避免 unhandled rejection，新调用仍经 starting 复用
        revived.catch(() => {});
        this.starting = revived;
      }
    }
  }

  stop() {
    this.desired = null;
    this.lifecycleCleanup?.();
    this.teardown();
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    // stop 绕过 changed() 直写 store：同步失效广播摘要，避免重启后误判「无变化」跳过广播
    this.broadcastSummary = "";
    setCollaborationState({ status: "idle", sessions: [], requests: [], error: undefined });
  }

  /** 运行时会话（编辑页通过它取得 Y.Doc / Awareness） */
  session(documentId?: string) {
    if (!documentId) return undefined;
    return this.sessions.get(documentId);
  }

  /** 等待进行中的启动完成：挂载即触发的操作（发起共享 / 打开文档）与运行时
   *  启动并发时避免用到未就绪的服务器配置；启动失败由后续请求自然报错。
   *  协作页面漏挂 runtime（防御）：按用户设置的昵称就地启动。 */
  /** 读取 starting 的稳定通道：方法调用不做控制流收窄，await 之后仍能读到并发启动 */
  private pendingStart(): Promise<void> | null {
    return this.starting;
  }

  private async whenReady() {
    if (!this.starting && this.stopped) {
      const nickname = await this.readStoredNickname();
      // await 期间并发启动（页面挂载 runtime）时不重复启动
      const pending = this.pendingStart();
      if (pending) return pending.catch(() => {});
      await this.start({ nickname }).catch(() => {});
    }
    if (this.starting) await this.starting.catch(() => {});
  }

  private async readStoredNickname(): Promise<string> {
    try {
      const setting = JSON.parse(await tauri.readSettingJson()) as {
        collaboration?: { nickname?: string };
      };
      return setting.collaboration?.nickname || "Tau 用户";
    } catch {
      return "Tau 用户";
    }
  }

  /** 打开文档；列表刷新尚未覆盖时（如刚被批准）就地补建会话。 */
  async openDocument(documentId: string): Promise<CollaborationSession> {
    await this.whenReady();
    const existing = this.sessions.get(documentId);
    if (existing) {
      if (existing.info.connection === "offline" || existing.info.connection === "error")
        await this.reconnect(documentId);
      return this.sessions.get(documentId)?.info ?? existing.info;
    }
    let info = this.rooms.get(documentId);
    if (!info) {
      try {
        info = (await this.listRooms()).get(documentId);
      } catch (failure) {
        if (!canRetryRead(failure)) throw failure;
        const cached = await tauri.collabReadCache(documentId);
        if (cached?.metadata.serverUrl !== this.serverUrl || cached.metadata.status !== "active")
          throw failure;
        return (await this.openSession(cached.metadata)).info;
      }
    }
    if (!info) throw new Error("COLLAB_NOT_FOUND: 协作文档不存在或已失去访问权限");
    if (info.kind !== "content" || info.protocolVersion !== NODE_DOCUMENT_VERSION)
      throw new Error("COLLAB_CLIENT_UPGRADE_REQUIRED: 协作文档版本或类型不受支持");
    return (await this.openSession(info)).info;
  }

  async flushCache(documentId: string) {
    const session = this.sessions.get(documentId);
    if (session) await (session.saveError ? this.persist(session) : session.writeTail);
  }

  preserveInputDraft(documentId: string, draft: tauri.CachedInputDraft) {
    const session = this.sessions.get(documentId);
    if (!session) return Promise.reject(new Error("原协作副本尚未加载"));
    session.inputDrafts.set(JSON.stringify([draft.viewId, draft.nodeId, draft.field]), draft);
    return this.persist(session);
  }

  async reconnect(documentId: string) {
    const session = this.sessions.get(documentId);
    if (!session || session.info.status !== "active" || session.info.leaving) return;
    try {
      await this.flushCache(documentId);
      await this.refreshProtocol(session);
    } catch (failure) {
      session.info.connection = "error";
      session.info.error = describeError(failure, "协作重连失败，请稍后重试");
      this.changed();
      return;
    }
    if (session.info.frozen || this.sessions.get(documentId) !== session) return;
    this.pauseProvider(session);
    session.info.connection = "connecting";
    session.info.error = undefined;
    this.attach(session);
    this.changed();
  }
  private listRooms() {
    this.listing ??= rest
      .listDocuments(this.serverUrl)
      .then(({ documents }) => {
        const rooms = new Map(documents.map(info => [info.id, info]));
        if (!this.stopped) this.rooms = rooms;
        return rooms;
      })
      .finally(() => {
        this.listing = undefined;
      });
    return this.listing;
  }

  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    if (this.stopped) return Promise.resolve();
    this.refreshing = this.refreshRooms().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }

  private async refreshRooms() {
    try {
      const serverUrl = this.serverUrl;
      const recovery = await tauri.collabListCache();
      const closing = recovery.filter(record => record.close);
      for (const session of this.sessions.values()) {
        if (session.close && !closing.some(record => record.id === session.info.id))
          closing.push({
            ...session.info,
            close: session.close,
            baselineId: String(session.doc.getMap("meta").get("baselineId")),
            epoch: Number(session.doc.getMap("meta").get("epoch")),
          });
      }
      const failures: string[] = [];
      for (const record of closing) {
        try {
          await this.leave(record.id);
        } catch (failure) {
          failures.push(describeError(failure, "共享收尾尚未完成"));
        }
      }
      const rooms = await this.listRooms();
      if (this.stopped) return;
      for (const info of rooms.values())
        if (info.kind === "content") this.pendingJoins.delete(info.id);
      this.changed();
      const active: Promise<RuntimeSession>[] = [];
      for (const session of [...this.sessions.values()]) {
        const info = this.rooms.get(session.info.id);
        if (info) active.push(this.openSession(info));
        else if (session.info.status === "active") this.revokeSession(session, "revoked");
      }
      const settled = await Promise.allSettled(active);
      for (const result of settled)
        if (result.status === "rejected")
          failures.push(describeError(result.reason, "协作会话暂未完成对账"));
      this.requests = (await rest.listJoinRequests(serverUrl)).requests;
      this.error = failures[0];
      void this.connectEvents(serverUrl).catch(() => this.scheduleEventsReconnect(serverUrl));
      this.recoverCachedSessions(recovery);
    } catch (failure) {
      this.error = describeError(failure, "协作服务器暂时无法连接");
    } finally {
      // refresh 等待期间被 stop：重新收敛到空闲态，避免迟到会话污染状态
      if (this.stopped) this.stop();
      else this.changed();
    }
  }

  private recoverCachedSessions(cached: tauri.CachedContentSession[]) {
    if (this.stopped) return;
    for (const record of cached) {
      const room = this.rooms.get(record.id);
      if (
        room?.kind === "content" &&
        room.protocolVersion === NODE_DOCUMENT_VERSION &&
        record.serverUrl === this.serverUrl &&
        record.status === "active" &&
        !record.close &&
        (record.role === "owner" || record.pending) &&
        !this.sessions.has(record.id)
      )
        void this.openSession(room).catch(failure =>
          console.warn("协作缓存后台恢复暂未完成", failure)
        );
    }
  }

  /** 用户交互触发的写操作统一模板：等待启动完成（避免把请求发往错误的服务器）、
   *  执行、随后刷新让 /events 与列表尽快反映变更。 */
  private async act<T>(action: (serverUrl: string) => Promise<T>): Promise<T> {
    await this.whenReady();
    const result = await action(this.serverUrl);
    await this.refresh();
    return result;
  }

  async joinByCode(code: string) {
    const result = await this.act(serverUrl => rest.requestJoin(serverUrl, code));
    if (result.status === "pending" && !this.rooms.has(result.documentId)) {
      this.pendingJoins.set(result.documentId, Date.now() + JOIN_REQUEST_TTL_MS);
    } else {
      this.pendingJoins.delete(result.documentId);
    }
    return result;
  }

  async decideJoinRequest(requestId: string, approve: boolean) {
    return this.act(serverUrl => rest.decideJoinRequest(serverUrl, requestId, approve));
  }

  async rotateInvitation(documentId: string) {
    return this.act(serverUrl => rest.rotateInvitation(serverUrl, documentId));
  }

  async removeMember(documentId: string, deviceId: string) {
    return this.act(serverUrl => rest.removeMember(serverUrl, documentId, deviceId));
  }

  async updateNickname(nickname: string) {
    await this.whenReady();
    const identity = await rest.updateNickname(this.serverUrl, nickname);
    this.nickname = identity.nickname;
    this.changed();
    return identity;
  }

  /** 结束共享的请求与回执耐久保存；未知结果只按原修订重试，不能恢复编辑。 */
  leave(documentId: string): Promise<void> {
    const pending = this.leaves.get(documentId);
    if (pending) return pending;
    const task = this.leaveSession(documentId).finally(() => {
      if (this.leaves.get(documentId) === task) this.leaves.delete(documentId);
    });
    this.leaves.set(documentId, task);
    return task;
  }

  private async leaveSession(documentId: string) {
    let session = this.sessions.get(documentId);
    const recovery = await tauri.collabRecovery(documentId);
    if (recovery?.close) {
      if (session) {
        session.close = recovery.close;
        session.info.leaving = true;
        this.pauseProvider(session);
        this.changed();
      }
      return this.finishClose(recovery);
    }
    session ??= await this.opening.get(documentId);
    const room = this.rooms.get(documentId);
    if (!session && room?.kind === "content" && room.protocolVersion === NODE_DOCUMENT_VERSION)
      session = await this.openSession(room);
    if (!session) return;
    if (session.close?.confirmed)
      return this.finishClose({
        ...session.info,
        close: session.close,
        baselineId: String(session.doc.getMap("meta").get("baselineId")),
        epoch: Number(session.doc.getMap("meta").get("epoch")),
      });
    const check = () => {
      if (this.sessions.get(documentId) !== session || this.stopped)
        throw new Error("结束共享的原会话已变化");
    };
    check();
    session.info.leaving = true;
    this.changed();
    try {
      await this.processResources(session);
      await session.projection;
      check();
      await this.flush(session);
      check();
      if (!session.provider?.synced || session.provider.hasUnsyncedChanges || session.assetsPending)
        throw new Error("COLLAB_UNSYNCED: 改动尚未同步完成，请稍后再试");
      if (session.inputDrafts.size) throw new Error("还有尚未提交的编辑，请完成输入后再结束共享");
      this.pauseProvider(session);
      if (session.info.role === "owner") {
        if (!session.info.source?.librarySourceId)
          throw new Error("原正文关联缺失，请恢复原正文关联后再结束共享");
        const { state, protocol } = await rest.getDocumentState(session.info.serverUrl, documentId);
        const bytes = base64ToBytes(state);
        if (!protocol || (await sha256Hex(bytes)) !== protocol.revision)
          throw new Error("共享快照与协议修订不匹配，请重试结束共享");
        check();
        const identity = readDocumentIdentity(session.doc);
        if (
          protocol.id !== identity.documentId ||
          protocol.version !== identity.version ||
          protocol.baselineId !== identity.baselineId ||
          protocol.epoch !== identity.epoch
        )
          throw new Error("房间基线已变化，请重新打开共享正文");
        const candidate = await applyNodeDocumentUpdate(session.doc, bytes, identity);
        candidate.destroy();
        check();
        Y.applyUpdate(session.doc, bytes, session.provider);
        const assets = await rest.listAssets(session.info.serverUrl, documentId);
        await tauri.collabResource(
          this.resourceContext(session),
          "localize",
          assets.ids.map(id => `tau-collab-asset:${id}`)
        );
        await this.flushCache(documentId);
        check();
        await this.project(documentId, undefined, undefined, false, true);
        check();
        session.close = { revision: protocol.revision, confirmed: false };
        try {
          await this.persist(session);
        } catch (failure) {
          session.close = undefined;
          throw failure;
        }
        await this.finishClose({
          ...session.info,
          close: session.close,
          baselineId: protocol.baselineId,
          epoch: protocol.epoch,
        });
      } else {
        await this.project(documentId, undefined, undefined, false, true);
        await rest.leaveDocument(session.info.serverUrl, documentId);
        session.info.status = "closed";
        await this.persist(session);
        await this.clearLocalBindings(documentId);
        await tauri.collabResource(this.resourceContext(session), "release");
        this.rooms.delete(documentId);
        this.disposeSession(documentId);
      }
    } catch (failure) {
      if (!session.close) {
        session.info.leaving = false;
        if (!session.info.frozen && !session.assetsPending) session.provider?.attach();
      }
      session.info.error = describeError(failure, "结束或退出共享尚未完成，请稍后重试");
      this.changed();
      throw failure;
    }
  }

  private async finishClose(record: tauri.CachedContentSession) {
    const { id, serverUrl, source, close } = record;
    if (!close || !source?.librarySourceId) throw new Error("关闭恢复记录不完整，原数据已保留");
    const session = this.sessions.get(id);
    try {
      if (!close.confirmed) {
        const receipt = await rest.closeDocument(serverUrl, id, close.revision);
        if (receipt?.ok !== true || receipt.revision !== close.revision)
          throw new Error("关闭回执未确认，稍后按原修订重试");
        await tauri.collabRecovery(id, "confirm-close");
        close.confirmed = true;
      }
      if (session) {
        session.close = close;
        session.info.status = "closed";
      }
      await tauri.collabUnbindContent(source.contentId, {
        documentId: id,
        sourceId: source.librarySourceId,
      });
      await tauri.collabResource({ serverUrl, documentId: id }, "release");
      await tauri.collabRecovery(id, "release");
      this.rooms.delete(id);
      this.disposeSession(id);
      clearCachedInvitation(id);
    } catch (failure) {
      const code =
        typeof failure === "object" && failure ? (failure as { code?: string }).code : undefined;
      if (
        !close.confirmed &&
        (code === "REVISION_CONFLICT" || /^COLLAB_REVISION_CONFLICT:/.test(String(failure)))
      ) {
        // 只有确认房间仍活动，才能把修订冲突作为可重新编辑的失败。
        await rest.getDocumentProtocol(serverUrl, id);
        await tauri.collabRecovery(id, "clear-close");
        if (session) {
          session.close = undefined;
          session.info.leaving = false;
          if (!session.info.frozen) session.provider?.attach();
        }
      }
      if (session)
        session.info.error = describeError(failure, "共享收尾尚未完成，正在保留原副本重试");
      this.changed();
      throw failure;
    }
  }

  /** 解除该房间的本地绑定（仅本机发起时存在）并清理协作码缓存；失败不阻塞退出，
   *  残留绑定由投影通道的漂移检测兜底清理。 */
  private async clearLocalBindings(documentId: string) {
    try {
      const bindings = await tauri.collabListBindings();
      const mine = bindings.filter(binding => binding.documentId === documentId);
      for (const binding of mine)
        await tauri.collabUnbindContent(binding.contentId, { documentId });
    } catch {
      // 忽略：绑定残留可被投影漂移检测清理
    }
    clearCachedInvitation(documentId);
  }

  /** 发布当前正文与契约，发布中的快照先保存在本机，重试复用同一房间。 */
  async shareContent(
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
    guard?.();
    await this.whenReady();
    guard?.();
    const detail = await tauri.getContentDetail(source.contentId);
    if (!detail.contracts || !detail.documentId || !detail.librarySourceId || !detail.revision)
      throw new Error("正文格式不受支持，无法发起共享");
    if (JSON.stringify(detail.content) !== JSON.stringify(source.content))
      throw new Error("本机编辑尚未确认保存，请保存后重试共享");
    guard?.();
    if (expectedRef && `${detail.contentId}:${detail.createTime}` !== expectedRef)
      throw new Error("正文身份已变化，请重新打开");
    const existing = await tauri.collabGetBinding(source.contentId);
    guard?.();
    let documentId = existing?.documentId;
    if (existing && existing.serverUrl !== this.serverUrl)
      throw new Error("正文仍绑定另一协作服务，请先结束原共享");
    if (!documentId) {
      const previous = (await tauri.collabListCache())
        .filter(
          item =>
            item.serverUrl === this.serverUrl &&
            item.source?.contentDocumentId === detail.documentId &&
            item.source?.librarySourceId === detail.librarySourceId
        )
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      guard?.();
      const pending = previous?.status === "active" ? previous : undefined;
      if (pending) documentId = pending.id;
      else {
        const key = await sha256Hex(
          new TextEncoder().encode(
            JSON.stringify([
              "tau-mobile",
              this.serverUrl,
              detail.librarySourceId,
              detail.documentId,
              previous?.id ?? "initial",
            ])
          )
        );
        guard?.();
        documentId = (await rest.createDocument(this.serverUrl, key)).id;
        guard?.();
      }
      let cached = await tauri.collabReadCache(documentId);
      guard?.();
      if (!cached) {
        const context = { serverUrl: this.serverUrl, documentId };
        const prepared = await prepareDocumentResources(
          context,
          {
            title: source.title,
            content: detail.content as ContentNode[],
            bannerBg: source.bannerBg ?? "",
            bannerPosition: source.bannerPosition ?? "center",
          },
          detail.contracts
        );
        guard?.();
        const doc = await createNodeDocument(
          { documentId, baselineId: crypto.randomUUID(), epoch: 0 },
          prepared,
          detail.contracts
        );
        try {
          guard?.();
          const metadata: tauri.CachedContentSession = {
            id: documentId,
            baselineId: String(doc.getMap("meta").get("baselineId")),
            epoch: 0,
            serverUrl: this.serverUrl,
            mode: "shared",
            ownerId: this.deviceId!,
            role: "owner",
            status: "active",
            title: source.title,
            members: [],
            updatedAt: Date.now(),
            connection: "offline",
            pending: true,
            leaving: false,
            source: {
              databaseName: detail.librarySourceId,
              contentId: detail.contentId,
              contentCreatedAt: detail.createTime,
              librarySourceId: detail.librarySourceId,
              contentDocumentId: detail.documentId,
              projectionRevision: detail.revision,
              sourceType: source.sourceType as SourceBinding["sourceType"],
              sourceId: source.sourceId,
              sourceTitle: source.title,
            },
          };
          await tauri.collabWriteCache(
            {
              documentId,
              ...nodeRetentions(doc),
              metadata,
              state: bytesToBase64(Y.encodeStateAsUpdate(doc)),
            },
            true
          );
        } finally {
          doc.destroy();
        }
        guard?.();
        cached = await tauri.collabReadCache(documentId);
      }
      guard?.();
      if (!cached || cached.metadata.source?.projectionRevision !== detail.revision)
        throw new Error("待发布副本与本机正文已变化，原发布快照已保留");
      await tauri.collabResource({ serverUrl: this.serverUrl, documentId }, "flush");
      guard?.();
      await rest.publishDocument(this.serverUrl, documentId, cached.state);
      guard?.();
      await tauri.collabBindContent({
        ...source,
        documentId,
        serverUrl: this.serverUrl,
        expectedDocumentId: detail.documentId,
        expectedSourceId: detail.librarySourceId,
        expectedRevision: detail.revision,
      });
    }
    guard?.();
    await this.openDocument(documentId);
    guard?.();
    await this.project(documentId, undefined, async () => {
      guard?.();
    });
    guard?.();
    const invitation =
      readCachedInvitation(documentId) ?? (await rest.rotateInvitation(this.serverUrl, documentId));
    guard?.();
    writeCachedInvitation(documentId, invitation);
    return { documentId, ...invitation };
  }

  async project(
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
    const session = this.sessions.get(documentId);
    if (
      !session?.info.source ||
      (session.info.leaving && !closing) ||
      session.info.frozen ||
      session.doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION
    )
      return;
    if (session.projection) {
      if (!plugin && !closing) {
        session.resourcesDirty = true;
        return session.projection;
      }
      await session.projection;
      return this.project(documentId, plugin, guard, background, closing);
    }
    session.projection = (async () => {
      await this.flushCache(documentId);
      await guard?.();
      const source = session.info.source!;
      const contracts = session.doc
        .getMap("node-tree:contracts")
        .toJSON() as ContentContractDictionary;
      const localized = await localizeDocumentResources(
        this.resourceContext(session),
        readNodeDocument(session.doc),
        contracts
      );
      await guard?.();
      if (this.sessions.get(documentId) !== session) throw new Error("原协作会话已变化");
      const result = await tauri.collabProjectContent({
        ...(plugin ? { plugin } : {}),
        documentId,
        contentId: source.contentId,
        content: localized.content,
        count: 0,
        contracts,
        expectedRevision: source.projectionRevision,
        expectedDocumentId: source.contentDocumentId,
        expectedSourceId: source.librarySourceId,
      });
      if (!result.projected) {
        if (background) {
          session.resourcesDirty = true;
          return;
        }
        throw new Error(
          result.reason === "library"
            ? "请切回原资料库完成共享正文保存"
            : "本机正文关联已变化，协作副本已保留"
        );
      }
      source.projectionRevision = result.revision;
      await this.persist(session);
    })().finally(() => {
      session.projection = undefined;
    });
    return session.projection;
  }

  private resourceContext(session: RuntimeSession) {
    return { serverUrl: session.info.serverUrl, documentId: session.info.id };
  }

  private assertResourceSession(session: RuntimeSession) {
    if (
      this.sessions.get(session.info.id) !== session ||
      session.info.status !== "active" ||
      session.info.leaving ||
      session.info.frozen
    )
      throw new Error("协作资源会话已变化，请重新打开正文");
  }

  async prepareResource(documentId: string, reference: string): Promise<string> {
    const session = this.sessions.get(documentId);
    if (!session) throw new Error("协作会话尚未就绪");
    this.assertResourceSession(session);
    if (session.info.role !== "owner") throw new Error("成员图片必须直接上传协作服务器");
    const mapped = await tauri.collabResource<Record<string, string>>(
      this.resourceContext(session),
      "prepare",
      [reference],
      true
    );
    this.assertResourceSession(session);
    await this.notePendingAssets(session);
    return mapped[reference];
  }

  async uploadSharedResource(documentId: string, file: File): Promise<string> {
    const session = this.sessions.get(documentId);
    if (!session) throw new Error("协作会话尚未就绪");
    this.assertResourceSession(session);
    if (session.info.role !== "editor" && !isVideoResource(file.name, file.type))
      throw new Error("作者图片必须使用自己的存储配置");
    const reference = await tauri.uploadResource({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      content: file,
      collaboration: this.resourceContext(session),
    });
    this.assertResourceSession(session);
    await this.notePendingAssets(session);
    return reference;
  }

  resolveResource(documentId: string, reference: string): Promise<string> {
    const session = this.sessions.get(documentId);
    if (!session) return Promise.reject(new Error("协作会话尚未就绪"));
    return isCollaborationResource(reference)
      ? tauri.collabResource<string>(this.resourceContext(session), "resolve", [reference])
      : Promise.resolve(reference);
  }

  async prepareFragment(
    documentId: string,
    sourceId: string,
    content: ContentNode[],
    contracts: ContentContractDictionary
  ) {
    const session = this.sessions.get(documentId);
    if (!session) throw new Error("协作会话尚未就绪");
    this.assertResourceSession(session);
    let value: SharedContent = {
      title: "",
      bannerBg: "",
      bannerPosition: "center",
      content: await localizeFragmentResources(sourceId, content, contracts),
    };
    value = await prepareDocumentResources(this.resourceContext(session), value, contracts);
    this.assertResourceSession(session);
    await this.notePendingAssets(session);
    return value.content;
  }

  private async notePendingAssets(session: RuntimeSession) {
    session.resourceGeneration = (session.resourceGeneration ?? 0) + 1;
    const pending = await tauri.collabResource<boolean>(this.resourceContext(session), "pending");
    this.assertResourceSession(session);
    session.assetsPending ||= pending;
    if (session.assetsPending) {
      this.pauseProvider(session);
      session.info.pending = true;
    }
    session.resourcesDirty = true;
    await this.persist(session);
    this.changed();
    void this.processResources(session).catch(() => {});
  }

  private processResources(session: RuntimeSession): Promise<void> {
    if (session.resourceTask) return session.resourceTask;
    session.resourcesDirty = false;
    const task = (async () => {
      await this.flushCache(session.info.id);
      while (session.assetsPending) {
        const generation = session.resourceGeneration;
        await tauri.collabResource(this.resourceContext(session), "flush");
        const pending = await tauri.collabResource<boolean>(
          this.resourceContext(session),
          "pending"
        );
        if (this.sessions.get(session.info.id) !== session) return;
        session.assetsPending = pending || session.resourceGeneration !== generation;
        if (session.assetsPending) continue;
        session.info.pending = Boolean(session.provider?.hasUnsyncedChanges);
        if (!session.info.leaving && !session.info.frozen) {
          if (session.provider) session.provider.attach();
          else this.attach(session);
        }
      }
      if (session.info.role === "owner") {
        const references = collectNodeDocumentResources(session.doc).filter(
          isCollaborationResource
        );
        if (references.length)
          await tauri.collabResource(this.resourceContext(session), "localize", references);
        if (session.info.source) await this.project(session.info.id, undefined, undefined, true);
      }
      if (this.sessions.get(session.info.id) !== session) return;
      if (session.info.error?.startsWith("协作图片尚未保存：")) session.info.error = undefined;
      await this.persist(session);
      this.changed();
    })()
      .catch(failure => {
        session.resourcesDirty = true;
        session.info.error = `协作图片尚未保存：${describeError(failure, "请稍后重试")}`;
        this.changed();
        throw failure;
      })
      .finally(() => {
        if (session.resourceTask === task) session.resourceTask = undefined;
      });
    session.resourceTask = task;
    return task;
  }

  private persist(session: RuntimeSession, update: Uint8Array = new Uint8Array()) {
    if (update.byteLength) session.pendingUpdates.push(Uint8Array.from(update));
    const next = session.writeTail
      .catch(() => undefined)
      .then(async () => {
        const updates = session.pendingUpdates.slice();
        const drafts = [...session.inputDrafts.values()];
        const confirmedDrafts = matchingInputDrafts(session.doc, drafts);
        const bytes = bytesToBase64(updates.length ? Y.mergeUpdates(updates) : new Uint8Array());
        if (session.doc.getMap("meta").get("version") === NODE_DOCUMENT_VERSION)
          await validateNodeDocument(session.doc);
        for (const draft of drafts)
          await tauri.collabInputDraft({
            ...draft,
            documentId: session.info.id,
            baselineId: String(session.doc.getMap("meta").get("baselineId")),
            epoch: Number(session.doc.getMap("meta").get("epoch")),
          });
        await tauri.collabWriteCache({
          documentId: session.info.id,
          ...nodeRetentions(session.doc),
          state: bytes,
          confirmedDrafts,
          metadata: {
            ...session.info,
            close: session.close,
            baselineId: readDocumentIdentity(session.doc).baselineId,
            epoch: Number(session.doc.getMap("meta").get("epoch") ?? 0),
          },
        });
        session.pendingUpdates.splice(0, updates.length);
        for (const draft of confirmedDrafts) {
          const key = JSON.stringify([draft.viewId, draft.nodeId, draft.field]);
          if (session.inputDrafts.get(key)?.sequence === draft.sequence)
            session.inputDrafts.delete(key);
        }
        if (session.saveError) {
          session.info.frozen =
            session.saveError.frozen || Boolean(session.info.remoteVersionAvailable);
          if (!session.info.frozen) session.info.error = undefined;
          session.saveError = undefined;
          this.changed();
          if (!this.stopped && this.sessions.get(session.info.id) === session) this.attach(session);
        }
      });
    session.writeTail = next;
    void next.catch(failure => {
      session.saveError ??= { frozen: Boolean(session.info.frozen) };
      session.info.frozen = true;
      session.info.error = describeError(failure, "本机保存失败，当前输入仍保留，请勿关闭应用");
      this.pauseProvider(session);
      this.changed();
    });
    return next;
  }

  private startPolling() {
    if (this.refreshTimer) return;
    this.refreshTimer = setInterval(() => {
      // 后台不轮询：WebView 挂起时连接自然断开，回前台由 refresh 补齐
      if (document.visibilityState === "hidden") return;
      void this.refresh();
    }, REFRESH_INTERVAL_MS);
    this.resourceTimer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      for (const session of this.sessions.values()) {
        if (
          session.info.status === "active" &&
          !session.info.leaving &&
          (session.assetsPending || session.resourcesDirty)
        )
          void this.processResources(session).catch(() => {});
      }
    }, 2000);
  }

  private teardown() {
    this.stopped = true;
    if (this.resourceTimer) {
      clearInterval(this.resourceTimer);
      this.resourceTimer = null;
    }
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    for (const socket of this.eventSockets.values()) socket.close();
    this.eventSockets.clear();
    for (const documentId of [...this.sessions.keys()]) this.disposeSession(documentId);
    for (const transport of this.transports.values()) transport.destroy();
    this.transports.clear();
    this.rooms.clear();
    this.requests = [];
    this.pendingJoins.clear();
    this.deviceId = undefined;
    this.error = undefined;
  }

  /** 建立或刷新会话（幂等）：已存在的会话只合并服务端权威字段，
   *  并发调用（列表刷新 + 编辑页补建）按 documentId 去重，避免覆盖出双份 Y.Doc。 */
  private async openSession(info: SharedDocumentInfo): Promise<RuntimeSession> {
    this.pendingJoins.delete(info.id);
    const existing = this.sessions.get(info.id);
    if (existing) {
      if (existing.info.leaving) return existing;
      // 运行时字段（连接态/待同步/退出中）以本地为准，其余取服务端权威值
      existing.info = {
        ...existing.info,
        ...info,
        connection: existing.info.connection,
        pending: existing.info.pending,
        leaving: existing.info.leaving,
      };
      await this.refreshProtocol(existing);
      this.changed();
      // 换代重建后返回新会话
      return this.sessions.get(info.id) ?? existing;
    }
    let pending = this.opening.get(info.id);
    if (!pending) {
      pending = this.createSession(info).finally(() => this.opening.delete(info.id));
      this.opening.set(info.id, pending);
    }
    return pending;
  }

  private async refreshProtocol(session: RuntimeSession): Promise<void> {
    const protocol = await rest.getDocumentProtocol(session.info.serverUrl, session.info.id);
    if (this.sessions.get(session.info.id) !== session || this.stopped) return;
    const meta = session.doc.getMap("meta");
    if (
      protocol.version === meta.get("version") &&
      protocol.epoch === Number(meta.get("epoch") ?? 0) &&
      protocol.baselineId === meta.get("baselineId")
    )
      return;
    if (protocol.version !== NODE_DOCUMENT_VERSION) {
      // 协作端是更新版本应用写入的格式：权威数据，不能用旧客户端改写
      session.info.frozen = true;
      session.info.error = "协作端需要更新版本的应用，请升级后再编辑";
      session.provider?.destroy();
      session.provider = null;
      this.changed();
      return;
    }
    await this.rebuildSession(session, "协作端基线已变化");
  }

  /** 远端已换代的活跃会话：备份本机缓存后按服务器内容原位换成新会话，编辑页随会话切换重新绑定。 */
  private async rebuildSession(session: RuntimeSession, reason: string) {
    const { id } = session.info;
    session.provider?.destroy();
    session.provider = null;
    session.detachDocListener?.();
    session.releaseResourceSource?.();
    session.awareness.setLocalState(null);
    await session.writeTail.catch(() => undefined);
    if (this.sessions.get(id) !== session) return;
    this.sessions.delete(id);
    const cached = await tauri.collabReadCache(id);
    if (cached) await this.discardCache(session.info, reason);
    const { connection: _connection, pending: _pending, leaving: _leaving, ...info } = session.info;
    const next = this.createSession(info as SharedDocumentInfo).finally(() =>
      this.opening.delete(id)
    );
    this.opening.set(id, next);
    try {
      await next;
    } catch (failure) {
      // 重建失败（如离线）：列表刷新或编辑页重试会再次按服务器内容建立
      this.changed();
      throw failure;
    }
  }

  private async createSession(info: SharedDocumentInfo): Promise<RuntimeSession> {
    if (this.stopped) throw new Error("COLLAB_STOPPED: 协作运行时已停止");
    const listed = this.rooms.has(info.id);
    let cached = await tauri.collabReadCache(info.id);
    const recovery = await tauri.collabRecovery(info.id);
    if (recovery && recovery.serverUrl !== this.serverUrl)
      throw new Error("共享恢复记录属于另一服务器");
    // 本机发起的共享要把内容投影回原正文：重建缓存时沿用原来源绑定
    const source = recovery?.source ?? cached?.metadata.source;
    const close = recovery?.close ?? cached?.metadata.close;
    if (close) throw new Error("共享正在收尾，已保留原正文并自动重试");
    let doc = new Y.Doc({ guid: info.id, gc: false });
    try {
      if (cached) {
        try {
          Y.applyUpdate(doc, base64ToBytes(cached.state));
          for (const update of cached.updates) Y.applyUpdate(doc, base64ToBytes(update));
          await validateNodeDocument(doc, {
            documentId: info.id,
            baselineId: String(doc.getMap("meta").get("baselineId")),
            epoch: Number(doc.getMap("meta").get("epoch")),
          });
        } catch (failure) {
          doc.destroy();
          doc = new Y.Doc({ guid: info.id, gc: false });
          cached = await this.discardCache(info, describeError(failure, "本机缓存不可读"));
        }
      }
      try {
        const { state } = await this.loadState(info.id);
        const remote = new Y.Doc({ gc: false });
        try {
          Y.applyUpdate(remote, base64ToBytes(state));
          await validateNodeDocument(remote, {
            documentId: info.id,
            baselineId: String(remote.getMap("meta").get("baselineId")),
            epoch: Number(remote.getMap("meta").get("epoch")),
          });
          if (
            cached &&
            ["version", "baselineId", "epoch"].some(
              key => doc.getMap("meta").get(key) !== remote.getMap("meta").get(key)
            )
          ) {
            // 远端已换代：旧缓存不能合入新基线，备份后按服务器内容重建
            doc.destroy();
            doc = new Y.Doc({ guid: info.id, gc: false });
            cached = await this.discardCache(info, "协作端基线已变化");
          }
          Y.applyUpdate(doc, base64ToBytes(state));
        } finally {
          remote.destroy();
        }
      } catch (failure) {
        if (!cached || !canRetryRead(failure)) throw failure;
      }
      if (this.stopped) throw new Error("COLLAB_STOPPED: 协作运行时已停止");
      const session: RuntimeSession = {
        inputDrafts: new Map(
          (cached?.inputDrafts ?? []).map(draft => [
            JSON.stringify([draft.viewId, draft.nodeId, draft.field]),
            draft,
          ])
        ),
        info: {
          ...cached?.metadata,
          ...(source ? { source } : {}),
          ...(this.rooms.get(info.id) ?? info),
          serverUrl: this.serverUrl,
          mode: "shared",
          connection: "connecting",
          pending: cached?.metadata.pending ?? false,
          leaving: Boolean(close),
          frozen: false,
          remoteVersionAvailable: false,
          error: undefined,
        },
        doc,
        awareness: new Awareness(doc),
        provider: null,
        writeTail: Promise.resolve(),
        pendingUpdates: [],
        nodeViews: {},
        resourcesDirty: true,
        close,
      };
      await tauri.collabWriteCache(
        {
          documentId: info.id,
          ...nodeRetentions(doc),
          metadata: {
            ...session.info,
            close,
            baselineId: readDocumentIdentity(doc).baselineId,
            epoch: Number(doc.getMap("meta").get("epoch") ?? 0),
          },
          state: bytesToBase64(Y.encodeStateAsUpdate(doc)),
          expectedRevision: cached?.revision,
          confirmedDrafts: matchingInputDrafts(doc, [...session.inputDrafts.values()]),
        },
        true
      );
      session.nodeViews = await tauri.collabNodeViews(info.id);
      session.assetsPending = await tauri.collabResource<boolean>(
        this.resourceContext(session),
        "pending"
      );
      if (this.stopped || (listed && !this.rooms.has(info.id))) {
        session.awareness.destroy();
        throw new Error("COLLAB_NOT_FOUND: 协作会话已失效，请重新打开");
      }
      const onDocUpdate = (update: Uint8Array) => {
        session.resourcesDirty = true;
        void this.persist(session, update).catch(() => {});
        session.info.title = doc.getText("title").toString();
        this.changed();
      };
      doc.on("update", onDocUpdate);
      session.detachDocListener = () => doc.off("update", onDocUpdate);
      this.sessions.set(info.id, session);
      session.releaseResourceSource = registerContentResourceSource(info.id, {
        doc,
        localize: references =>
          tauri.collabResource<Record<string, string>>(
            this.resourceContext(session),
            "localize",
            references
          ),
      });
      this.attach(session);
      this.changed();
      return session;
    } catch (failure) {
      doc.destroy();
      throw failure;
    }
  }

  /** 缓存可重建：备份后丢弃。返回 null 表示已无缓存。 */
  private async discardCache(info: SharedDocumentInfo, reason: string): Promise<null> {
    await tauri.collabDiscardCache(info.id, reason);
    return null;
  }

  /** 服务端 state 采用 base64；弱网下允许有限重试，避免单个文档阻塞整个列表。 */
  private async loadState(documentId: string) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= DOCUMENT_STATE_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await rest.getDocumentState(this.serverUrl, documentId);
      } catch (failure) {
        if (!canRetryRead(failure)) throw failure;
        lastError = failure;
        if (attempt < DOCUMENT_STATE_MAX_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, 400 * attempt));
        }
      }
    }
    throw lastError;
  }

  private transport(url: string) {
    let transport = this.transports.get(url);
    if (!transport) {
      transport = new HocuspocusProviderWebsocket({
        url: `${url.replace(/^http/, "ws")}/ws`,
        initialDelay: 1000,
        maxDelay: 30000,
      });
      this.transports.set(url, transport);
    }
    return transport;
  }

  private pauseProvider(session: RuntimeSession) {
    const provider = session.provider;
    if (!provider) return;
    const transport = this.transports.get(session.info.serverUrl);
    // 连接已断开时只注销文档路由，避免关闭帧进入下一条连接。
    if (
      transport &&
      transport.status !== "connected" &&
      transport.configuration.providerMap.get(provider.effectiveName) === provider
    )
      transport.configuration.providerMap.delete(provider.effectiveName);
    provider.detach();
    provider.synced = false;
  }

  private attach(session: RuntimeSession, closing = false) {
    const { id, serverUrl } = session.info;
    if (
      session.assetsPending ||
      session.info.frozen ||
      (session.info.leaving && !closing) ||
      session.info.status !== "active" ||
      session.doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION
    )
      return;
    if (!session.provider) {
      session.provider = new HocuspocusProvider({
        name: id,
        document: session.doc,
        awareness: session.awareness,
        websocketProvider: this.transport(serverUrl),
        token: async () =>
          (
            await rest.fetchTicket(serverUrl, id, {
              protocolVersion: NODE_DOCUMENT_VERSION,
              baselineId: String(session.doc.getMap("meta").get("baselineId")),
              epoch: Number(session.doc.getMap("meta").get("epoch")),
            })
          ).ticket,
        onStatus: ({ status }) => {
          session.info.connection =
            status === "connected"
              ? "connected"
              : status === "connecting"
                ? "connecting"
                : "offline";
          this.changed();
        },
        onSynced: ({ state }) => {
          if (!state) return;
          session.info.connection = "connected";
          session.info.error = undefined;
          if (!session.provider?.hasUnsyncedChanges && !session.assetsPending)
            session.info.pending = false;
          session.resourcesDirty = true;
          this.changed();
        },
        onUnsyncedChanges: ({ number }) => {
          if (session.info.status !== "active" || session.info.leaving) return;
          session.info.pending = number > 0 || Boolean(session.assetsPending);
          this.changed();
        },
        onAuthenticationFailed: () => {
          session.info.connection = "error";
          session.info.error = "协作身份验证失败或访问权限已变更";
          this.changed();
          void this.refresh();
        },
      });
      // 服务端会以设备身份覆写 user 与 activity，本地先写入可获得即时正确光标
      session.awareness.setLocalStateField("user", { id: this.deviceId, name: this.nickname });
      session.awareness.setLocalStateField("activity", "background");
    }
    session.provider.attach();
    void this.transport(serverUrl)
      .connect()
      .catch(() => {
        session.info.connection = "offline";
        this.changed();
      });
  }

  private async connectEvents(url: string) {
    if (this.eventSockets.has(url) || this.stopped) return;
    const { ticket } = await rest.fetchTicket(url, null);
    if (this.eventSockets.has(url) || this.stopped) return;
    const socket = new WebSocket(`${url.replace(/^http/, "ws")}/events`);
    this.eventSockets.set(url, socket);
    socket.onopen = () => socket.send(JSON.stringify({ ticket }));
    socket.onmessage = event => {
      let payload: CollaborationEvent;
      try {
        payload = JSON.parse(String(event.data)) as CollaborationEvent;
      } catch {
        return; // 无法解析的消息忽略，下次刷新取权威状态
      }
      if (payload.type === "refresh") {
        void this.refresh();
        return;
      }
      if (payload.type === "presence") {
        const session = this.sessions.get(payload.documentId);
        const room = this.rooms.get(payload.documentId);
        if (room) room.members = payload.members;
        if (session) session.info.members = payload.members;
        if (room || session) this.changed();
        return;
      }
      const session = this.sessions.get(payload.documentId);
      const removed = this.rooms.delete(payload.documentId);
      if (session) this.revokeSession(session, payload.type);
      else if (removed) this.changed();
    };
    socket.onclose = () => {
      this.eventSockets.delete(url);
      this.scheduleEventsReconnect(url);
    };
  }

  /** /events 连接失败或断开后的兜底重连：不等 60s 轮询，尽快恢复事件推送。
   *  只重连当前配置的服务器——切换服务器时 teardown 关闭旧连接触发的
   *  onclose 不得把已废弃的旧服务器拉回重连循环。 */
  private scheduleEventsReconnect(url: string) {
    if (this.stopped || url !== this.serverUrl || this.eventSockets.has(url)) return;
    setTimeout(() => {
      if (this.stopped || url !== this.serverUrl || this.eventSockets.has(url)) return;
      void this.connectEvents(url).catch(() => this.scheduleEventsReconnect(url));
    }, EVENT_RECONNECT_MS);
  }

  private revokeSession(session: RuntimeSession, kind: "revoked" | "closed") {
    // 服务端 close 广播不排除发起者，本机主动结束共享时自己也会收到 closed；
    // 收尾与提示由 leave 流程负责，这里忽略以免和「已结束共享」重复提示
    if (session.info.leaving) return;
    const { id, title } = session.info;
    pushCollaborationNotice({ id: `${id}:${Date.now()}`, kind, documentId: id, title });
    this.disposeSession(id);
    void this.clearLocalBindings(id);
    this.changed();
  }

  private disposeSession(documentId: string) {
    const session = this.sessions.get(documentId);
    if (!session) return;
    if (session.provider) {
      session.provider.destroy();
      session.provider = null;
    }
    session.detachDocListener?.();
    session.releaseResourceSource?.();
    // 仅停止网络与广播：仍挂载的编辑器持有该 Y.Doc，销毁会导致随后输入报错；
    // 失去引用的 doc 由 GC 回收。
    session.awareness.setLocalState(null);
    this.sessions.delete(documentId);
    if (useCollaborationStore.getState().sessions.some(item => item.id === documentId)) {
      this.changed();
    }
  }

  /** 等待同步；调用方在超时后检查状态，不放行尚未确认的改动。 */
  private async flush(session: RuntimeSession) {
    await this.flushCache(session.info.id);
    if (!session.assetsPending) {
      if (!session.provider) this.attach(session, true);
      else session.provider.attach();
    }
    const provider = session.provider;
    if (!provider) return;
    const deadline = Date.now() + FLUSH_TIMEOUT_MS;
    while ((!provider.synced || provider.hasUnsyncedChanges) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /** 状态广播：sessions 元素浅拷贝（切断与内部对象的引用共享，订阅方可安全做相等比较），
   *  且仅在摘要变化时真正写入 store——同步回调可能在打字时毫秒级触发，绝大多数广播
   *  不产生新状态，直接写 store 会让所有订阅组件无谓重渲染。 */
  private broadcastSummary = "";
  private changed() {
    // 启动失败时 stopped 与 error 同时成立，须先判 error，否则失败会显示成「未启用」；
    // 主动 stop 经 teardown 清空 error，仍落到 idle
    const status = this.error ? "error" : this.stopped ? "idle" : "ready";
    const sessions = [...this.sessions.values()].map(session => ({ ...session.info }));
    for (const room of this.rooms.values()) {
      if (
        room.kind !== "content" ||
        room.protocolVersion !== NODE_DOCUMENT_VERSION ||
        this.sessions.has(room.id)
      )
        continue;
      sessions.push({
        ...room,
        serverUrl: this.serverUrl,
        mode: "shared",
        connection: "idle",
        pending: false,
        leaving: false,
      });
    }
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    const summary = JSON.stringify([
      this.serverUrl,
      this.nickname,
      this.deviceId,
      sessions,
      this.requests,
      this.error,
      status,
    ]);
    if (summary === this.broadcastSummary) return;
    this.broadcastSummary = summary;
    setCollaborationState({
      serverUrl: this.serverUrl,
      nickname: this.nickname,
      deviceId: this.deviceId,
      sessions,
      requests: this.requests,
      error: this.error,
      status,
    });
  }
}

export const collaborationManager = new CollaborationManager();

export type { RuntimeSession };

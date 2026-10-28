import { readDocumentIdentity } from "@tau/collaboration";
import { matchingInputDrafts, nodeRetentions } from "./retention";
// 协作运行时单例：会话编排（发现 / 连接 / 重连 / 退出）、事件流与 presence 汇聚。
//
// 与桌面端的架构差异：桌面主进程与渲染进程分处两个 JS 环境，需要 Y.Doc 副本 + IPC
// 批量转发与重试队列；移动端协作运行时与编辑器同处一个 WebView，视图直接复用会话的
// Y.Doc / Awareness，因此无需副本、批量 merge 与重试逻辑。
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import {
  DEFAULT_COLLABORATION_URL,
  createNodeDocument,
  readNodeDocument,
  validateNodeDocument,
  NODE_DOCUMENT_VERSION,
  type SourceBinding,
  type CollaborationEvent,
  type CollaborationSession,
  type ContentNode,
  type JoinRequest,
  type SharedDocumentInfo,
} from "@tau/collaboration";
import { base64ToBytes, bytesToBase64 } from "@tau/collaboration/src/encoding";
import * as tauri from "../../../services/tauri";
import {
  clearCachedInvitation,
  readCachedInvitation,
  writeCachedInvitation,
} from "./invitation-cache";
import * as rest from "./rest";
import { pushCollaborationNotice, setCollaborationState, useCollaborationStore } from "./store";

/** 列表新鲜度主要靠 /events 推送，轮询只作兜底（桌面为 15s，移动端放宽省电） */
const REFRESH_INTERVAL_MS = 60_000;
const EVENT_RECONNECT_MS = 5_000;
/** 退出/结束共享前等待未同步更新落服务器的上限（对齐设计文档，超时后继续退出） */
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
  /** 会话拆除时摘除 doc 上的标题监听 */
  detachDocListener?: () => void;
};

function describeError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

/** 幂等键摘要：与桌面端同思路，重复发起共享不会创建重复房间 */
async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

class CollaborationManager {
  private sessions = new Map<string, RuntimeSession>();
  /** 进行中的会话建立（按 documentId 去重）：列表刷新与编辑页就地补建可能并发触发 */
  private opening = new Map<string, Promise<RuntimeSession>>();
  private transports = new Map<string, HocuspocusProviderWebsocket>();
  private eventSockets = new Map<string, WebSocket>();
  private pendingJoins = new Map<string, number>();
  private requests: JoinRequest[] = [];
  private readonly serverUrl = DEFAULT_COLLABORATION_URL;
  private nickname = "Tau 用户";
  private deviceId?: string;
  private error?: string;
  private refreshing = false;
  private starting: Promise<void> | null = null;
  /** start 的最新目标配置：启动过程中 stop→start 交错时，由启动循环接续消费 */
  private desired: { nickname: string } | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
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
    let documents: SharedDocumentInfo[];
    try {
      ({ documents } = await rest.listDocuments(this.serverUrl));
    } catch (failure) {
      const cached = await tauri.collabReadCache(documentId);
      if (
        !cached ||
        cached.metadata.serverUrl !== this.serverUrl ||
        cached.metadata.status !== "active"
      )
        throw failure;
      return (await this.openSession(cached.metadata)).info;
    }
    const info = documents.find(item => item.id === documentId);
    if (!info) throw new Error("COLLAB_NOT_FOUND: 协作文档不存在或已失去访问权限");
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
    session.provider?.destroy();
    session.provider = null;
    const transport = this.transports.get(session.info.serverUrl);
    transport?.destroy();
    this.transports.delete(session.info.serverUrl);
    session.info.connection = "connecting";
    session.info.error = undefined;
    this.attach(session);
    this.changed();
  }
  async refresh() {
    if (this.refreshing || this.stopped) return;
    this.refreshing = true;
    try {
      const serverUrl = this.serverUrl;
      const { documents } = await rest.listDocuments(serverUrl);
      // 会话建立幂等（按 documentId 去重），并行拉取各自 state；单个文档失败
      // （弱网重试耗尽/迟到停机）不阻断整个列表——逐项容错，全部失败才按连接失败处理
      const settled = await Promise.allSettled(documents.map(info => this.openSession(info)));
      const firstRejection = settled.find(result => result.status === "rejected");
      if (firstRejection && settled.every(result => result.status === "rejected"))
        throw (firstRejection as PromiseRejectedResult).reason;
      const available = new Set(documents.map(item => item.id));
      for (const session of [...this.sessions.values()]) {
        if (available.has(session.info.id) || session.info.status !== "active") continue;
        this.revokeSession(session, "revoked");
      }
      this.requests = (await rest.listJoinRequests(serverUrl)).requests;
      this.error = undefined;
      void this.connectEvents(serverUrl).catch(() => this.scheduleEventsReconnect(serverUrl));
    } catch (failure) {
      this.error = describeError(failure, "协作服务器暂时无法连接");
    } finally {
      this.refreshing = false;
      // refresh 等待期间被 stop：重新收敛到空闲态，避免迟到会话污染状态
      if (this.stopped) this.stop();
      else this.changed();
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
    if (result.status === "pending" && !this.sessions.has(result.documentId)) {
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

  /** 退出协作：owner 结束共享（清空云端数据），成员仅移除自己；两者都解除
   *  本地绑定与协作码缓存（桌面端 clearBinding 同义）。仍有未同步改动时拒绝退出：
   *  owner 关闭会清空云端且本地无持久缓存，强退等于丢弃这些编辑（对齐桌面
   *  prepareLeave 的拦截）。REST 失败时保留会话与重试能力（云端房间不能悬空）。 */
  async leave(documentId: string) {
    const session = this.sessions.get(documentId);
    if (!session) return;
    session.info.leaving = true;
    this.changed();
    await this.flush(session);
    if (session.provider?.hasUnsyncedChanges) {
      session.info.leaving = false;
      this.changed();
      throw new Error("COLLAB_UNSYNCED: 改动尚未同步完成，请稍后再试");
    }
    const owned = session.info.role === "owner";
    try {
      await this.project(documentId);
      if (owned) {
        const state = Y.encodeStateAsUpdate(session.doc);
        const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(state));
        const revision = [...new Uint8Array(digest)]
          .map(byte => byte.toString(16).padStart(2, "0"))
          .join("");
        await rest.closeDocument(this.serverUrl, documentId, revision);
      } else await rest.leaveDocument(this.serverUrl, documentId);
    } catch (failure) {
      // 关闭/退出未送达服务器：保留会话（leaving 复位以便再次尝试），否则
      // owner 侧云端房间无人能关、成员侧 refresh 又把会话拉回来
      session.info.leaving = false;
      session.info.error = describeError(
        failure,
        owned ? "结束共享失败，请稍后重试" : "退出协作失败，请稍后重试"
      );
      this.changed();
      throw failure;
    }
    session.info.status = "closed";
    await this.persist(session);
    this.disposeSession(documentId);
    await this.clearLocalBindings(documentId);
    await this.refresh();
  }

  /** 解除该房间的本地绑定（仅本机发起时存在）并清理协作码缓存；失败不阻塞退出，
   *  残留绑定由投影通道的漂移检测兜底清理。 */
  private async clearLocalBindings(documentId: string) {
    try {
      const bindings = await tauri.collabListBindings();
      const mine = bindings.filter(binding => binding.documentId === documentId);
      for (const binding of mine) await tauri.collabUnbindContent(binding.contentId);
    } catch {
      // 忽略：绑定残留可被投影漂移检测清理
    }
    clearCachedInvitation(documentId);
  }

  /** 发布当前正文与契约，发布中的快照先保存在本机，重试复用同一房间。 */
  async shareContent(source: {
    contentId: number;
    title: string;
    content: unknown[];
    bannerBg?: string;
    bannerPosition?: string;
    sourceType?: string;
    sourceId?: number;
  }): Promise<{ documentId: string; code: string; expiresAt: number }> {
    await this.whenReady();
    const detail = await tauri.getContentDetail(source.contentId);
    if (!detail.contracts || !detail.documentId || !detail.librarySourceId || !detail.revision)
      throw new Error("正文格式不受支持，无法发起共享");
    if (JSON.stringify(detail.content) !== JSON.stringify(source.content))
      throw new Error("本机编辑尚未确认保存，请保存后重试共享");
    const existing = await tauri.collabGetBinding(source.contentId);
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
      const pending = previous?.status === "active" ? previous : undefined;
      if (pending) documentId = pending.id;
      else {
        const key = await sha256Hex(
          JSON.stringify([
            "tau-mobile",
            this.serverUrl,
            detail.librarySourceId,
            detail.documentId,
            previous?.id ?? "initial",
          ])
        );
        documentId = (await rest.createDocument(this.serverUrl, key)).id;
      }
      let cached = await tauri.collabReadCache(documentId);
      if (!cached) {
        const doc = await createNodeDocument(
          { documentId, baselineId: crypto.randomUUID(), epoch: 0 },
          {
            title: source.title,
            content: detail.content as ContentNode[],
            bannerBg: source.bannerBg ?? "",
            bannerPosition: source.bannerPosition ?? "center",
          },
          detail.contracts
        );
        try {
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
        cached = await tauri.collabReadCache(documentId);
      }
      if (!cached || cached.metadata.source?.projectionRevision !== detail.revision)
        throw new Error("待发布副本与本机正文已变化，原发布快照已保留");
      await rest.publishDocument(this.serverUrl, documentId, cached.state);
      await tauri.collabBindContent({
        ...source,
        documentId,
        serverUrl: this.serverUrl,
        expectedDocumentId: detail.documentId,
        expectedSourceId: detail.librarySourceId,
        expectedRevision: detail.revision,
      });
    }
    await this.openDocument(documentId);
    await this.project(documentId);
    const invitation =
      readCachedInvitation(documentId) ?? (await rest.rotateInvitation(this.serverUrl, documentId));
    writeCachedInvitation(documentId, invitation);
    return { documentId, ...invitation };
  }

  async project(documentId: string): Promise<void> {
    const session = this.sessions.get(documentId);
    if (
      !session?.info.source ||
      session.info.frozen ||
      session.doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION
    )
      return;
    if (session.projection) return session.projection;
    session.projection = (async () => {
      await this.flushCache(documentId);
      const source = session.info.source!;
      const result = await tauri.collabProjectContent({
        documentId,
        contentId: source.contentId,
        content: readNodeDocument(session.doc).content,
        count: 0,
        contracts: session.doc.getMap("node-tree:contracts").toJSON(),
        expectedRevision: source.projectionRevision,
        expectedDocumentId: source.contentDocumentId,
        expectedSourceId: source.librarySourceId,
      });
      if (!result.projected) throw new Error("本机正文关联已变化，协作副本已保留");
      source.projectionRevision = result.revision;
      await this.persist(session);
    })().finally(() => {
      session.projection = undefined;
    });
    return session.projection;
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
      session.provider?.destroy();
      session.provider = null;
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
  }

  private teardown() {
    this.stopped = true;
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    for (const socket of this.eventSockets.values()) socket.close();
    this.eventSockets.clear();
    for (const documentId of [...this.sessions.keys()]) this.disposeSession(documentId);
    for (const transport of this.transports.values()) transport.destroy();
    this.transports.clear();
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
    session.awareness.setLocalState(null);
    await session.writeTail.catch(() => undefined);
    if (this.sessions.get(id) !== session) return;
    this.sessions.delete(id);
    const cached = await tauri.collabReadCache(id);
    if (cached) await this.discardCache(session.info, cached, reason);
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
    let cached = await tauri.collabReadCache(info.id);
    // 本机发起的共享要把内容投影回原正文：重建缓存时沿用原来源绑定
    const source = cached?.metadata.source;
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
          cached = await this.discardCache(info, cached, describeError(failure, "本机缓存不可读"));
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
            cached = await this.discardCache(info, cached, "协作端基线已变化");
          }
          Y.applyUpdate(doc, base64ToBytes(state));
        } finally {
          remote.destroy();
        }
      } catch (failure) {
        if (!cached) throw failure;
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
          ...info,
          serverUrl: this.serverUrl,
          mode: "shared",
          connection: "connecting",
          pending: cached?.metadata.pending ?? false,
          leaving: false,
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
      };
      await tauri.collabWriteCache(
        {
          documentId: info.id,
          ...nodeRetentions(doc),
          metadata: {
            ...session.info,
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
      const onDocUpdate = (update: Uint8Array) => {
        void this.persist(session, update).catch(() => {});
        session.info.title = doc.getText("title").toString();
        this.changed();
      };
      doc.on("update", onDocUpdate);
      session.detachDocListener = () => doc.off("update", onDocUpdate);
      this.sessions.set(info.id, session);
      this.attach(session);
      this.changed();
      return session;
    } catch (failure) {
      doc.destroy();
      throw failure;
    }
  }

  /** 缓存可重建：备份后丢弃；备份里有未同步的改动时给一次轻提示。返回 null 表示已无缓存。 */
  private async discardCache(
    info: SharedDocumentInfo,
    cached: NonNullable<Awaited<ReturnType<typeof tauri.collabReadCache>>>,
    reason: string
  ): Promise<null> {
    await tauri.collabDiscardCache(info.id, reason);
    if (cached.metadata.pending || cached.updates.length || cached.inputDrafts.length)
      pushCollaborationNotice({
        id: `${info.id}:rebuilt:${Date.now()}`,
        kind: "rebuilt",
        documentId: info.id,
        title: info.title || cached.metadata.title || "未命名内容",
      });
    return null;
  }

  /** 服务端 state 采用 base64；弱网下允许有限重试，避免单个文档阻塞整个列表。 */
  private async loadState(documentId: string) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= DOCUMENT_STATE_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await rest.getDocumentState(this.serverUrl, documentId);
      } catch (failure) {
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

  private attach(session: RuntimeSession) {
    const { id, serverUrl } = session.info;
    if (
      session.provider ||
      session.info.frozen ||
      session.info.leaving ||
      session.info.status !== "active" ||
      session.doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION
    )
      return;
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
          status === "connected" ? "connected" : status === "connecting" ? "connecting" : "offline";
        this.changed();
      },
      onSynced: ({ state }) => {
        if (!state) return;
        session.info.connection = "connected";
        session.info.error = undefined;
        if (!session.provider?.hasUnsyncedChanges) session.info.pending = false;
        this.changed();
      },
      onUnsyncedChanges: ({ number }) => {
        if (session.info.status !== "active" || session.info.leaving) return;
        session.info.pending = number > 0;
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
        if (session) {
          session.info.members = payload.members;
          this.changed();
        }
        return;
      }
      const session = this.sessions.get(payload.documentId);
      if (session) this.revokeSession(session, payload.type);
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
    // 仅停止网络与广播：仍挂载的编辑器持有该 Y.Doc，销毁会导致随后输入报错；
    // 失去引用的 doc 由 GC 回收。
    session.awareness.setLocalState(null);
    this.sessions.delete(documentId);
    if (useCollaborationStore.getState().sessions.some(item => item.id === documentId)) {
      this.changed();
    }
  }

  /** 等待未同步改动落服务器；超时后仍继续退出（重连时可再交换） */
  private async flush(session: RuntimeSession) {
    await this.flushCache(session.info.id);
    const provider = session.provider;
    if (!provider) return;
    const deadline = Date.now() + FLUSH_TIMEOUT_MS;
    while (provider.hasUnsyncedChanges && Date.now() < deadline) {
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

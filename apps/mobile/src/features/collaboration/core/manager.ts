// 协作运行时单例：会话编排（发现 / 连接 / 重连 / 退出）、事件流与 presence 汇聚。
//
// 与桌面端的架构差异：桌面主进程与渲染进程分处两个 JS 环境，需要 Y.Doc 副本 + IPC
// 批量转发与重试队列；移动端协作运行时与编辑器同处一个 WebView，视图直接复用会话的
// Y.Doc / Awareness，因此无需副本、批量 merge 与重试逻辑。
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import {
  createSharedDocument,
  readSharedContent,
  replaceSharedContent,
} from "@tau/collaboration/src/document";
import {
  DEFAULT_COLLABORATION_URL,
  type CollaborationEvent,
  type CollaborationSession,
  type ContentNode,
  type JoinRequest,
  type SharedDocumentInfo,
} from "@tau/collaboration";
import { base64ToBytes, bytesToBase64 } from "@tau/collaboration/src/encoding";
import { getContentLength } from "@tau/collaboration/src/content-length";
import * as tauri from "../../../services/tauri";
import {
  clearCachedInvitation,
  readCachedInvitation,
  writeCachedInvitation,
} from "./invitation-cache";
import {
  cloudContentOf,
  collectPlaceholderIds,
  mergeSessionPrivateNodes,
  restoreOwnerPrivateNodes,
} from "./private-blocks";
import * as rest from "./rest";
import { pushCollaborationNotice, setCollaborationState, useCollaborationStore } from "./store";

/** 列表新鲜度主要靠 /events 推送，轮询只作兜底（桌面为 15s，移动端放宽省电） */
const REFRESH_INTERVAL_MS = 60_000;
const EVENT_RECONNECT_MS = 5_000;
/** 退出/结束共享前等待未同步更新落服务器的上限（对齐设计文档，超时后继续退出） */
const FLUSH_TIMEOUT_MS = 10_000;
const DOCUMENT_STATE_MAX_ATTEMPTS = 3;
/** 最后一个协作页面关闭后，运行时再保留的空闲窗口：覆盖「跳出去看一眼设置」的往返 */
const IDLE_STOP_DELAY_MS = 30_000;

type RuntimeSession = {
  info: CollaborationSession;
  doc: Y.Doc;
  awareness: Awareness;
  provider: HocuspocusProvider | null;
  /** 私有块真身仅保存在数据持有方本机；加入方为空，远端渲染为占位符 */
  privateNodes: Map<string, ContentNode>;
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
  private requests: JoinRequest[] = [];
  private serverUrl = DEFAULT_COLLABORATION_URL;
  private nickname = "Tau 用户";
  private deviceId?: string;
  private error?: string;
  private refreshing = false;
  private starting: Promise<void> | null = null;
  /** start 的最新目标配置：启动过程中切换服务器时，由启动循环接续消费 */
  private desired: { serverUrl: string; nickname: string } | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private lifecycleCleanup: (() => void) | null = null;
  private refCount = 0;
  private stopped = true;

  /** 运行时持有计数（协作页面挂载 +1 / 卸载 -1）：归零后延迟空闲停止 */
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
      // 有未同步改动时推迟停止（无本地缓存，停止即丢失），下一轮空闲检查再试
      if (this.refCount > 0 || this.hasPendingUpdates()) {
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

  get configuredServerUrl() {
    return this.serverUrl;
  }

  get configuredNickname() {
    return this.nickname;
  }

  /** 配置并启动运行时；同服务器重复调用为幂等，切换服务器会先拆除旧连接。
   *  昵称变更不触发重启——请用 updateNickname 同步，避免打断进行中的同步。
   *  启动进行中收到新目标（如切换服务器）时，由启动循环在当前轮结束后接续处理。 */
  start(options: { serverUrl: string; nickname: string }): Promise<void> {
    this.desired = {
      serverUrl: options.serverUrl.trim() || DEFAULT_COLLABORATION_URL,
      nickname: options.nickname.trim() || "Tau 用户",
    };
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
        // 取走式消费：await 期间收到的新目标（切服/开关）由下一轮循环接续处理
        const target = this.desired;
        this.desired = null;
        if (this.stopped || target.serverUrl !== this.serverUrl) {
          this.teardown();
          this.serverUrl = target.serverUrl;
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
   *  协作页面漏挂 runtime（防御）：按用户设置就地启动，避免把请求发往默认服务器。 */
  /** 读取 starting 的稳定通道：方法调用不做控制流收窄，await 之后仍能读到并发启动 */
  private pendingStart(): Promise<void> | null {
    return this.starting;
  }

  private async whenReady() {
    if (!this.starting && this.stopped) {
      const stored = await this.readStoredConfig();
      // await 期间并发启动（页面挂载 runtime）时不重复启动
      const pending = this.pendingStart();
      if (pending) return pending.catch(() => {});
      if (stored) await this.start(stored).catch(() => {});
    }
    if (this.starting) await this.starting.catch(() => {});
  }

  private async readStoredConfig(): Promise<{ serverUrl: string; nickname: string } | null> {
    try {
      const setting = JSON.parse(await tauri.readSettingJson()) as {
        collaboration?: { enable?: boolean; serverUrl?: string; nickname?: string };
      };
      const collaboration = setting.collaboration;
      if (!collaboration || collaboration.enable === false) return null;
      return {
        serverUrl: collaboration.serverUrl || DEFAULT_COLLABORATION_URL,
        nickname: collaboration.nickname || "Tau 用户",
      };
    } catch {
      return null;
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
    const { documents } = await rest.listDocuments(this.serverUrl);
    const info = documents.find(item => item.id === documentId);
    if (!info) throw new Error("COLLAB_NOT_FOUND: 协作文档不存在或已失去访问权限");
    return (await this.openSession(info)).info;
  }

  async reconnect(documentId: string) {
    const session = this.sessions.get(documentId);
    if (!session || session.info.status !== "active" || session.info.leaving) return;
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
    return this.act(serverUrl => rest.requestJoin(serverUrl, code));
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
      if (owned) await rest.closeDocument(this.serverUrl, documentId);
      else await rest.leaveDocument(this.serverUrl, documentId);
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

  /** 把本地内容发布为协作房间（设计稿 05）：剥离私有块 → 创建发布 → 绑定 →
   *  建会话并入私有块 → 首次投影 → 生成协作码。幂等键由内容标识派生，重复发起
   *  不会得到两个房间；已有绑定时复用现有房间，不重新发布也不轮换协作码
   *  （轮换会让已分发的旧码立即作废）。任何一步失败都整体抛错——绝不带着
   *  「私有块真身未并入会话」的状态假成功，否则投影会用占位符覆盖本机数据。 */
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
    const serverUrl = this.serverUrl;
    let existingBinding = await tauri.collabGetBinding(source.contentId).catch(() => null);
    if (existingBinding) {
      // 结束共享后服务端会把房间标记为 closed；若本地解绑在退场阶段失败，
      // 这里不能继续复用旧 documentId，否则重发会一直命中已关闭房间。
      if (existingBinding.serverUrl !== serverUrl) {
        await tauri.collabUnbindContent(source.contentId).catch(() => {});
        clearCachedInvitation(existingBinding.documentId);
        existingBinding = null;
      } else {
        const { documents } = await rest.listDocuments(serverUrl);
        const active = documents.some(document => document.id === existingBinding?.documentId);
        if (!active) {
          await tauri.collabUnbindContent(source.contentId).catch(() => {});
          clearCachedInvitation(existingBinding.documentId);
          existingBinding = null;
        }
      }
    }
    // 私有块（白板/数据库等）剥离后仅留本机；无论新建还是复用房间都要并入会话，
    // 复用路径依赖首次发起时的投影已把 collabId 标注写回本地内容（见首次投影）
    const privateNodes = new Map<string, ContentNode>();
    const doc = createSharedDocument(
      {
        title: source.title,
        content: source.content as ContentNode[],
        bannerBg: source.bannerBg ?? "",
        bannerPosition: source.bannerPosition ?? "center",
      },
      privateNodes,
      "shared"
    );
    let documentId: string;
    try {
      documentId = existingBinding
        ? existingBinding.documentId
        : await this.publishNewDocument(source, doc, serverUrl);

      // 就地建会话：不经 refresh（其互斥与容错会静默吞掉建会话失败）
      const session =
        this.sessions.get(documentId) ??
        (await this.openSession({
          id: documentId,
          title: source.title,
          ownerId: this.deviceId ?? "",
          role: "owner",
          status: "active",
          members: [],
          updatedAt: Date.now(),
        }));
      await this.seedSessionPrivateNodes(session, source, privateNodes);
    } finally {
      doc.destroy();
    }
    const cached = readCachedInvitation(documentId);
    const invitation = cached ?? (await rest.rotateInvitation(serverUrl, documentId));
    writeCachedInvitation(documentId, invitation);
    // 非阻塞刷新：让协作中心列表尽快出现新房间
    void this.refresh();
    return { documentId, ...invitation };
  }

  /** 无绑定时的新发布路径：创建（幂等键去重）→ 发布快照 → 写本地绑定 */
  private async publishNewDocument(
    source: { contentId: number; title: string; sourceType?: string; sourceId?: number },
    doc: Y.Doc,
    serverUrl: string
  ): Promise<string> {
    const idempotencyKey = await sha256Hex(
      [
        "tau-mobile",
        serverUrl,
        String(source.contentId),
        source.sourceType ?? "",
        String(source.sourceId ?? ""),
      ].join(":")
    );
    const created = await rest.createDocument(serverUrl, idempotencyKey);
    await rest.publishDocument(serverUrl, created.id, bytesToBase64(Y.encodeStateAsUpdate(doc)));
    await tauri.collabBindContent({
      contentId: source.contentId,
      serverUrl,
      documentId: created.id,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      sourceTitle: source.title,
    });
    return created.id;
  }

  /** 并入剥离出的私有块真身并完成首次投影。首次投影以云端文档 + 会话私有块物化，
   *  把带 collabId 标注的完整内容写回本地库——此后本地私有块与云端占位符共享同一组
   *  collabId，会话重建时按标注稳定回填。投影失败显式抛错（房间与绑定已就绪，重试
   *  发起会走复用路径补投影）；绝不带着「标注未写回」的状态假成功，否则后续会话重建
   *  将失去真身对应关系（无标注即判冲突，不做树位置猜测）。 */
  private async seedSessionPrivateNodes(
    session: RuntimeSession,
    source: { contentId: number; content: unknown[] },
    stripped: Map<string, ContentNode>
  ) {
    const cloudContent = cloudContentOf(session.doc);
    const merged = mergeSessionPrivateNodes(cloudContent, stripped, session.privateNodes);
    if (!merged) {
      throw new Error(
        "COLLAB_PRIVATE_BLOCK_CONFLICT: 本地内容与协作房间已不一致，请结束共享后重新发起"
      );
    }
    const materialized = readSharedContent(session.doc, session.privateNodes);
    if (collectPlaceholderIds(materialized.content).length > 0) {
      throw new Error(
        "COLLAB_PRIVATE_BLOCK_CONFLICT: 私有块真身未能并入会话，请结束共享后重新发起"
      );
    }
    await tauri
      .collabProjectContent({
        contentId: source.contentId,
        content: materialized.content,
        count: getContentLength(materialized.content),
      })
      .catch(failure => {
        throw new Error(
          `COLLAB_PROJECTION_FAILED: 共享已创建，但本地标注写回失败，请重试发起以补齐（${describeError(failure, "投影失败")}）`
        );
      });
  }

  /** 「保留本机」：把协作不可用期间本地编辑的正文整树推回房间（CRDT 替换，远端看到一次
   *  删+插而非状态覆盖），随后周期投影把同一内容写回本地库。标题不推——房间标题由业务表
   *  管理，投影通道也只回写正文。 */
  pushLocalContent(documentId: string, content: ContentNode[]) {
    const session = this.sessions.get(documentId);
    if (!session) {
      throw new Error("COLLAB_SESSION_MISSING: 协作会话尚未就绪，请稍后重试");
    }
    replaceSharedContent(session.doc, content, session.privateNodes);
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
    this.deviceId = undefined;
    this.error = undefined;
  }

  /** 建立或刷新会话（幂等）：已存在的会话只合并服务端权威字段，
   *  并发调用（列表刷新 + 编辑页补建）按 documentId 去重，避免覆盖出双份 Y.Doc。 */
  private openSession(info: SharedDocumentInfo): Promise<RuntimeSession> {
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
      this.changed();
      return Promise.resolve(existing);
    }
    let pending = this.opening.get(info.id);
    if (!pending) {
      pending = this.createSession(info).finally(() => this.opening.delete(info.id));
      this.opening.set(info.id, pending);
    }
    return pending;
  }

  private async createSession(info: SharedDocumentInfo): Promise<RuntimeSession> {
    if (this.stopped) throw new Error("COLLAB_STOPPED: 协作运行时已停止");
    const { state } = await this.loadState(info.id);
    // loadState 期间可能发生 stop/切服，迟到会话直接作废，避免停止后残留连接
    if (this.stopped) throw new Error("COLLAB_STOPPED: 协作运行时已停止");
    const doc = new Y.Doc({ guid: info.id });
    Y.applyUpdate(doc, base64ToBytes(state));
    const session: RuntimeSession = {
      info: {
        ...info,
        serverUrl: this.serverUrl,
        mode: "shared",
        connection: "connecting",
        pending: false,
        leaving: false,
      },
      doc,
      awareness: new Awareness(doc),
      provider: null,
      privateNodes: new Map(),
    };
    // 标题是 Y.Text：任何一端改名都要即时反映到会话列表与编辑页顶栏；
    // 会话拆除时摘除监听（doc 本体可能仍被挂载中的编辑器持有）
    const onDocUpdate = () => {
      const title = doc.getText("title").toString();
      if (session.info.title !== title) {
        session.info.title = title;
        this.changed();
      }
    };
    doc.on("update", onDocUpdate);
    session.detachDocListener = () => doc.off("update", onDocUpdate);
    this.sessions.set(info.id, session);
    this.attach(session);
    this.changed();
    // 私有块真身仅存本机（云端只有占位符）：会话重建时从本地内容恢复，
    // 否则编辑/投影会把真身降级成占位符写回本地（对齐桌面 restorePrivateNodes）；
    // 失败留空，由投影侧的占位符防覆盖兜底
    void restoreOwnerPrivateNodes(info.id, cloudContentOf(doc), session.privateNodes).catch(
      () => {}
    );
    return session;
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
    if (session.provider || session.info.leaving || session.info.status !== "active") return;
    session.provider = new HocuspocusProvider({
      name: id,
      document: session.doc,
      awareness: session.awareness,
      websocketProvider: this.transport(serverUrl),
      token: async () => (await rest.fetchTicket(serverUrl, id)).ticket,
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
    const status = this.stopped ? "idle" : this.error ? "error" : "ready";
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

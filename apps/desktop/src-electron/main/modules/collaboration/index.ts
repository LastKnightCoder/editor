import { app, BrowserWindow, dialog, type IpcMainInvokeEvent } from "electron";
import log from "electron-log";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { WebSocket } from "ws";
import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import { createHash, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { basename, join } from "node:path";
import {
  DEFAULT_COLLABORATION_URL,
  SOURCE_TYPES,
  createSharedDocument,
  migrateTabsBlocksInDoc,
  migrateKnowledgeDocument,
  readSharedContent,
  replaceText,
  type ContentSessionTarget,
  type ContentSessionSnapshot,
  type CollaborationEvent,
  type CollaborationSession,
  type CollaborationState,
  type ContentNode,
  type JoinRequest,
  type SharedContent,
  type SharedDocumentInfo,
  type SourceBinding,
  type SourceType,
} from "@tau/collaboration";
import PathUtil from "../../utils/PathUtil";
import databaseModule from "../database";
import { readKnowledgeMapping } from "@tau/db-schema/src/knowledge-migration";
import { migrateKnowledgeReferences } from "@tau/db-schema/src/knowledge-references";
import ContentTable from "../tables/content";
import {
  restoreContentBinding,
  restorePrivateNodes,
  writeContentProjection,
} from "./content-repository";
import { CollaborationAssetService } from "./asset-service";
import { CollaborationClient } from "./client";
import { registerCollaborationIpc } from "./ipc-controller";
import type { RuntimeSession } from "./types";
import { getContentLength } from "@/utils/helper";
import { CollaborationLocalStore } from "./local-store";
import { getDevelopmentServerUrl } from "./dev-server";
import { findCollaborationBinding } from "../collaboration-guard";
import {
  findContentTitle,
  projectContentTitle,
  projectLocalContent,
  registerContentSession,
  unregisterContentSession,
} from "./content-sessions";

class CollaborationManager {
  name = "collaboration";
  private store!: CollaborationLocalStore;
  private assets!: CollaborationAssetService;
  private client!: CollaborationClient;
  private projecting = new Set<string>();
  // 会话完成知识库引用转换后不再重复整树比对；会话对象重建时自然重查（迁移幂等）
  private knowledgeMigrated = new WeakSet<RuntimeSession>();
  private directory = "";
  private sessions = new Map<string, RuntimeSession>();
  private transports = new Map<string, HocuspocusProviderWebsocket>();
  private events = new Map<string, WebSocket>();
  private views = new Map<string, { documentId: string; windowId: number; clientIds: number[] }>();
  private requests: JoinRequest[] = [];
  private refreshing = false;
  private syncingResources = false;
  private error?: string;
  private stopped = false;
  private pendingCreates = new Map<string, Promise<{ documentId: string; code: string }>>();
  private freezeWaiters = new Map<string, () => void>();
  private closeWaiters = new Map<string, () => void>();
  private closingWindows = new Set<number>();
  private finishingLeaves = new Set<string>();
  private autoFlushInterval: ReturnType<typeof setInterval> | null = null;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private quitting = false;

  private get serverUrl() {
    return getDevelopmentServerUrl() || this.store.get("serverUrl", DEFAULT_COLLABORATION_URL);
  }
  private get nickname() {
    return this.store.get("nickname", "Tau 用户");
  }
  private state(): CollaborationState {
    return {
      serverUrl: this.serverUrl,
      nickname: this.nickname,
      deviceId: this.client.identities.get(this.serverUrl)?.id,
      sessions: [...this.sessions.values()]
        .filter(session => session.info.mode !== "local")
        .map(session => session.info),
      requests: this.requests,
      error: this.error,
    };
  }
  private broadcast(channel: string, value: unknown) {
    const documentId = (value as { documentId?: string })?.documentId;
    const targeted =
      documentId &&
      ["collaboration:update", "collaboration:awareness", "collaboration:freeze"].includes(channel);
    const subscribers = targeted
      ? new Set(
          [...this.views.values()]
            .filter(view => view.documentId === documentId)
            .map(view => view.windowId)
        )
      : undefined;
    for (const window of BrowserWindow.getAllWindows())
      if (!window.isDestroyed() && (!subscribers || subscribers.has(window.id)))
        window.webContents.send(channel, value);
  }
  private changed(session?: RuntimeSession) {
    if (session) this.store.metadata(session.info);
    if (session?.info.mode === "local") {
      this.broadcast("collaboration:session-error", {
        documentId: session.info.id,
        error: session.info.error,
      });
      return;
    }
    this.broadcast("collaboration:state", this.state());
  }

  private transport(url: string) {
    let transport = this.transports.get(url);
    if (!transport) {
      transport = new HocuspocusProviderWebsocket({
        url: `${url.replace(/^http/, "ws")}/ws`,
        WebSocketPolyfill: WebSocket,
        initialDelay: 1000,
        maxDelay: 30000,
      });
      this.transports.set(url, transport);
    }
    return transport;
  }
  private attach(session: RuntimeSession) {
    if (
      session.info.mode === "local" ||
      session.provider ||
      session.info.leaving ||
      session.info.status !== "active"
    )
      return;
    const { id, serverUrl } = session.info;
    const transport = this.transport(serverUrl);
    session.provider = new HocuspocusProvider({
      name: id,
      document: session.doc,
      awareness: session.awareness,
      websocketProvider: transport,
      token: async () =>
        (
          await this.client.request<{ ticket: string }>(serverUrl, "/v1/tickets", "POST", {
            documentId: id,
          })
        ).ticket,
      onStatus: ({ status }) => {
        session.info.connection =
          status === "connected" ? "connected" : status === "connecting" ? "connecting" : "offline";
        this.changed(session);
      },
      onSynced: ({ state }) => {
        if (!state) return;
        session.info.connection = "connected";
        session.info.error = undefined;
        if (!session.provider?.hasUnsyncedChanges && !this.assets.hasPending(id))
          session.info.pending = false;
        this.changed(session);
      },
      onUnsyncedChanges: ({ number }) => {
        if (session.info.status === "active" && !session.info.leaving)
          session.info.pending = number > 0 || this.assets.hasPending(id);
        this.changed(session);
      },
      onAuthenticationFailed: () => {
        session.info.connection = "error";
        session.info.error = "协作身份验证失败或访问权限已变更";
        this.changed(session);
        void this.refresh();
      },
    });
    session.provider.awareness?.setLocalStateField("activity", "background");
    if (!this.assets.hasPending(id)) session.provider.attach();
    void transport.connect().catch(() => {
      session.info.connection = "offline";
      this.changed(session);
    });
  }
  private restore(
    info: CollaborationSession,
    doc: Y.Doc,
    privateNodes = new Map<string, ContentNode>()
  ) {
    // 存量缓存（旧块字段 tabs 结构）惰性转换为 tab-pane 树内形态，幂等；
    // 转换结果随初始投影（projectionDirty）与 compact 全量快照持久化并同步到服务器
    migrateTabsBlocksInDoc(doc, privateNodes);
    if (info.source && !Number.isSafeInteger(info.source.contentCreatedAt))
      info.source = this.findLocalSource(info.id, info.serverUrl);
    const session: RuntimeSession = {
      info: {
        ...info,
        frozen: false,
        connection: info.mode === "local" ? "connected" : "connecting",
      },
      doc,
      awareness: new Awareness(doc),
      privateNodes,
      viewActiveTabs: new Map(),
      dirty: true,
      projectionDirty: true,
    };
    session.awareness.setLocalState(null);
    session.awareness.on(
      "update",
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
        this.broadcast("collaboration:awareness", {
          documentId: info.id,
          update: encodeAwarenessUpdate(session.awareness, [...added, ...updated, ...removed]),
        });
      }
    );
    this.sessions.set(info.id, session);
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== "renderer-persisted") this.store.append(info.id, update);
      session.dirty = true;
      session.projectionDirty = true;
      if (session.info.mode !== "local" && origin !== session.provider) session.info.pending = true;
      const title = doc.getText("title").toString();
      if (session.info.title !== title) {
        session.info.title = title;
        this.changed(session);
      }
      this.store.metadata(session.info);
      this.broadcast("collaboration:update", { documentId: info.id, update });
      this.broadcast("collaboration:content", {
        documentId: info.id,
        source: session.info.source,
        title,
      });
    });
    this.attach(session);
    return session;
  }
  private requireSession(id: string): RuntimeSession {
    const session = this.sessions.get(id);
    if (!session || session.info.leaving) throw new Error("这段内容已退出协作");
    return session;
  }

  /** 记录视图上报的激活 Tab，随下轮投影落库（激活态是本机视图状态，不进共享文档） */
  noteActiveTab(session: RuntimeSession, blockId: string, tabKey: string) {
    if (typeof blockId !== "string" || typeof tabKey !== "string" || !blockId || !tabKey)
      throw new Error("激活 Tab 参数不合法");
    session.viewActiveTabs.set(blockId, tabKey);
    session.projectionDirty = true;
  }

  private openContent(
    event: IpcMainInvokeEvent,
    target: ContentSessionTarget
  ): ContentSessionSnapshot {
    const { db, name } = this.databaseForEvent(event);
    if (target.sourceType && !SOURCE_TYPES.includes(target.sourceType))
      throw new Error("不支持的内容来源，请升级客户端");
    if (!Number.isSafeInteger(target.contentId) || target.contentId <= 0)
      throw new Error("内容 ID 不合法");
    const content = ContentTable.getContentById(db, target.contentId);
    if (!content) throw new Error("内容不存在");
    const binding = findCollaborationBinding(db, target.contentId);
    const id =
      binding?.document_id ||
      `local:${createHash("sha256")
        .update(JSON.stringify([db.name, content.id, content.createTime]))
        .digest("hex")}`;
    let session = this.sessions.get(id);
    if (binding && !session) throw new Error("协作会话尚未恢复，请稍后重试");
    if (!session) {
      const source: SourceBinding = {
        ...target,
        databaseName: name,
        contentId: content.id,
        contentCreatedAt: content.createTime,
      };
      const title =
        target.sourceType !== "card" && target.sourceTitle !== undefined
          ? target.sourceTitle
          : findContentTitle(db, content.id);
      const doc = createSharedDocument(
        {
          title,
          content: content.content as ContentNode[],
          bannerBg: "",
          bannerPosition: "center",
        },
        undefined,
        "local"
      );
      const info: CollaborationSession = {
        id,
        mode: "local",
        source,
        title,
        ownerId: "local",
        role: "owner",
        status: "active",
        members: [],
        updatedAt: Date.now(),
        serverUrl: "",
        connection: "connected",
        pending: false,
        leaving: false,
      };
      this.store.create(info, doc);
      session = this.restore(info, doc);
    }
    if (session.info.source?.contentCreatedAt !== content.createTime)
      throw new Error("原内容关联已变化");
    this.migrateKnowledgeSession(db, session);
    registerContentSession(db, content.id, session);
    return {
      documentId: id,
      mode: session.info.mode || "shared",
      title: session.doc.getText("title").toString(),
      frozen: Boolean(session.info.frozen),
      source: session.info.source,
    };
  }

  private acknowledgeFreeze(viewId: string) {
    this.closeWaiters.get(viewId)?.();
    const view = this.views.get(viewId);
    const session = view && this.sessions.get(view.documentId);
    if (!session?.drainingViews) return;
    session.drainingViews.delete(viewId);
    if (!session.drainingViews.size) this.freezeWaiters.get(session.info.id)?.();
  }

  private async freeze(session: RuntimeSession) {
    if (session.info.frozen) throw new Error("内容正在切换，请稍后重试");
    session.info.frozen = true;
    session.drainingViews = new Set(
      [...this.views].filter(([, view]) => view.documentId === session.info.id).map(([id]) => id)
    );
    const drained = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("有编辑窗口未完成保存，请稍后重试")),
        10000
      );
      this.freezeWaiters.set(session.info.id, () => {
        clearTimeout(timeout);
        resolve();
      });
      if (!session.drainingViews?.size) this.freezeWaiters.get(session.info.id)?.();
    });
    this.broadcast("collaboration:freeze", { documentId: session.info.id, frozen: true });
    try {
      await drained;
    } finally {
      this.freezeWaiters.delete(session.info.id);
    }
  }

  private removeWindowViews(windowId: number) {
    for (const [id, view] of this.views) if (view.windowId === windowId) this.removeView(id);
  }

  private registerWindow(window: BrowserWindow) {
    window.webContents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) this.removeWindowViews(window.id);
    });
    window.webContents.on("render-process-gone", () => this.removeWindowViews(window.id));
    window.on("close", event => {
      const views = [...this.views].filter(([, view]) => view.windowId === window.id);
      if (!views.length) return;
      event.preventDefault();
      if (this.closingWindows.has(window.id)) return;
      this.closingWindows.add(window.id);
      const timeoutMs = this.quitting ? 2000 : 10000;
      const tasks = views.map(
        ([id, view]) =>
          new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("编辑窗口未完成保存")), timeoutMs);
            this.closeWaiters.set(id, () => {
              clearTimeout(timeout);
              resolve();
            });
            window.webContents.send("collaboration:flush", { documentId: view.documentId });
          })
      );
      void Promise.all(tasks)
        .then(async () => {
          for (const id of new Set(views.map(([, view]) => view.documentId))) {
            const session = this.sessions.get(id);
            if (session?.info.mode === "local") await this.project(session);
          }
          if (!window.isDestroyed()) window.destroy();
        })
        .catch(async error => {
          if (window.isDestroyed()) return;
          if (this.quitting) {
            this.removeWindowViews(window.id);
            window.destroy();
            return;
          }
          for (const [, view] of views)
            window.webContents.send("collaboration:freeze", {
              documentId: view.documentId,
              frozen: false,
            });
          const result = await dialog.showMessageBox(window, {
            type: "warning",
            message: "部分内容未能确认保存",
            detail: String(error),
            buttons: ["保留窗口", "仍然关闭"],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
          });
          if (result.response === 1 && !window.isDestroyed()) {
            this.removeWindowViews(window.id);
            window.destroy();
          }
        })
        .finally(() => {
          for (const [id] of views) this.closeWaiters.delete(id);
          this.closingWindows.delete(window.id);
        });
    });
    window.once("closed", () => {
      this.removeWindowViews(window.id);
    });
  }

  private unfreeze(session: RuntimeSession) {
    session.info.frozen = false;
    session.drainingViews = undefined;
    this.broadcast("collaboration:freeze", { documentId: session.info.id, frozen: false });
  }

  private async prepareLeave(session: RuntimeSession) {
    if (session.info.frozen) throw new Error("内容正在切换，请稍后重试");
    try {
      await this.freeze(session);
      if (session.info.pending) throw new Error("仍有未同步改动，请等待同步后再退出");
    } catch (error) {
      this.unfreeze(session);
      throw error;
    }
  }

  private async connectEvents(url: string) {
    if (this.events.has(url) || this.stopped) return;
    const { ticket } = await this.client.request<{ ticket: string }>(url, "/v1/tickets", "POST", {
      documentId: null,
    });
    if (this.events.has(url) || this.stopped) return;
    const socket = new WebSocket(`${url.replace(/^http/, "ws")}/events`, {
      maxPayload: 1024 * 1024,
    });
    this.events.set(url, socket);
    socket.on("open", () => socket.send(JSON.stringify({ ticket })));
    socket.on("message", data => {
      try {
        const event = JSON.parse(data.toString()) as CollaborationEvent;
        if (event.type === "refresh") void this.refresh();
        else if (event.type === "presence") {
          const session = this.sessions.get(event.documentId);
          if (session) {
            session.info.members = event.members;
            this.changed(session);
          }
        } else {
          const session = this.sessions.get(event.documentId);
          if (session) void this.revoke(session, event.type);
        }
      } catch {
        /* 忽略无效状态消息，下次刷新会重新获取权威状态。 */
      }
    });
    socket.on("error", () => {});
    socket.on("close", () => {
      this.events.delete(url);
      if (!this.stopped)
        setTimeout(() => void this.connectEvents(url).catch(() => {}), 5000).unref();
    });
  }
  private async refresh() {
    if (this.refreshing || this.stopped || this.pendingCreates.size > 0) return;
    this.refreshing = true;
    try {
      const urls = new Set([
        this.serverUrl,
        ...[...this.sessions.values()]
          .filter(session => session.info.mode !== "local")
          .map(session => session.info.serverUrl),
      ]);
      for (const url of urls) {
        if (!this.store.get(`identity:${url}`, null)) continue;
        try {
          const { documents } = await this.client.request<{
            documents: SharedDocumentInfo[];
          }>(url, "/v1/documents");
          for (const info of documents) {
            const existing = this.sessions.get(info.id);
            if (existing) {
              Object.assign(existing.info, info);
              existing.info.source ||= this.findLocalSource(info.id, url);
              this.store.metadata(existing.info);
              continue;
            }
            const { state } = await this.client.request<{ state: string }>(
              url,
              `/v1/documents/${info.id}/state`
            );
            const doc = new Y.Doc();
            Y.applyUpdate(doc, Buffer.from(state, "base64"));
            const source = this.findLocalSource(info.id, url);
            const session: CollaborationSession = {
              ...info,
              serverUrl: url,
              source,
              connection: "connecting",
              pending: false,
              leaving: false,
            };
            this.store.create(session, doc);
            this.restore(session, doc);
          }
          const available = new Set(documents.map(info => info.id));
          for (const session of [...this.sessions.values()]) {
            if (session.info.serverUrl !== url) continue;
            if (session.info.leaving) {
              await this.finishLeave(session);
              continue;
            }
            if (!available.has(session.info.id) && session.info.status === "active")
              await this.revoke(session, "revoked");
          }
          if (url === this.serverUrl)
            this.requests = (
              await this.client.request<{ requests: JoinRequest[] }>(url, "/v1/join-requests")
            ).requests;
          void this.connectEvents(url).catch(() => {});
          this.error = undefined;
        } catch (error) {
          this.error = error instanceof Error ? error.message : "协作服务器暂时无法连接";
        }
      }
      this.changed();
    } finally {
      this.refreshing = false;
    }
  }

  private databaseForEvent(event: IpcMainInvokeEvent) {
    const window = BrowserWindow.fromWebContents(event.sender);
    const name = window && databaseModule.windowToDatabase.get(window.id);
    const db = name ? databaseModule.getDatabase(name) : undefined;
    if (!name || !db?.open) throw new Error("当前内容数据库尚未连接");
    return { db, name };
  }
  private findLocalSource(documentId: string, serverUrl: string) {
    for (const [name, db] of databaseModule.databases) {
      if (!db.open) continue;
      const source = restoreContentBinding(db, name, documentId, serverUrl);
      if (source) return source;
    }
  }
  private async createContent(
    event: IpcMainInvokeEvent,
    contentId: number,
    sourceType?: SourceType,
    sourceId?: number,
    sourceTitle?: string
  ) {
    if (!Number.isSafeInteger(contentId) || contentId <= 0) throw new Error("内容 ID 不合法");
    const { name } = this.databaseForEvent(event);
    const key = `${name}:${contentId}`;
    let operation = this.pendingCreates.get(key);
    if (!operation) {
      operation = (async () => {
        const snapshot = this.openContent(event, { contentId, sourceType, sourceId, sourceTitle });
        const local = this.requireSession(snapshot.documentId);
        if (snapshot.mode !== "local") {
          const invitation = await this.client.request<{ code: string }>(
            local.info.serverUrl,
            `/v1/documents/${local.info.id}/invitation`,
            "POST",
            {}
          );
          return { documentId: local.info.id, code: invitation.code };
        }
        try {
          await this.freeze(local);
          if (sourceType !== "card" && sourceTitle !== undefined)
            replaceText(local.doc.getText("title"), sourceTitle.slice(0, 500));
          await this.project(local);
          const result = await this.publishContent(
            event,
            contentId,
            sourceType,
            sourceId,
            local.doc.getText("title").toString()
          );
          this.removeSession(local);
          return result;
        } catch (failure) {
          // 发布失败：绑定已建立则拆除会话（重试时重走发布），否则恢复本机可编辑
          if (this.sessions.has(local.info.id)) {
            const { db } = this.databaseForEvent(event);
            if (findCollaborationBinding(db, contentId)) this.removeSession(local);
            else this.unfreeze(local);
          }
          throw failure;
        }
      })().finally(() => {
        this.pendingCreates.delete(key);
        void this.refresh();
      });
      this.pendingCreates.set(key, operation);
    }
    return operation;
  }

  private async publishContent(
    event: IpcMainInvokeEvent,
    contentId: number,
    sourceType?: SourceType,
    sourceId?: number,
    sourceTitle?: string
  ) {
    const { db, name } = this.databaseForEvent(event);
    const content = ContentTable.getContentById(db, contentId);
    if (!content) throw new Error("内容不存在");
    const binding = findCollaborationBinding(db, contentId);
    if (binding) {
      const existing = this.sessions.get(binding.document_id);
      if (existing) return { documentId: binding.document_id, code: "" };
      throw new Error("这篇内容已共享，请使用协作面板打开，或恢复原设备身份");
    }
    const url = this.serverUrl;
    const identity = await this.client.identity(url);
    const source: SourceBinding = {
      databaseName: name,
      contentId,
      contentCreatedAt: content.createTime,
      sourceType,
      sourceId,
      sourceTitle,
    };
    const key = createHash("sha256")
      .update(
        JSON.stringify({
          databaseName: name,
          contentId,
          contentCreatedAt: content.createTime,
          server: url,
          generation: this.store.get(`generation:${name}:${contentId}`, 0),
        })
      )
      .digest("hex");
    const created = await this.client.request<{ id: string }>(url, "/v1/documents", "POST", {
      idempotencyKey: key,
    });
    const value: SharedContent = {
      title: sourceTitle || `共享内容 ${contentId}`,
      content: structuredClone(content.content) as ContentNode[],
      bannerBg: "",
      bannerPosition: "center",
    };
    await this.assets.prepare(url, created.id, value);
    const privateNodes = new Map<string, ContentNode>();
    const doc = createSharedDocument(value, privateNodes);
    await this.client.request(url, `/v1/documents/${created.id}/publish`, "POST", {
      state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
    });
    const info: CollaborationSession = {
      id: created.id,
      mode: "shared",
      title: value.title,
      ownerId: identity.id,
      role: "owner",
      status: "active",
      members: [],
      updatedAt: Date.now(),
      serverUrl: url,
      source,
      pending: false,
      leaving: false,
      connection: "connecting",
    };
    this.store.create(info, doc, privateNodes);
    db.prepare("INSERT INTO collaboration_bindings VALUES (?,?,?,?,?,?,?)").run(
      source.contentId,
      source.contentCreatedAt,
      url,
      info.id,
      source.sourceType || null,
      source.sourceId || null,
      source.sourceTitle || null
    );
    const session = this.restore(info, doc, privateNodes);
    registerContentSession(db, contentId, session);
    this.changed();
    void this.refresh();
    return {
      documentId: info.id,
      ...(await this.client.request<{ code: string }>(
        url,
        `/v1/documents/${info.id}/invitation`,
        "POST",
        {}
      )),
    };
  }

  private async flushResources() {
    if (this.syncingResources) return;
    this.syncingResources = true;
    try {
      for (const session of this.sessions.values()) {
        if (
          session.info.leaving ||
          session.info.status !== "active" ||
          !this.assets.hasPending(session.info.id)
        )
          continue;
        try {
          await this.assets.flush(session.info.serverUrl, session.info.id);
          if (
            session.info.status === "active" &&
            !session.info.leaving &&
            !this.assets.hasPending(session.info.id)
          )
            session.provider?.attach();
        } catch (error) {
          session.info.error = error instanceof Error ? error.message : "资源上传失败";
          this.changed(session);
        }
      }
    } finally {
      this.syncingResources = false;
    }
  }

  private migrateKnowledgeSession(
    database: import("better-sqlite3").Database,
    session: RuntimeSession
  ) {
    if (this.knowledgeMigrated.has(session)) return;
    const mapping = readKnowledgeMapping(database);
    if (!mapping) return;
    this.store.backupBeforeKnowledgeMigration(database.name);
    const source = session.info.source;
    const nextSource = migrateKnowledgeReferences(source, mapping) as SourceBinding | undefined;
    const changed = migrateKnowledgeDocument(session.doc, mapping, session.privateNodes);
    if (JSON.stringify(source) !== JSON.stringify(nextSource)) {
      session.info.source = nextSource;
      this.store.metadata(session.info);
    }
    if (changed) {
      this.store.privateNodes(session.info.id, session.privateNodes);
      this.store.compact(session.info.id, session.doc);
    }
    this.knowledgeMigrated.add(session);
  }

  private async project(session: RuntimeSession) {
    if (!session.info.source || this.projecting.has(session.info.id)) return;
    const database = databaseModule.getDatabase(session.info.source.databaseName);
    if (!database?.open) return;
    this.projecting.add(session.info.id);
    try {
      this.migrateKnowledgeSession(database, session);
      // 会话迁移可能替换 source 引用，后续投影统一消费最新值
      const source = session.info.source;
      if (!source) return;
      const local = session.info.mode === "local";
      if (local && findCollaborationBinding(database, source.contentId)) return;
      if (!local) {
        restorePrivateNodes(database, source, session.privateNodes);
        this.store.privateNodes(session.info.id, session.privateNodes);
      }
      session.projectionDirty = false;
      const viewActiveTabs = new Map(session.viewActiveTabs);
      const value = local
        ? readSharedContent(session.doc, undefined, viewActiveTabs)
        : await this.assets.localize(
            session.info.serverUrl,
            session.info.id,
            readSharedContent(session.doc, session.privateNodes, viewActiveTabs)
          );
      if (
        databaseModule.getDatabase(source.databaseName) !== database ||
        !database.open ||
        !this.sessions.has(session.info.id)
      )
        return;
      const count = getContentLength(value.content as import("slate").Descendant[]);
      const changed = local
        ? projectLocalContent(database, source, value.content, count)
        : writeContentProjection(
            database,
            source,
            session.info.id,
            session.info.serverUrl,
            value.content,
            count
          );
      for (const entry of projectContentTitle(database, source.contentId, value.title))
        this.broadcast(entry.channel, {
          databaseName: basename(database.name),
          [entry.field]: entry.id,
        });
      if (changed)
        this.broadcast("content:updated", {
          databaseName: basename(database.name),
          contentId: source.contentId,
        });
      session.info.title = value.title;
      if (local && session.info.error) {
        session.info.error = undefined;
        this.changed(session);
      }
    } catch (error) {
      session.projectionDirty = true;
      throw error;
    } finally {
      this.projecting.delete(session.info.id);
    }
  }

  /** 解除本地绑定并递增发布代次。discard=true（丢弃本地改动退出）时跳过最后的
   *  投影与进行中检查——丢弃语义下不应再写库，绑定清理必须尽力完成。 */
  private async clearBinding(session: RuntimeSession, discard = false) {
    const source = session.info.source;
    if (!source) return;
    const db = databaseModule.getDatabase(source.databaseName);
    if (!db?.open) throw new Error("请打开原内容所在数据库以完成退出");
    if (!discard && this.projecting.has(session.info.id))
      throw new Error("内容正在保存，请稍后再重试");
    if (!discard) await this.project(session);
    db.prepare("DELETE FROM collaboration_bindings WHERE content_id=? AND document_id=?").run(
      source.contentId,
      session.info.id
    );
    this.store.set(
      "generation:" + source.databaseName + ":" + source.contentId,
      this.store.get("generation:" + source.databaseName + ":" + source.contentId, 0) + 1
    );
    session.info.source = undefined;
    unregisterContentSession(session);
  }
  private async discardLocal(session: RuntimeSession) {
    if (session.info.source) await this.clearBinding(session);
    this.removeSession(session);
  }
  private removeSession(session: RuntimeSession) {
    for (const [id, view] of this.views)
      if (view.documentId === session.info.id) this.removeView(id);
    unregisterContentSession(session);
    session.provider?.destroy();
    session.awareness.destroy();
    session.doc.destroy();
    this.sessions.delete(session.info.id);
    this.store.remove(session.info.id);
    rmSync(join(this.directory, "assets", session.info.id), {
      recursive: true,
      force: true,
    });
    this.broadcast("collaboration:removed", { documentId: session.info.id });
    this.changed();
  }
  private async revoke(session: RuntimeSession, reason: "closed" | "revoked") {
    if (session.info.leaving) return;
    session.provider?.detach();
    session.info.status = "closed";
    session.info.connection = "offline";
    session.info.error = reason === "closed" ? "作者已结束共享" : "访问权限已被移除";
    if (session.info.source) {
      try {
        await this.clearBinding(session);
      } catch {
        this.changed(session);
        return;
      }
    }
    if (session.info.pending) {
      this.changed(session);
      return;
    }
    this.removeSession(session);
  }
  private async finishLeave(session: RuntimeSession) {
    if (this.finishingLeaves.has(session.info.id)) return;
    this.finishingLeaves.add(session.info.id);
    try {
      if (session.info.role === "owner") {
        await this.client.request(
          session.info.serverUrl,
          `/v1/documents/${session.info.id}/close`,
          "POST",
          {}
        );
        await this.clearBinding(session);
      } else
        await this.client.request(
          session.info.serverUrl,
          `/v1/documents/${session.info.id}/leave`,
          "POST",
          {}
        );
      this.removeSession(session);
    } catch (error) {
      session.info.error = error instanceof Error ? error.message : "正在等待退出完成";
      this.changed(session);
    } finally {
      this.finishingLeaves.delete(session.info.id);
    }
  }

  async init() {
    this.directory = join(PathUtil.getAppDir(), "collaboration");
    this.store = new CollaborationLocalStore(this.directory);
    if (!this.store.get("localDeviceId", "")) this.store.set("localDeviceId", randomUUID());
    this.client = new CollaborationClient(this.store);
    this.assets = new CollaborationAssetService(this.store, PathUtil.getAppDir(), url =>
      this.client.identity(url)
    );
    for (const info of this.store.list()) {
      // 单条本地缓存损坏（applyUpdate 抛错）不得拖垮整个模块——IPC 未注册即全部协作
      // 功能瘫痪且重启无法自愈；丢弃该会话缓存与资源目录，云端房间下次 refresh 仍可恢复
      try {
        const { doc, privateNodes } = this.store.load(info.id);
        this.restore(info, doc, privateNodes);
      } catch (error) {
        console.error(`[collaboration] 会话 ${info.id} 本地缓存损坏，已丢弃`, error);
        this.store.remove(info.id);
        rmSync(join(this.directory, "assets", info.id), { recursive: true, force: true });
      }
    }
    registerCollaborationIpc({
      store: this.store,
      client: this.client,
      assets: this.assets,
      serverUrl: () => this.serverUrl,
      sessions: this.sessions,
      views: this.views,
      state: this.state.bind(this),
      changed: this.changed.bind(this),
      refresh: this.refresh.bind(this),
      databaseForEvent: this.databaseForEvent.bind(this),
      requireSession: this.requireSession.bind(this),
      noteActiveTab: this.noteActiveTab.bind(this),
      openContent: this.openContent.bind(this),
      acknowledgeFreeze: this.acknowledgeFreeze.bind(this),
      prepareLeave: this.prepareLeave.bind(this),
      createContent: this.createContent.bind(this),
      removeView: this.removeView.bind(this),
      clearBinding: this.clearBinding.bind(this),
      discardLocal: this.discardLocal.bind(this),
      removeSession: this.removeSession.bind(this),
      finishLeave: this.finishLeave.bind(this),
      flushResources: this.flushResources.bind(this),
    });
    for (const window of BrowserWindow.getAllWindows()) this.registerWindow(window);
    app.on("browser-window-created", (_event, window) => this.registerWindow(window));
    this.autoFlushInterval = setInterval(() => {
      for (const session of this.sessions.values()) {
        try {
          if (session.dirty) {
            this.store.compact(session.info.id, session.doc);
            session.dirty = false;
          }
          if (session.projectionDirty && !session.info.leaving && session.info.status === "active")
            void this.project(session).catch(error => {
              session.info.error = error instanceof Error ? error.message : "本地保存失败";
              this.changed(session);
            });
        } catch (error) {
          session.info.error = error instanceof Error ? error.message : "本地保存失败";
          this.changed(session);
        }
      }
      void this.flushResources();
    }, 1000);
    this.autoFlushInterval.unref();
    this.refreshInterval = setInterval(() => void this.refresh(), 15000);
    this.refreshInterval.unref();
    void this.refresh();
  }

  /** 受控退出前把所有协作视图的文档落盘（尽力而为，超时不阻塞退出） */
  async prepareQuit(timeoutMs = 5000): Promise<void> {
    if (!this.store) return;
    const entries = [...this.views.entries()];
    if (!entries.length) return;
    const tasks = entries.map(
      ([viewId, view]) =>
        new Promise<void>(resolve => {
          const timeout = setTimeout(resolve, timeoutMs);
          this.closeWaiters.set(viewId, () => {
            clearTimeout(timeout);
            resolve();
          });
          BrowserWindow.fromId(view.windowId)?.webContents.send("collaboration:flush", {
            documentId: view.documentId,
          });
        })
    );
    await Promise.all(tasks);
    for (const [viewId] of entries) this.closeWaiters.delete(viewId);
    for (const id of new Set(entries.map(([, view]) => view.documentId))) {
      try {
        const session = this.sessions.get(id);
        if (session?.info.mode === "local") await this.project(session);
      } catch (error) {
        log.error(`退出前保存协作文档 ${id} 失败:`, error);
      }
    }
  }

  /** 受控退出收尾：停止后台任务并断开所有协作连接 */
  shutdown(): void {
    this.quitting = true;
    this.stopped = true;
    if (this.autoFlushInterval) clearInterval(this.autoFlushInterval);
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    for (const socket of this.events.values()) socket.close();
    for (const transport of this.transports.values()) transport.disconnect();
  }
  private removeView(viewId: string) {
    const view = this.views.get(viewId);
    if (!view) return;
    this.acknowledgeFreeze(viewId);
    const awareness = this.sessions.get(view.documentId)?.awareness;
    if (awareness) removeAwarenessStates(awareness, view.clientIds, "view-closed");
    this.views.delete(viewId);
    const session = this.sessions.get(view.documentId);
    if (session?.info.mode === "local")
      setTimeout(() => {
        if (
          !this.sessions.has(session.info.id) ||
          session.info.frozen ||
          [...this.views.values()].some(entry => entry.documentId === session.info.id)
        )
          return;
        void this.project(session)
          .then(() => {
            if (
              !session.projectionDirty &&
              session.info.source &&
              databaseModule.getDatabase(session.info.source.databaseName)?.open &&
              ![...this.views.values()].some(entry => entry.documentId === session.info.id)
            )
              this.removeSession(session);
          })
          .catch(error => {
            session.info.error = String(error);
            this.changed(session);
          });
      }, 250).unref();
  }
}

export default new CollaborationManager();

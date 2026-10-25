/**
 * 浏览器伴读（主进程）：扩展经 `ws://127.0.0.1:24678/browser` 直连本模块。
 *
 * 门禁三道：
 * 1. 握手只放行浏览器扩展 Origin（网页无法伪造，挡跨站劫持）；
 * 2. 首次连接走配对：扩展与 Tau 弹窗显示同一校验码，用户允许后签发 token（只存哈希）；
 * 3. 之后每条连接首帧 hello 校验 token，每个方法再按授予的 scope 校验。
 *
 * 对话复用 BrowserRunRegistry 的 v2 运行协议，事件只推给发起这轮的连接；页面工具经同一连接反向请求扩展，
 * 授予 tools 时同时给桌面对话的全部应用工具（不含 pi 自带的文件与命令工具），审批跟随桌面的工具权限模式。
 */
import path from "node:path";
import type http from "node:http";
import type { Duplex } from "node:stream";
import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import log from "electron-log";
import WebSocket, { WebSocketServer } from "ws";
import {
  BROWSER_COMPANION_PATH,
  COMPANION_METHODS,
  HANDSHAKE_TIMEOUT_MS,
  METHOD_SCOPES,
  deriveSas,
  isNonce,
  randomHex,
  type AppearanceData,
  type ChatHistoryResult,
  type ClientInfo,
  type CompanionRunStartParams,
  type CompanionScope,
  type ModelOption,
  type PairRequestResult,
  type ReadyData,
} from "@tau/shared/browser-companion";
import type { AiRunStateResult } from "@tau/shared/chat-core";
import type { LLMProviderSetting } from "@/types/pi-llm";
import { normalizeWebPageUrl } from "@/entity/excerpt/web";
import serverModule from "../server";
import userSettingModule from "../user-setting";
import { BrowserRunRegistry } from "../browser-run-core";
import { browserSessionFile, listBrowserSessions, readTranscript } from "../pi-session-store";
import { browserSessionDirOf } from "../pi-session-paths";
import { getMainWindows, isMainWindow, showOrCreateMainWindow } from "../../windows/main-window";
import { dismissNotification, routeNotification } from "../../windows/notification-router";
import type { BrowserCompanionSnapshot, PairPrompt } from "@/types/browser-companion";
import { BrowserClientStore } from "../../services/browser-clients";
import { CompanionPeer, MAX_FRAME_BYTES } from "./peer";
import { isClientId, isExtensionOrigin, PairingGate } from "./pairing-gate";
import { createCompanionRunDriver } from "./run-driver";
import {
  listAnnotations,
  listLibraryFeed,
  listLibraryPages,
  listLibrarySites,
  renameLibraryPage,
  saveNote,
  syncAnnotations,
} from "./library";

/** 同时在等用户裁决的配对请求上限（防弹窗轰炸） */
const MAX_PENDING_PAIRS = 3;

interface Connection {
  peer: CompanionPeer;
  origin: string;
  /** 握手完成后才有 */
  clientId: string | null;
  scopes: Set<CompanionScope>;
}

interface PendingPair extends PairPrompt {
  clientId: string;
  connection: Connection;
}

const text = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const parseClientInfo = (raw: unknown): ClientInfo => {
  const value = (raw ?? {}) as Record<string, unknown>;
  return {
    browser: text(value.browser, 40) || "浏览器",
    os: text(value.os, 40),
    version: text(value.version, 20),
  };
};

const fromMainWindow = (event: IpcMainInvokeEvent) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || !isMainWindow(win)) throw new Error("只能在主窗口操作浏览器扩展授权");
};

const isSessionRef = (value: unknown): value is { id: string; pageUrl: string } => {
  const session = value as { id?: unknown; pageUrl?: unknown } | null;
  return (
    typeof session?.id === "string" &&
    /^[A-Za-z0-9_-]{1,100}$/.test(session.id) &&
    normalizeWebPageUrl(session.pageUrl as string) !== null
  );
};

class BrowserCompanionModule {
  private store!: BrowserClientStore;
  private readonly gate = new PairingGate();
  private readonly connections = new Set<Connection>();
  private readonly pending = new Map<string, PendingPair>();
  private readonly runs = new Map<string, Connection>();
  private registry!: BrowserRunRegistry;
  private appearance: AppearanceData = { theme: "paper", mode: "light" };
  private wss!: WebSocketServer;

  init(): void {
    this.store = new BrowserClientStore(path.join(app.getPath("userData"), "browser-clients.json"));
    this.registry = new BrowserRunRegistry(
      createCompanionRunDriver(runId => {
        const connection = this.runs.get(runId);
        return connection
          ? { peer: connection.peer, allowTools: connection.scopes.has("tools") }
          : null;
      }),
      notification => {
        const connection = this.runs.get(notification.runId);
        connection?.peer.notify(COMPANION_METHODS.runEvent, notification);
        if (notification.event.type === "settled") this.runs.delete(notification.runId);
      }
    );
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
    serverModule.registerUpgradeRoute(BROWSER_COMPANION_PATH, (request, socket, head) =>
      this.handleUpgrade(request, socket, head)
    );
    this.registerIpc();
  }

  // ———————— 连接 ————————

  private handleUpgrade(request: http.IncomingMessage, socket: Duplex, head: Buffer): void {
    const origin = request.headers.origin;
    if (!isExtensionOrigin(origin)) {
      log.warn(`[browser-companion] 拒绝来源 ${origin ?? "(无)"} 的连接`);
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    this.wss.handleUpgrade(request, socket, head, ws => this.accept(ws, origin));
  }

  private accept(ws: WebSocket, origin: string): void {
    const connection: Connection = {
      peer: new CompanionPeer(ws, (method, params) => this.handshake(connection, method, params)),
      origin,
      clientId: null,
      scopes: new Set(),
    };
    this.connections.add(connection);
    const timer = setTimeout(() => {
      if (!connection.clientId && !this.pendingOf(connection))
        connection.peer.close(4001, "handshake timeout");
    }, HANDSHAKE_TIMEOUT_MS);
    ws.on("message", data => void connection.peer.receive(String(data)));
    ws.on("close", () => {
      clearTimeout(timer);
      connection.peer.dispose();
      this.connections.delete(connection);
      for (const [requestId, pair] of this.pending) {
        if (pair.connection === connection) this.cancelPair(requestId);
      }
      for (const [runId, owner] of this.runs) {
        if (owner === connection) void this.registry.abort(runId);
      }
      if (connection.clientId) this.broadcastChanged();
    });
    ws.on("error", error => log.warn("[browser-companion] 连接出错", error));
  }

  private pendingOf(connection: Connection) {
    return [...this.pending.values()].find(pair => pair.connection === connection);
  }

  /** 握手阶段：只认 hello / pair.request */
  private async handshake(connection: Connection, method: string, params: unknown) {
    const value = (params ?? {}) as Record<string, unknown>;
    if (method === COMPANION_METHODS.hello) {
      if (!isClientId(value.clientId) || typeof value.token !== "string") {
        setTimeout(() => connection.peer.close(4003, "bad hello"), 0);
        throw new Error("bad-token");
      }
      const result = await this.store.verify(value.clientId, value.token, connection.origin);
      if (typeof result === "string") {
        setTimeout(() => connection.peer.close(4003, result), 0);
        throw new Error(result);
      }
      return this.makeReady(connection, result.clientId, result.scopes);
    }
    if (method === COMPANION_METHODS.pairRequest) return this.requestPair(connection, value);
    throw new Error("尚未完成授权");
  }

  private async makeReady(
    connection: Connection,
    clientId: string,
    scopes: CompanionScope[]
  ): Promise<ReadyData> {
    // 同一扩展实例只保留最新连接
    for (const other of this.connections) {
      if (other !== connection && other.clientId === clientId) other.peer.close(4000, "replaced");
    }
    connection.clientId = clientId;
    connection.scopes = new Set(scopes);
    connection.peer.setHandler((method, params) => this.dispatch(connection, method, params));
    this.broadcastChanged();
    return { scopes, appVersion: app.getVersion(), appearance: this.appearance };
  }

  private async requestPair(connection: Connection, value: Record<string, unknown>) {
    if (!isClientId(value.clientId) || !isNonce(value.nonce)) throw new Error("配对参数无效");
    const clientId = value.clientId;
    const info = parseClientInfo(value.info);
    const deny = async (reason: string) => {
      await this.store.recordRejection({
        clientId,
        label: `${info.browser}${info.os ? ` · ${info.os}` : ""}`,
        reason,
      });
      this.broadcastChanged();
    };
    if (!(await this.store.acceptsNew())) {
      await deny("已关闭接受新的连接请求");
      setTimeout(() => connection.peer.close(4004, "closed"), 0);
      return { status: "closed" } satisfies PairRequestResult;
    }
    const blockedUntil = this.gate.blockedUntil(clientId);
    if (
      blockedUntil !== null ||
      this.pending.size >= MAX_PENDING_PAIRS ||
      this.pendingOf(connection)
    ) {
      setTimeout(() => connection.peer.close(4029, "throttled"), 0);
      return {
        status: "throttled",
        retryAt: blockedUntil ?? Date.now() + 60_000,
      } satisfies PairRequestResult;
    }
    const nonce = randomHex();
    const code = await deriveSas(value.nonce, nonce);
    const requestId = randomHex(8);
    const pair: PendingPair = {
      requestId,
      clientId,
      info,
      origin: connection.origin,
      code,
      requestedAt: Date.now(),
      connection,
    };
    this.pending.set(requestId, pair);
    this.showPairPrompt(pair);
    return { status: "pending", nonce } satisfies PairRequestResult;
  }

  private showPairPrompt(pair: PendingPair): void {
    const prompt: PairPrompt = {
      requestId: pair.requestId,
      info: pair.info,
      origin: pair.origin,
      code: pair.code,
      requestedAt: pair.requestedAt,
    };
    for (const win of getMainWindows())
      win.webContents.send("browser-companion:pair-prompt", prompt);
    // 失焦或没有窗口时进系统通知，「查看」把主窗口带到前台（弹窗在主窗口里）
    routeNotification(
      {
        id: `browser-companion:${pair.requestId}`,
        title: `${pair.info.browser} 想连接到 Tau`,
        body: `校验码 ${pair.code}，请在 Tau 中确认`,
        icon: "globe",
        tone: "neutral",
        sticky: true,
        actions: [{ label: "查看", primary: true }],
      },
      { kind: "main", handlers: [() => showOrCreateMainWindow()] }
    );
  }

  private async decidePair(requestId: string, allow: boolean, scopes: unknown): Promise<void> {
    const pair = this.pending.get(requestId);
    if (!pair) return;
    this.pending.delete(requestId);
    dismissNotification(`browser-companion:${requestId}`);
    this.closePromptInWindows(requestId);
    const { connection } = pair;
    if (!allow) {
      this.gate.recordDenial(pair.clientId);
      await this.store.recordRejection({
        clientId: pair.clientId,
        label: `${pair.info.browser}${pair.info.os ? ` · ${pair.info.os}` : ""}`,
        reason: "用户拒绝",
      });
      connection.peer.notify(COMPANION_METHODS.pairDenied, { reason: "denied" });
      setTimeout(() => connection.peer.close(4005, "denied"), 50);
      this.broadcastChanged();
      return;
    }
    this.gate.recordGrant(pair.clientId);
    const granted = await this.store.grant(pair.clientId, pair.info, pair.origin, scopes);
    if (connection.peer.isClosed) return;
    connection.peer.notify(COMPANION_METHODS.pairGranted, granted);
    const ready = await this.makeReady(connection, pair.clientId, granted.scopes);
    connection.peer.notify(COMPANION_METHODS.ready, ready);
  }

  private cancelPair(requestId: string): void {
    if (!this.pending.delete(requestId)) return;
    dismissNotification(`browser-companion:${requestId}`);
    this.closePromptInWindows(requestId);
  }

  private closePromptInWindows(requestId: string): void {
    for (const win of getMainWindows())
      win.webContents.send("browser-companion:pair-closed", requestId);
  }

  // ———————— 已授权连接的方法 ————————

  private async dispatch(
    connection: Connection,
    method: string,
    params: unknown
  ): Promise<unknown> {
    const scope = METHOD_SCOPES[method];
    if (!scope) throw new Error(`未知方法：${method}`);
    if (!connection.scopes.has(scope)) throw new Error("没有这项权限，请在 Tau 设置中开启");
    const value = (params ?? {}) as Record<string, unknown>;
    switch (method) {
      case COMPANION_METHODS.runStart: {
        const start = params as CompanionRunStartParams;
        if (
          typeof start?.runId !== "string" ||
          start.runId.length > 100 ||
          !isSessionRef(start.session)
        )
          throw new Error("对话参数无效");
        if (this.runs.has(start.runId)) throw new Error("runId 重复");
        this.runs.set(start.runId, connection);
        const outcome = this.registry.start(start);
        if (!outcome.ok) {
          this.runs.delete(start.runId);
          throw new Error(outcome.error);
        }
        return { runId: start.runId };
      }
      case COMPANION_METHODS.runAbort:
        this.assertOwnRun(connection, value.runId);
        await this.registry.abort(String(value.runId));
        return { ok: true };
      case COMPANION_METHODS.runApprove:
        this.assertOwnRun(connection, value.runId);
        return {
          ok: this.registry.approve(
            String(value.runId),
            String(value.requestId),
            value.choice as "allow" | "allow-session" | "deny"
          ),
        };
      case COMPANION_METHODS.runAnswer: {
        this.assertOwnRun(connection, value.runId);
        const error = this.registry.answer(
          String(value.runId),
          String(value.requestId),
          value.answers
        );
        if (error) throw new Error(error);
        return { ok: true };
      }
      case COMPANION_METHODS.runState: {
        if (!isSessionRef(value.session)) throw new Error("对话参数无效");
        const session = value.session;
        const snapshot = this.registry.snapshotFor(session, () =>
          readTranscript(
            browserSessionFile(session.pageUrl, session.id),
            browserSessionDirOf(session.pageUrl)
          )
        );
        if (snapshot) this.runs.set(snapshot.runId, connection);
        return (
          snapshot ? { running: true, runId: snapshot.runId, snapshot } : { running: false }
        ) satisfies AiRunStateResult;
      }
      case COMPANION_METHODS.chatHistory:
        return this.chatHistory(value.url);
      case COMPANION_METHODS.chatOpen: {
        if (!isSessionRef(value.session)) throw new Error("对话参数无效");
        const { id, pageUrl } = value.session;
        showOrCreateMainWindow();
        const [win] = getMainWindows();
        win?.webContents.send("browser-companion:open-chat", {
          url: normalizeWebPageUrl(pageUrl),
          session: id,
        });
        return { ok: true };
      }
      case COMPANION_METHODS.modelsList:
        return this.listModels();
      case COMPANION_METHODS.annotationsList:
        return listAnnotations(value.url);
      case COMPANION_METHODS.annotationsSync:
        return syncAnnotations(params);
      case COMPANION_METHODS.libraryPages:
        return listLibraryPages(params);
      case COMPANION_METHODS.librarySites:
        return listLibrarySites();
      case COMPANION_METHODS.libraryFeed:
        return listLibraryFeed(params);
      case COMPANION_METHODS.libraryRename:
        return renameLibraryPage(params);
      case COMPANION_METHODS.noteSave:
        return saveNote(params);
      case COMPANION_METHODS.noteOpen: {
        const cardId = Number(value.cardId);
        if (!Number.isSafeInteger(cardId) || cardId <= 0) throw new Error("卡片无效");
        showOrCreateMainWindow();
        const [win] = getMainWindows();
        win?.webContents.send("browser-companion:open-card", cardId);
        return { ok: true };
      }
      default:
        throw new Error(`未知方法：${method}`);
    }
  }

  private assertOwnRun(connection: Connection, runId: unknown): void {
    if (typeof runId !== "string" || this.runs.get(runId) !== connection)
      throw new Error("这轮对话不存在");
  }

  private async chatHistory(url: unknown): Promise<ChatHistoryResult> {
    const pageUrl = normalizeWebPageUrl(url as string);
    if (!pageUrl) throw new Error("url 必须是 http(s) 地址");
    const [latest] = await listBrowserSessions(pageUrl);
    if (!latest) return { sessionId: null, messages: [] };
    return {
      sessionId: latest.id,
      messages: readTranscript(
        browserSessionFile(pageUrl, latest.id),
        browserSessionDirOf(pageUrl)
      ),
    };
  }

  /** 只给模型名，绝不外发服务商配置（含 API Key） */
  private async listModels(): Promise<ModelOption[]> {
    const setting = (await userSettingModule.getSettingSnapshot()) as Record<string, unknown>;
    const providers = Array.isArray(setting.llmProviders)
      ? (setting.llmProviders as LLMProviderSetting[])
      : [];
    const usage = (
      setting.llmUsageSettings as Record<string, { providerId?: string; modelId?: string }>
    )?.chat;
    return providers.flatMap(provider =>
      (provider.models ?? []).map(model => ({
        providerId: provider.id,
        modelId: model.id,
        label: model.name || model.id,
        isDefault: usage?.providerId === provider.id && usage?.modelId === model.id,
      }))
    );
  }

  // ———————— 渲染端（设置页、授权弹窗） ————————

  async snapshot(): Promise<BrowserCompanionSnapshot> {
    const base = await this.store.snapshot();
    const online = [...this.connections]
      .map(item => item.clientId)
      .filter((id): id is string => id !== null);
    return { ...base, online };
  }

  private broadcastChanged(): void {
    for (const win of getMainWindows()) win.webContents.send("browser-companion:changed");
  }

  private registerIpc(): void {
    ipcMain.handle("browser-companion:snapshot", event => {
      fromMainWindow(event);
      return this.snapshot();
    });
    ipcMain.handle(
      "browser-companion:transcript",
      async (event, { url, session }: { url: string; session: string }) => {
        fromMainWindow(event);
        if (!isSessionRef({ id: session, pageUrl: url })) throw new Error("对话参数无效");
        const sessions = await listBrowserSessions(url);
        const info = sessions.find(item => item.id === session);
        if (!info) return null;
        return {
          title: info.title,
          updateTime: info.updateTime,
          messages: readTranscript(browserSessionFile(url, session), browserSessionDirOf(url)),
        };
      }
    );
    ipcMain.handle("browser-companion:pending-prompts", event => {
      fromMainWindow(event);
      return [...this.pending.values()].map(
        ({ requestId, info, origin, code, requestedAt }): PairPrompt => ({
          requestId,
          info,
          origin,
          code,
          requestedAt,
        })
      );
    });
    ipcMain.handle(
      "browser-companion:pair-decide",
      async (event, requestId: string, allow: boolean, scopes: unknown) => {
        fromMainWindow(event);
        await this.decidePair(String(requestId), allow === true, scopes);
      }
    );
    ipcMain.handle(
      "browser-companion:set-scopes",
      async (event, clientId: string, scopes: unknown) => {
        fromMainWindow(event);
        const next = await this.store.setScopes(String(clientId), scopes);
        if (next) {
          for (const connection of this.connections) {
            if (connection.clientId === clientId) connection.scopes = new Set(next);
          }
        }
        this.broadcastChanged();
      }
    );
    ipcMain.handle("browser-companion:revoke", async (event, clientId: string) => {
      fromMainWindow(event);
      await this.store.revoke(String(clientId));
      for (const connection of this.connections) {
        if (connection.clientId !== clientId) continue;
        connection.peer.notify(COMPANION_METHODS.revoked);
        setTimeout(() => connection.peer.close(4006, "revoked"), 50);
      }
      this.broadcastChanged();
    });
    ipcMain.handle("browser-companion:set-accept-new", async (event, accept: boolean) => {
      fromMainWindow(event);
      await this.store.setAcceptNew(accept === true);
      this.broadcastChanged();
    });
    // 主题只在渲染端：主窗口上报，转给所有已授权连接
    ipcMain.on("browser-companion:appearance", (event, appearance: AppearanceData) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || !isMainWindow(win)) return;
      if (typeof appearance?.theme !== "string" || !["light", "dark"].includes(appearance.mode))
        return;
      if (appearance.theme === this.appearance.theme && appearance.mode === this.appearance.mode)
        return;
      this.appearance = { theme: appearance.theme.slice(0, 40), mode: appearance.mode };
      for (const connection of this.connections) {
        if (connection.clientId)
          connection.peer.notify(COMPANION_METHODS.appearanceChanged, this.appearance);
      }
    });
  }
}

export default new BrowserCompanionModule();

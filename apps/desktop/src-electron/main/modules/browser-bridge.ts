/**
 * 浏览器扩展桥（M5，主进程）：扩展侧栏的持久对话不再经渲染窗口里的 aiServer，由主进程直接驱动
 * pi 宿主会话——渲染层重载、窗口关闭都不再打断扩展的回答。
 *
 * 连接：主进程作为 WS 客户端接入 `/aiServerMain`（扩展侧栏同时连它发 v2 请求），并接入扩展的
 * `/extToolServer` 执行页面工具。两条都复用 server 模块既有的「服务端 + 客户端」转发拓扑，
 * 本模块在 `/aiServerMain` 上是那个服务端（`?isServer=true`）。
 *
 * 工具路由（宿主会话的 customTools 执行）：
 * - 扩展页面工具（browserTools 里的名字）→ 扩展 `ext.tool.execute`；
 * - 桌面工具（ToolRegistry/MCP）→ 转给主窗口渲染端的工具桥（pi-tool-call IPC）；没有主窗口就报错。
 * 审批与提问走宿主原生（用户裁决 M5：扩展改走桌面宿主），快照经 v2 事件推给扩展。
 *
 * 一次性调用（概览页、行内问答）仍在渲染端 aiServer（依赖设置 store 与 ToolRegistry），同样说 v2 协议。
 */
import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import { ipcMain } from "electron";
import log from "electron-log";
import {
  AI_RUN_METHODS,
  type AiRunEventNotification,
  type AiRunStartParams,
  type AiRunStateResult,
} from "@tau/shared/chat-core";
import type { PiHostToolSpec, PiSessionInteractionSnapshot } from "@/types/pi-session";
import { RpcMessageType } from "@/types/rpc";
import userSettingModule from "./user-setting";
import PiSessionHostModule, { type PiSessionClient } from "./pi-session-host";
import { RPC_SERVER_PORT } from "./server";
import { browserSessionFile, readTranscript } from "./pi-session-store";
import { browserSessionDirOf } from "./pi-session-paths";
import { getMainWindows } from "../windows";
import {
  BrowserRunRegistry,
  resolveChatModel,
  type BrowserRunDriver,
  type BrowserRunHandle,
} from "./browser-run-core";

export const AI_SERVER_MAIN_PATH = "/aiServerMain";
const RECONNECT_MS = 2000;
const EXT_TOOL_TIMEOUT_MS = 10 * 60 * 1000;
const DESKTOP_TOOL_CATALOG_TIMEOUT_MS = 3000;

type Json = Record<string, unknown>;

/** 最小 RPC 端点：以 server 或 client 身份接入 server 模块的 WS 转发 */
class RpcEndpoint {
  private ws: WebSocket | null = null;
  private readonly pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();
  private stopped = false;

  constructor(
    private readonly url: string,
    private readonly onRequest?: (method: string, params: unknown) => Promise<unknown>
  ) {}

  public connect(): void {
    if (this.stopped) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.on("message", raw => void this.handle(String(raw)));
    ws.on("close", () => {
      this.ws = null;
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error("连接已断开"));
        this.pending.delete(id);
      }
      if (!this.stopped) setTimeout(() => this.connect(), RECONNECT_MS).unref?.();
    });
    ws.on("error", error => log.warn(`[browser-bridge] ${this.url} 连接出错: ${error.message}`));
  }

  public stop(): void {
    this.stopped = true;
    this.ws?.close();
  }

  public get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  public notify(method: string, data: unknown): void {
    if (!this.connected) return;
    this.ws!.send(JSON.stringify({ type: RpcMessageType.Notification, method, data }));
  }

  public request(method: string, params: unknown, timeout: number): Promise<unknown> {
    if (!this.connected) return Promise.reject(new Error("浏览器扩展未连接"));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`请求超时: ${method}`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify({ type: RpcMessageType.Request, id, method, params }));
    });
  }

  private async handle(raw: string): Promise<void> {
    let message: Json;
    try {
      message = JSON.parse(raw) as Json;
    } catch {
      return;
    }
    if (message.type === RpcMessageType.Response) {
      const pending = this.pending.get(String(message.id));
      if (!pending) return;
      this.pending.delete(String(message.id));
      clearTimeout(pending.timer);
      const error = message.error as { message?: string } | null | undefined;
      if (error) pending.reject(new Error(error.message ?? "请求失败"));
      else pending.resolve(message.result);
      return;
    }
    if (message.type !== RpcMessageType.Request || !this.onRequest) return;
    const method = String(message.method);
    let result: unknown = null;
    let error: { code: number; message: string } | null = null;
    try {
      result = await this.onRequest(method, message.params);
    } catch (caught) {
      error = { code: 1, message: caught instanceof Error ? caught.message : String(caught) };
    }
    if (this.connected) {
      this.ws!.send(
        JSON.stringify({ type: RpcMessageType.Response, id: message.id, method, result, error })
      );
    }
  }
}

/** 主进程客户端：宿主会话的事件在进程内直接回调，不经 IPC */
class InProcessClient implements PiSessionClient {
  private readonly closeListeners = new Set<() => void>();
  private destroyed = false;

  constructor(
    private readonly handlers: {
      onEvent(event: unknown): void;
      onInteractions(snapshot: PiSessionInteractionSnapshot): void;
      onToolCall(payload: {
        sessionId: string;
        toolCallId: string;
        toolName: string;
        args: unknown;
      }): void;
    }
  ) {}

  isDestroyed(): boolean {
    return this.destroyed;
  }

  send(channel: string, payload: unknown): void {
    if (this.destroyed) return;
    if (channel === "pi-session-event")
      this.handlers.onEvent((payload as { event: unknown }).event);
    else if (channel === "pi-session-interactions")
      this.handlers.onInteractions(payload as PiSessionInteractionSnapshot);
    else if (channel === "pi-tool-call") this.handlers.onToolCall(payload as never);
  }

  once(_event: string, listener: () => void) {
    this.closeListeners.add(listener);
    return this;
  }

  removeListener(_event: string, listener: () => void) {
    this.closeListeners.delete(listener);
    return this;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.closeListeners.forEach(listener => listener());
  }
}

const promptTextOf = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item: { type?: string; text?: string; file?: string; fileName?: string }) =>
      item.type === "text"
        ? (item.text ?? "")
        : item.type === "file"
          ? `[文件：${item.fileName ?? item.file}]\n路径：${item.file}\n请使用 pi 的 read 工具读取该文件。`
          : ""
    )
    .filter(Boolean)
    .join("\n");
};

const imagesOf = (content: unknown) =>
  (Array.isArray(content) ? content : [])
    .filter((item: { type?: string }) => item.type === "image")
    .map((item: { image: string; path?: string }) =>
      item.image.startsWith("data:") ? { dataUrl: item.image } : { path: item.path ?? item.image }
    );

class BrowserBridgeModule {
  private aiEndpoint: RpcEndpoint | null = null;
  private extTools: RpcEndpoint | null = null;
  private registry: BrowserRunRegistry | null = null;

  public init(): void {
    const base = `ws://localhost:${RPC_SERVER_PORT}`;
    this.extTools = new RpcEndpoint(`${base}/extToolServer`);
    this.registry = new BrowserRunRegistry(this.driver(), notification =>
      this.aiEndpoint?.notify(AI_RUN_METHODS.event, notification satisfies AiRunEventNotification)
    );
    this.aiEndpoint = new RpcEndpoint(
      `${base}${AI_SERVER_MAIN_PATH}?isServer=true`,
      (method, params) => this.handleRequest(method, params as Json)
    );
    this.aiEndpoint.connect();
    this.extTools.connect();
  }

  private async handleRequest(method: string, params: Json): Promise<unknown> {
    const registry = this.registry!;
    switch (method) {
      case AI_RUN_METHODS.start: {
        const start = params as unknown as AiRunStartParams;
        if (!start.session) throw new Error("主进程只处理扩展侧栏的持久对话");
        const outcome = registry.start(start);
        if (!outcome.ok) throw new Error(outcome.error);
        return { runId: start.runId };
      }
      case AI_RUN_METHODS.abort:
        await registry.abort(String(params.runId));
        return { ok: true };
      case AI_RUN_METHODS.state: {
        const session = params.session as { id: string; pageUrl: string };
        const snapshot = registry.snapshotFor(session, () =>
          readTranscript(
            browserSessionFile(session.pageUrl, session.id),
            browserSessionDirOf(session.pageUrl)
          )
        );
        return (
          snapshot ? { running: true, runId: snapshot.runId, snapshot } : { running: false }
        ) satisfies AiRunStateResult;
      }
      case AI_RUN_METHODS.approve:
        return {
          ok: registry.approve(
            String(params.runId),
            String(params.requestId),
            params.choice as "allow" | "allow-session" | "deny"
          ),
        };
      case AI_RUN_METHODS.answer: {
        const error = registry.answer(
          String(params.runId),
          String(params.requestId),
          params.answers
        );
        if (error) throw new Error(error);
        return { ok: true };
      }
      default:
        throw new Error(`未知方法：${method}`);
    }
  }

  private driver(): BrowserRunDriver {
    return {
      start: async (params, hooks) => {
        const session = params.session!;
        const setting = await userSettingModule.getSettingSnapshot();
        const { providerId, modelId } = resolveChatModel(
          setting as Record<string, unknown>,
          params.feature ?? "chat"
        );
        const hostId = randomUUID();
        const browserToolNames = new Set(
          (params.browserTools ?? []).map(tool => tool.function.name)
        );
        const desktop = await this.requestDesktopTools();
        let settledResolve!: () => void;
        const settled = new Promise<void>(resolve => {
          settledResolve = resolve;
        });
        const client = new InProcessClient({
          onEvent: event => {
            hooks.onEvent(event as never);
            if ((event as { type?: string }).type === "agent_settled") settledResolve();
          },
          onInteractions: snapshot => hooks.onInteractions(snapshot),
          onToolCall: payload =>
            void this.executeTool(payload, browserToolNames, params, desktop.window),
        });
        // 扩展页面工具只读当前页面，按 read 声明（同名时覆盖桌面工具）；桌面工具由主窗口渲染端的工具桥执行
        const browserSpecs: PiHostToolSpec[] = (params.browserTools ?? []).map(tool => ({
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
          risk: "read",
        }));
        const customTools = [
          ...desktop.tools.filter(tool => !browserToolNames.has(tool.name)),
          ...browserSpecs,
        ].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        const systemPrompt = [
          params.systemPrompt,
          params.pageContext
            ? `当前网页信息：\n- URL: ${params.pageContext.url}\n- 标题: ${params.pageContext.title}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n");
        const created = await PiSessionHostModule.create(client, {
          sessionId: hostId,
          scope: `browser:${session.id}`,
          cwd: "",
          modelRef: { providerId, modelId },
          systemPrompt,
          interactive: true,
          piSessionId: session.id,
          browserPageUrl: session.pageUrl,
          ...(customTools.length > 0 ? { customTools } : {}),
          ...(params.thinkingLevel ? { thinkingLevel: params.thinkingLevel as never } : {}),
        });
        if (!created.ok) throw new Error(created.error ?? "会话创建失败");

        const message = params.messages.at(-1);
        if (!message || message.role !== "user") {
          client.destroy();
          PiSessionHostModule.dispose(hostId);
          throw new Error("缺少本轮的用户消息");
        }
        // prompt 之前的投影：侧栏重开接回时作底（本轮的用户消息与回答由快照补上）
        const baseMessages = PiSessionHostModule.transcriptOf(hostId);
        let aborted = false;
        const done = (async () => {
          const prompted = PiSessionHostModule.prompt(
            hostId,
            promptTextOf(message.content),
            imagesOf(message.content),
            Array.isArray(message.content)
              ? {
                  content: message.content as never,
                  ...(typeof message.clientId === "string" ? { clientId: message.clientId } : {}),
                }
              : undefined
          );
          // prompt 在空闲会话上要等整轮跑完才返回（坑 7）；拒绝则立刻返回失败
          const outcome = await Promise.race([prompted, settled.then(() => ({ ok: true }))]);
          if (!outcome.ok)
            return { ok: false, aborted, error: (outcome as { error?: string }).error };
          await settled;
          return { ok: true, aborted };
        })().finally(() => {
          client.destroy();
          PiSessionHostModule.dispose(hostId);
        });

        const handle: BrowserRunHandle = {
          baseMessages,
          done,
          abort: async () => {
            aborted = true;
            await PiSessionHostModule.abort(hostId);
          },
          approve: (requestId, choice) =>
            PiSessionHostModule.interactionsOf(hostId)?.permissions.decide(requestId, choice) ??
            false,
          answer: (requestId, answers) => {
            const interactions = PiSessionHostModule.interactionsOf(hostId);
            return interactions
              ? interactions.questions.answer(requestId, answers)
              : "这轮回答已结束";
          },
        };
        return handle;
      },
    };
  }

  /**
   * 向主窗口要桌面工具清单（ToolRegistry/MCP 只在渲染端）。没有主窗口或超时就只用扩展页面工具，
   * 并记下执行这些工具时该派给哪个窗口。
   */
  private requestDesktopTools(): Promise<{
    tools: PiHostToolSpec[];
    window: Electron.WebContents | null;
  }> {
    const [win] = getMainWindows();
    if (!win || win.webContents.isDestroyed()) return Promise.resolve({ tools: [], window: null });
    const contents = win.webContents;
    const requestId = randomUUID();
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        ipcMain.removeListener("browser-bridge:tool-catalog-result", onResult);
        resolve({ tools: [], window: null });
      }, DESKTOP_TOOL_CATALOG_TIMEOUT_MS);
      const onResult = (
        _event: unknown,
        payload: { requestId: string; tools: PiHostToolSpec[] }
      ) => {
        if (payload?.requestId !== requestId) return;
        clearTimeout(timer);
        ipcMain.removeListener("browser-bridge:tool-catalog-result", onResult);
        resolve({ tools: payload.tools ?? [], window: contents });
      };
      ipcMain.on("browser-bridge:tool-catalog-result", onResult);
      contents.send("browser-bridge:tool-catalog", { requestId });
    });
  }

  /** 宿主会话的工具调用：扩展页面工具经 WS 给扩展执行，桌面工具转给主窗口渲染端的工具桥 */
  private async executeTool(
    payload: { sessionId: string; toolCallId: string; toolName: string; args: unknown },
    browserToolNames: Set<string>,
    params: AiRunStartParams,
    desktopWindow: Electron.WebContents | null
  ): Promise<void> {
    const bridge = PiSessionHostModule.bridgeOf(payload.sessionId);
    if (!bridge) return;
    if (!browserToolNames.has(payload.toolName)) {
      // 桌面工具：渲染端工具桥执行后经 pi-session:tool-result IPC 回传（按 sessionId 找到这里的 bridge）
      if (desktopWindow && !desktopWindow.isDestroyed()) {
        desktopWindow.send("pi-tool-call", payload);
      } else {
        bridge.handleError(payload.toolCallId, "桌面窗口已关闭，这个工具暂时不能用");
      }
      return;
    }
    {
      try {
        const result = (await this.extTools!.request(
          "ext.tool.execute",
          {
            requestId: payload.sessionId,
            conversationKey: `browser:${params.session?.id ?? ""}`,
            pageUrl: params.session?.pageUrl,
            toolCall: {
              id: payload.toolCallId,
              function: { name: payload.toolName, arguments: JSON.stringify(payload.args ?? {}) },
            },
          },
          EXT_TOOL_TIMEOUT_MS
        )) as { content?: string };
        bridge.handleResult(payload.toolCallId, { content: result?.content ?? "" });
      } catch (error) {
        bridge.handleError(
          payload.toolCallId,
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  }
}

export default new BrowserBridgeModule();

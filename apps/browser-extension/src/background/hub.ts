/**
 * 后台的消息枢纽：内容脚本端口 ↔ Tau 连接。
 * - 端口按标签页登记当前页 URL，Tau 反向请求页面工具时按 URL 找到对应标签页；
 * - 对话事件按 runId 只回给发起那一轮的标签页，连接状态与外观变化广播给所有标签页。
 */
import { COMPANION_METHODS } from "@tau/shared/browser-companion";
import type { AiRunEventNotification } from "@tau/shared/chat-core";
import {
  pageKeyOf,
  type BackgroundToContent,
  type ContentToBackground,
  type ConnectionStatus,
} from "../shared/messages";
import type { AnnotationStore } from "./annotation-store";
import type { CompanionConnection } from "./connection";

/** 内容脚本可透传给 Tau 的方法；其余（握手、配对）只由后台自己发 */
export const RPC_PASSTHROUGH = new Set<string>([
  COMPANION_METHODS.runStart,
  COMPANION_METHODS.runAbort,
  COMPANION_METHODS.runState,
  COMPANION_METHODS.runApprove,
  COMPANION_METHODS.runAnswer,
  COMPANION_METHODS.chatHistory,
  COMPANION_METHODS.chatOpen,
  COMPANION_METHODS.modelsList,
  COMPANION_METHODS.noteSave,
  COMPANION_METHODS.noteOpen,
]);

/** 笔记页（扩展自己的页面）可经 runtime.sendMessage 调用的 Tau 方法 */
export const NOTE_PAGE_METHODS = new Set<string>([
  COMPANION_METHODS.noteSave,
  COMPANION_METHODS.noteOpen,
]);

/** 只认本扩展的笔记页：内容脚本的 sender.url 是网页地址，扩展页面才是扩展协议 */
export const isNotePageSender = (
  sender: { id?: string; url?: string },
  extensionId: string
): boolean => {
  if (sender.id !== extensionId || !sender.url) return false;
  try {
    const url = new URL(sender.url);
    return (
      (url.protocol === "chrome-extension:" || url.protocol === "moz-extension:") &&
      url.pathname === "/note.html"
    );
  } catch {
    return false;
  }
};

const PAGE_TOOL_TIMEOUT_MS = 90_000;
/** 对话可能很长（模型思考 + 工具），start 只等受理，不等回答 */
const RPC_TIMEOUT_MS = 60_000;

export interface PortLike {
  postMessage(message: BackgroundToContent): void;
  onMessage: { addListener(listener: (message: ContentToBackground) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

interface PortState {
  tabId: number | undefined;
  url: string;
  lastActive: number;
}

export class CompanionHub {
  private readonly ports = new Map<PortLike, PortState>();
  private readonly runs = new Map<string, PortLike>();
  private readonly pageTools = new Map<
    string,
    {
      resolve: (content: string) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private toolSeq = 0;
  private connection!: CompanionConnection;
  private annotations!: AnnotationStore;

  bind(connection: CompanionConnection, annotations: AnnotationStore): void {
    this.connection = connection;
    this.annotations = annotations;
  }

  attach(port: PortLike, tabId: number | undefined): void {
    this.ports.set(port, { tabId, url: "", lastActive: Date.now() });
    port.onDisconnect.addListener(() => {
      this.ports.delete(port);
      for (const [runId, owner] of this.runs) if (owner === port) this.runs.delete(runId);
    });
    port.onMessage.addListener(message => void this.onMessage(port, message));
    port.postMessage({ kind: "status", status: this.connection.current });
  }

  /** 笔记页的请求（保存为卡片、打开卡片） */
  async handleNotePage(method: string, params: unknown): Promise<unknown> {
    if (!NOTE_PAGE_METHODS.has(method)) throw new Error(`不支持的方法：${method}`);
    return this.connection.request(method, params, RPC_TIMEOUT_MS);
  }

  /** 快捷键 / 工具栏按钮：切换该标签页的面板 */
  toggle(tabId: number | undefined): void {
    for (const [port, state] of this.ports) {
      if (state.tabId === tabId) port.postMessage({ kind: "toggle" });
    }
  }

  broadcastStatus(status: ConnectionStatus): void {
    for (const port of this.ports.keys()) port.postMessage({ kind: "status", status });
  }

  onNotification(method: string, data: unknown): void {
    if (method === COMPANION_METHODS.runEvent) {
      const notification = data as AiRunEventNotification;
      const port = this.runs.get(notification.runId);
      port?.postMessage({ kind: "notify", method, data });
      if (notification.event.type === "settled") this.runs.delete(notification.runId);
      return;
    }
    for (const port of this.ports.keys()) port.postMessage({ kind: "notify", method, data });
  }

  /** Tau 反向请求：在发起对话的页面上执行页面工具 */
  async onRequest(method: string, params: unknown): Promise<unknown> {
    if (method !== COMPANION_METHODS.pageTool) throw new Error(`扩展不支持：${method}`);
    const { pageUrl, name, args } = params as { pageUrl: string; name: string; args: unknown };
    const key = pageKeyOf(pageUrl);
    const candidates = [...this.ports].filter(([, state]) => pageKeyOf(state.url) === key);
    candidates.sort((a, b) => b[1].lastActive - a[1].lastActive);
    const port = candidates[0]?.[0];
    if (!port) throw new Error("这个网页已经关闭");
    const id = `t${++this.toolSeq}`;
    const content = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pageTools.delete(id);
        reject(new Error("页面工具超时"));
      }, PAGE_TOOL_TIMEOUT_MS);
      this.pageTools.set(id, { resolve, reject, timer });
      port.postMessage({ kind: "pageTool", id, name, args });
    });
    return { content };
  }

  private async onMessage(port: PortLike, message: ContentToBackground): Promise<void> {
    const state = this.ports.get(port);
    if (!state) return;
    state.lastActive = Date.now();
    if (message.kind === "page") {
      state.url = message.url;
      return;
    }
    if (message.kind === "pageToolResult") {
      const entry = this.pageTools.get(message.id);
      if (!entry) return;
      this.pageTools.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(message.error));
      else entry.resolve(message.content ?? "");
      return;
    }
    if (message.kind !== "call") return;
    try {
      const result = await this.call(port, message.method, message.params);
      port.postMessage({ kind: "result", id: message.id, result });
    } catch (error) {
      port.postMessage({
        kind: "result",
        id: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async call(port: PortLike, method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case "status":
        return this.connection.current;
      case "connect":
        return this.connection.connect();
      case "annotations.load":
        return this.annotations.load((params as { url: string }).url);
      case "annotations.save": {
        const { url, title, items } = params as { url: string; title: string; items: never[] };
        return this.annotations.save(url, title, items);
      }
      case "rpc": {
        const request = params as { method: string; params?: unknown };
        if (!RPC_PASSTHROUGH.has(request.method))
          throw new Error(`不支持的方法：${request.method}`);
        // 先登记 runId 再发起，避免漏掉最早的事件
        const runId = (request.params as { runId?: unknown } | undefined)?.runId;
        if (request.method === COMPANION_METHODS.runStart && typeof runId === "string")
          this.runs.set(runId, port);
        try {
          const result = await this.connection.request(
            request.method,
            request.params,
            RPC_TIMEOUT_MS
          );
          if (request.method === COMPANION_METHODS.runState) {
            const resumed = (result as { runId?: string } | null)?.runId;
            if (resumed) this.runs.set(resumed, port);
          }
          return result;
        } catch (error) {
          if (request.method === COMPANION_METHODS.runStart && typeof runId === "string")
            this.runs.delete(runId);
          throw error;
        }
      }
      default:
        throw new Error(`未知方法：${method}`);
    }
  }
}

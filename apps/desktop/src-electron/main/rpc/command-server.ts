import { randomBytes } from "node:crypto";
import { app, BrowserWindow, webContents } from "electron";
import type { WebContents } from "electron";
import Express from "express";
import type { Application, Request } from "express";
import {
  registerCommandRoutes as registerNeutralCommandRoutes,
  type CommandEvent,
  type InvokeRequest,
} from "@tau/rpc";
import { getCommandRegistry } from "./ipc-registry";

export const RPC_SERVER_PORT = 24678;

// 每次启动生成，经 rpc-bootstrap 注入渲染进程，防止本机其他网页直接调用 command
const rpcToken = randomBytes(32).toString("hex");

export function getRpcToken(): string {
  return rpcToken;
}

type SenderProvider = () => WebContents | null;
let defaultSenderProvider: SenderProvider = () => null;

/** 注入主窗口 sender 解析方式（由主入口在窗口创建后设置，避免循环依赖） */
export function setDefaultSenderProvider(provider: SenderProvider): void {
  defaultSenderProvider = provider;
}

function isAuthorized(req: Request): boolean {
  // 开发模式跳过校验，便于浏览器直接打开 dev server 预演 Web 端；
  // 已知代价：dev 运行期间本机任意网页可直调 command（接受该风险，
  // dev 环境本就无数据隔离诉求）。打包版必须校验（24678 端口 CORS 全开）
  if (!app.isPackaged) {
    return true;
  }
  const header = req.headers.authorization;
  return header === `Bearer ${rpcToken}`;
}

/**
 * Electron 装配的事件解析：windowId 优先（多窗口各自路由数据库），
 * 缺省回退主窗口。现有 handler 对 event 的使用仅限 event.sender。
 */
function resolveEvent(request: InvokeRequest): CommandEvent {
  let sender: WebContents | null = null;
  if (typeof request.windowId === "number" && request.windowId > 0) {
    // windowId 为 webContents id（rpc-bootstrap 透传 event.sender.id），同空间反查
    sender = webContents.fromId(request.windowId) ?? null;
  }
  if (!sender) {
    sender =
      defaultSenderProvider() ??
      BrowserWindow.getAllWindows().find(win => !win.isDestroyed())?.webContents ??
      null;
  }
  if (!sender) {
    throw new Error("no available window to resolve rpc sender");
  }
  return { sender, senderFrame: null, windowId: request.windowId };
}

/** 挂载 HTTP RPC 端点；分发逻辑在中立层（@tau/rpc），此处仅注入 Electron 装配 */
export function registerCommandRoutes(app: Application): void {
  registerNeutralCommandRoutes(app, {
    registry: getCommandRegistry(),
    resolveEvent,
    isAuthorized,
    // JSON body 解析作用域化到 /rpc 路由且置于鉴权之后，未认证请求不再缓冲解析请求体
    bodyParser: Express.json({ limit: "256mb" }),
  });
}

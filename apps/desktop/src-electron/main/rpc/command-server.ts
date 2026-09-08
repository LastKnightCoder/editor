import { randomBytes } from "node:crypto";
import { app, BrowserWindow, webContents } from "electron";
import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from "electron";
import Express from "express";
import type { Application, NextFunction, Request, Response } from "express";
import {
  deserialize,
  serialize,
  RpcErrorCode,
  TypedJsonError,
  type InvokeRequest,
  type InvokeResponse,
  type RpcErrorPayload,
} from "@tau/rpc";
import { getInvokeHandler, getOnHandler } from "./ipc-registry";

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

function unauthorized(res: Response): void {
  const body: InvokeResponse<null> = {
    ok: false,
    error: { code: RpcErrorCode.UNAUTHORIZED, message: "invalid rpc token" },
  };
  res.status(401).json(body);
}

/** 鉴权中间件：置于 body 解析之前，未认证请求不触发大 body 缓冲解析 */
function requireRpcAuth(req: Request, res: Response, next: NextFunction): void {
  if (!isAuthorized(req)) {
    unauthorized(res);
    return;
  }
  next();
}

/**
 * 构造带真实 sender 的 mock event：windowId 优先（多窗口各自路由数据库），
 * 缺省回退主窗口。现有 handler 对 event 的使用仅限 event.sender。
 */
function createMockEvent(windowId?: number): IpcMainInvokeEvent | IpcMainEvent {
  let sender: WebContents | null = null;
  if (typeof windowId === "number" && windowId > 0) {
    // windowId 为 webContents id（rpc-bootstrap 透传 event.sender.id），同空间反查
    sender = webContents.fromId(windowId) ?? null;
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
  return { sender, senderFrame: null } as IpcMainInvokeEvent;
}

function errorPayload(error: unknown, channel: string): RpcErrorPayload {
  const err = error as Error;
  // 非 Electron 调用丢失了 channel 上下文，附加上便于定位
  const base: RpcErrorPayload = {
    code: error instanceof TypedJsonError ? RpcErrorCode.SERIALIZE : RpcErrorCode.HANDLER,
    name: err?.name || "Error",
    message: err?.message || String(error),
    stack: err?.stack,
    channel,
  };
  return base;
}

async function handleInvoke(req: Request, res: Response): Promise<void> {
  const request = req.body as InvokeRequest | undefined;
  if (!request || typeof request.channel !== "string") {
    res.status(400).json({
      ok: false,
      error: { code: RpcErrorCode.HANDLER, message: "invalid request body" },
    } satisfies InvokeResponse<null>);
    return;
  }
  const { channel } = request;

  const handler = getInvokeHandler(channel);
  if (!handler) {
    // 模块可能尚未初始化（BACKGROUND 层晚于窗口创建），客户端会做有限重试
    const body: InvokeResponse<null> = {
      ok: false,
      error: {
        code: RpcErrorCode.NO_HANDLER,
        message: `no handler registered for channel "${channel}"`,
      },
    };
    res.json(body);
    return;
  }

  let event: IpcMainInvokeEvent | IpcMainEvent;
  try {
    event = createMockEvent(request.windowId);
  } catch (error) {
    const body: InvokeResponse<null> = {
      ok: false,
      error: errorPayload(error, channel),
    };
    res.status(500).json(body);
    return;
  }

  try {
    // deserialize 需在 try 内：非法信封（如非法 bigint/base64）会抛错，
    // 若置于 try 外将导致 unhandled rejection 且响应永不发出
    const args = (Array.isArray(request.args) ? request.args : []).map(arg => deserialize(arg));
    const result = await handler(event as IpcMainInvokeEvent, ...args);
    const body: InvokeResponse<unknown> = { ok: true, data: serialize(result) };
    res.json(body);
  } catch (error) {
    const body: InvokeResponse<null> = {
      ok: false,
      error: errorPayload(error, channel),
    };
    res.status(500).json(body);
  }
}

function handleSend(req: Request, res: Response): void {
  const request = req.body as InvokeRequest | undefined;
  if (!request || typeof request.channel !== "string") {
    res.status(400).json({
      ok: false,
      error: { code: RpcErrorCode.HANDLER, message: "invalid request body" },
    } satisfies InvokeResponse<null>);
    return;
  }

  const handler = getOnHandler(request.channel);
  if (!handler) {
    const body: InvokeResponse<null> = {
      ok: false,
      error: {
        code: RpcErrorCode.NO_HANDLER,
        message: `no listener registered for channel "${request.channel}"`,
      },
    };
    res.status(404).json(body);
    return;
  }

  try {
    const event = createMockEvent(request.windowId);
    const args = (Array.isArray(request.args) ? request.args : []).map(arg => deserialize(arg));
    handler(event as IpcMainEvent, ...args);
    res.status(202).end();
  } catch (error) {
    const body: InvokeResponse<null> = {
      ok: false,
      error: errorPayload(error, request.channel),
    };
    res.status(500).json(body);
  }
}

/** 挂载 HTTP RPC 端点；必须挂在 404 兜底中间件之前（Express 按注册顺序匹配） */
export function registerCommandRoutes(app: Application): void {
  // JSON body 解析作用域化到 /rpc 路由且置于鉴权之后，未认证请求不再缓冲解析请求体
  const rpcBodyParser = Express.json({ limit: "256mb" });
  app.post("/rpc/invoke", requireRpcAuth, rpcBodyParser, (req, res) => {
    void handleInvoke(req, res);
  });

  app.post("/rpc/send", requireRpcAuth, rpcBodyParser, (req, res) => {
    handleSend(req, res);
  });
}

import type { Application, Request, RequestHandler, Response } from "express";
import {
  RpcErrorCode,
  type InvokeRequest,
  type InvokeResponse,
  type RpcErrorPayload,
} from "./protocol";
import { deserialize, serialize, TypedJsonError } from "./typed-json";
import type { CommandEvent } from "./command";
import type { CommandRegistry } from "./command-registry";

/**
 * HTTP RPC 端点的中立实现：/rpc/invoke 与 /rpc/send 的分发逻辑，
 * 不依赖 Electron。宿主（Electron 本地 server 或 Web Server）注入
 * registry、事件解析、鉴权与 body 解析器完成装配。
 */

export interface CommandEndpointOptions {
  registry: CommandRegistry;
  /** 由宿主环境解析事件上下文（Electron：windowId 反查 webContents；Web：合成 sender） */
  resolveEvent(request: InvokeRequest): CommandEvent;
  isAuthorized(req: Request): boolean;
  /** JSON body 解析器，作用域化到 /rpc 路由且置于鉴权之后，未认证请求不缓冲请求体 */
  bodyParser: RequestHandler;
}

function unauthorized(res: Response): void {
  const body: InvokeResponse<null> = {
    ok: false,
    error: { code: RpcErrorCode.UNAUTHORIZED, message: "invalid rpc token" },
  };
  res.status(401).json(body);
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

function parseInvokeRequest(req: Request): InvokeRequest | null {
  const request = req.body as InvokeRequest | undefined;
  if (!request || typeof request.channel !== "string") {
    return null;
  }
  return request;
}

async function handleInvoke(
  req: Request,
  res: Response,
  options: CommandEndpointOptions
): Promise<void> {
  const request = parseInvokeRequest(req);
  if (!request) {
    res.status(400).json({
      ok: false,
      error: { code: RpcErrorCode.HANDLER, message: "invalid request body" },
    } satisfies InvokeResponse<null>);
    return;
  }
  const { channel } = request;

  const handler = options.registry.getInvokeHandler(channel);
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

  let event: CommandEvent;
  try {
    event = options.resolveEvent(request);
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
    const result = await handler(event, ...args);
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

function handleSend(req: Request, res: Response, options: CommandEndpointOptions): void {
  const request = parseInvokeRequest(req);
  if (!request) {
    res.status(400).json({
      ok: false,
      error: { code: RpcErrorCode.HANDLER, message: "invalid request body" },
    } satisfies InvokeResponse<null>);
    return;
  }

  const handler = options.registry.getOnHandler(request.channel);
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
    const event = options.resolveEvent(request);
    const args = (Array.isArray(request.args) ? request.args : []).map(arg => deserialize(arg));
    handler(event, ...args);
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
export function registerCommandRoutes(app: Application, options: CommandEndpointOptions): void {
  const requireRpcAuth = (req: Request, res: Response, next: () => void): void => {
    if (!options.isAuthorized(req)) {
      unauthorized(res);
      return;
    }
    next();
  };

  app.post("/rpc/invoke", requireRpcAuth, options.bodyParser, (req, res) => {
    void handleInvoke(req, res, options);
  });

  app.post("/rpc/send", requireRpcAuth, options.bodyParser, (req, res) => {
    handleSend(req, res, options);
  });
}

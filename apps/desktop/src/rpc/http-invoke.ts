import {
  deserialize,
  serialize,
  RpcErrorCode,
  type InvokeRequest,
  type InvokeResponse,
} from "@tau/rpc";
import { getRpcConfig } from "./config";

// 启动竞态兜底：server listen 与模块初始化（BACKGROUND 层）晚于窗口创建，
// 此窗口期内的连接失败 / NO_HANDLER 做有限重试
const RETRY_INTERVAL_MS = 500;
const RETRY_TIMEOUT_MS = 5000;
// 单次请求超时上限：仅拦截连接悬挂，命令本身允许长耗时故取宽裕值
const REQUEST_TIMEOUT_MS = 300_000;

// 收到过任意协议响应（NO_HANDLER 除外）即视为就绪：此后再遇 NO_HANDLER 属于
// channel 拼写错误或模块确实缺失，立即失败不再空等重试；网络层失败时重置
// （服务不可用，恢复后可能处于全新的初始化竞态窗口）
let rpcReady = false;

class RpcInvokeError extends Error {
  code?: string;
  channel?: string;

  constructor(
    message: string,
    options: { name?: string; code?: string; channel?: string; stack?: string }
  ) {
    super(message);
    this.name = options.name ?? "Error";
    this.code = options.code;
    this.channel = options.channel;
    if (options.stack) {
      this.stack = options.stack;
    }
  }
}

async function postRpc(
  path: string,
  channel: string,
  args: unknown[]
): Promise<InvokeResponse<unknown>> {
  const config = await getRpcConfig();
  const body: InvokeRequest = {
    channel,
    args: args.map(arg => serialize(arg)),
    windowId: config.windowId,
  };
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  try {
    return JSON.parse(text) as InvokeResponse<unknown>;
  } catch {
    // 网关/代理返回的非协议内容（如 vite 404 页面、后端未启动时的 502），
    // 视作服务暂不可用，归入网络层错误交由上层重试
    throw new TypeError(
      `unexpected rpc response (status ${response.status}): ${text.slice(0, 120)}`
    );
  }
}

function toInvokeError(body: Extract<InvokeResponse<null>, { ok: false }>): Error {
  return new RpcInvokeError(body.error.message, {
    name: body.error.name,
    code: body.error.code,
    channel: body.error.channel,
    stack: body.error.stack,
  });
}

async function postWithRetry(
  path: string,
  channel: string,
  args: unknown[]
): Promise<InvokeResponse<unknown>> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt <= RETRY_TIMEOUT_MS) {
    try {
      const body = await postRpc(path, channel, args);
      if (body.ok || body.error.code !== RpcErrorCode.NO_HANDLER) {
        rpcReady = true;
        return body;
      }
      // 就绪后的 NO_HANDLER 是确定性错误（非启动竞态），直接返回让上层抛出
      if (rpcReady) {
        return body;
      }
      lastError = toInvokeError(body);
    } catch (error) {
      // 仅对网络层失败（连接被拒等）重试，解析失败等问题直接抛出；
      // 网络失败说明服务不可用，重置就绪标记以重新开启 NO_HANDLER 竞态窗口
      if (!(error instanceof TypeError)) {
        throw error;
      }
      rpcReady = false;
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL_MS));
  }
  throw lastError;
}

export async function httpInvoke<T = unknown>(channel: string, args: unknown[]): Promise<T> {
  const body = await postWithRetry("/rpc/invoke", channel, args);
  if (!body.ok) {
    throw toInvokeError(body);
  }
  return deserialize(body.data) as T;
}

/** 与 IPC send 语义对齐：fire-and-forget，失败仅告警不抛出 */
export async function httpSend(channel: string, args: unknown[]): Promise<void> {
  try {
    const body = await postWithRetry("/rpc/send", channel, args);
    if (!body.ok) {
      console.error(`[rpc] send "${channel}" failed:`, body.error);
    }
  } catch (error) {
    console.error(`[rpc] send "${channel}" failed:`, error);
  }
}

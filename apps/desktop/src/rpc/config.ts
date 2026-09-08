import type { RpcBootstrapInfo } from "@tau/rpc";

export interface RpcClientConfig {
  /** RPC 服务地址；空串表示同源（相对路径），用于前端与 Web Server 同域部署 */
  baseUrl: string;
  token: string;
  /** 调用方窗口 id；Web 环境下为 0（服务端回退默认路由） */
  windowId: number;
}

/** Web 构建指向 Web Server；Electron 下可缺省（走 bootstrap 注入的本地端口） */
const RPC_BASE_URL_ENV = import.meta.env.VITE_RPC_BASE_URL as string | undefined;
const WEB_TOKEN_STORAGE_KEY = "tau_rpc_token";

let configPromise: Promise<RpcClientConfig> | null = null;

async function resolveConfig(): Promise<RpcClientConfig> {
  const bridge = window.electron;
  if (bridge?.bootstrap) {
    const info = (await bridge.bootstrap()) as RpcBootstrapInfo;
    return {
      baseUrl: RPC_BASE_URL_ENV || `http://127.0.0.1:${info.port}`,
      token: info.token,
      windowId: info.windowId,
    };
  }
  // Web 环境：baseUrl 缺省走同源（前端与 Web Server 通常同域部署），
  // token 由部署方写入 localStorage（未来接入登录态后替换）
  return {
    baseUrl: RPC_BASE_URL_ENV ?? "",
    token: localStorage.getItem(WEB_TOKEN_STORAGE_KEY) ?? "",
    windowId: 0,
  };
}

export function getRpcConfig(): Promise<RpcClientConfig> {
  if (!configPromise) {
    configPromise = resolveConfig().catch(error => {
      // 失败后允许下次重新解析（如启动竞态期 bootstrap 失败）
      configPromise = null;
      throw error;
    });
  }
  return configPromise;
}

export const DEFAULT_API_BASE_URL = "http://localhost:8787";

export interface PortalEnv {
  apiBaseUrl: string;
  mock: boolean;
}

/** 解析运行配置：模拟模式必须显式开启，且只允许开发服务器使用 */
export function resolvePortalEnv(env: {
  VITE_API_BASE_URL?: string;
  VITE_MOCK_API?: string;
  DEV: boolean;
}): PortalEnv {
  const mock = env.VITE_MOCK_API === "true";
  if (mock && !env.DEV) throw new Error("构建产物禁止启用模拟接口（VITE_MOCK_API）");
  const apiBaseUrl = (env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  return { apiBaseUrl, mock };
}

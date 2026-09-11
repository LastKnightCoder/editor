/**
 * Web Server 配置（环境变量驱动）。
 *
 * 仅显式开发模式允许省略 AUTH_TOKEN，其他环境必须配置非空令牌。
 */
export interface WebServerConfig {
  port: number;
  /** 命令数据落盘目录（setting.json 等，桌面版的 ~/.editor 在服务端的对应物） */
  dataDir: string;
  authToken: string | null;
}

export function loadConfig(): WebServerConfig {
  const authToken = process.env.AUTH_TOKEN;
  if (authToken !== undefined && authToken.trim() === "") {
    throw new Error("AUTH_TOKEN 不能为空或纯空白");
  }
  if (authToken === undefined && process.env.NODE_ENV !== "development") {
    throw new Error("非开发环境必须设置 AUTH_TOKEN");
  }
  return {
    port: Number(process.env.PORT ?? 24680),
    dataDir: process.env.DATA_DIR ?? "data",
    authToken: authToken ?? null,
  };
}

/**
 * Web Server 配置（环境变量驱动）。
 *
 * 鉴权语义对齐桌面版：AUTH_TOKEN 未设置时视为开发模式跳过校验，
 * 便于浏览器直开预演；生产部署必须设置（未来接入登录态后替换）。
 */
export interface WebServerConfig {
  port: number;
  /** 命令数据落盘目录（setting.json 等，桌面版的 ~/.editor 在服务端的对应物） */
  dataDir: string;
  authToken: string | null;
}

export function loadConfig(): WebServerConfig {
  return {
    port: Number(process.env.PORT ?? 24680),
    dataDir: process.env.DATA_DIR ?? "data",
    authToken: process.env.AUTH_TOKEN ?? null,
  };
}

import { loadConfig } from "./config";
import { registerSettingCommands } from "./commands/setting";
import { createServer } from "./server";

/**
 * Web Server 入口。
 *
 * 启动：pnpm --filter @tau/web-server dev
 * 预演：desktop 渲染端以 VITE_RPC_BASE_URL=http://127.0.0.1:24680 指向本服务，
 * 浏览器直开 desktop dev server 即可走查（dev 语义下无需 token）。
 */
async function main(): Promise<void> {
  const config = loadConfig();
  registerSettingCommands(config);

  const webServer = createServer(config);
  registerShutdown(webServer.close);
  await webServer.listen();
  webServer.events.startHeartbeat();

  const authMode = config.authToken === null ? "已跳过（开发模式）" : "Bearer token";
  console.log(`[web-server] listening on http://127.0.0.1:${config.port}（鉴权：${authMode}）`);
  console.log(`[web-server] 数据目录：${config.dataDir}；已注册命令：setting 契约（read/write）`);
}

let closing = false;
function registerShutdown(close: () => Promise<void>): void {
  const shutdown = (signal: string) => {
    if (closing) {
      return;
    }
    closing = true;
    console.log(`[web-server] 收到 ${signal}，正在关闭...`);
    void close().finally(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch(error => {
  console.error("[web-server] 启动失败:", error);
  process.exit(1);
});

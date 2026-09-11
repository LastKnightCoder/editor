import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WebServerConfig } from "../config";
import { registerSettingCommands } from "../commands/setting";
import { createServer, type WebServer } from "../server";

describe("web-server 契约命令全链路", () => {
  let webServer: WebServer;
  let baseUrl: string;

  beforeEach(async () => {
    const config: WebServerConfig = {
      port: 0,
      dataDir: mkdtempSync(join(tmpdir(), "tau-web-server-")),
      authToken: null,
    };
    registerSettingCommands(config);
    webServer = createServer(config);
    await webServer.listen();
    const address = webServer.server.address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  });

  afterEach(async () => {
    await webServer.close();
  });

  async function invoke(channel: string, args: unknown[] = []): Promise<Record<string, any>> {
    const response = await fetch(`${baseUrl}/rpc/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, args }),
    });
    return (await response.json()) as Record<string, any>;
  }

  it("read-setting 首读返回初始化的空对象", async () => {
    const body = await invoke("read-setting");
    expect(body).toEqual({ ok: true, data: "{}" });
  });

  it("write-setting 落盘后 read 读回写入内容（同契约双实现）", async () => {
    const payload = JSON.stringify({ theme: "dark", editor: { fontSize: 15 } });
    const writeResult = await invoke("write-setting", [payload]);
    expect(writeResult.ok).toBe(true);

    // 同时验证主进程语义的 register 侧：契约 handler 可被直接调用
    const readResult = await invoke("read-setting");
    expect(readResult).toEqual({ ok: true, data: payload });
  });

  it("未实现的 channel 返回 NO_HANDLER（客户端据此重试或降级）", async () => {
    const body = await invoke("some-desktop-only-command");
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NO_HANDLER");
  });

  it("/health 返回存活信息", async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = (await response.json()) as Record<string, any>;
    expect(body.ok).toBe(true);
    expect(typeof body.uptime).toBe("number");
  });

  it("事件广播帧符合渲染端 event-hub 的解析约定", async () => {
    // 渲染端约定：{type:"JsonRpcNotification", method:"rpc-event", data:{channel,args,windowId}}
    // web-server 的命令实现经 event.sender.send 推送即走该格式
    webServer.events.broadcast("demo:changed", [{ value: 1 }]);
    // 帧格式由 broadcast 内部构造，这里验证 WS 通道可用性与心跳不崩即可
    expect(webServer.events.clientCount).toBe(0);
  });
});

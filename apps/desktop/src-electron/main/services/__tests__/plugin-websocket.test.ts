// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { PluginWebSocketService } from "../plugin-websocket";
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function fixture() {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise(resolve => server.once("listening", resolve));
  const service = new PluginWebSocketService();
  cleanups.push(
    () =>
      new Promise(resolve => {
        server.clients.forEach(socket => socket.terminate());
        server.close(() => resolve());
      })
  );
  cleanups.push(async () => service.releaseOwner(1));
  const address = server.address();
  if (typeof address === "string" || !address) throw new Error("测试服务未启动");
  const request = {
    url: `ws://127.0.0.1:${address.port}`,
    headers: { "X-Test-Auth": "fixture" },
    protocols: ["asr"],
  };
  return { server, service, request };
}
it("原生连接保留鉴权、子协议、早到消息、二进制及关闭原因", async () => {
  const { server, service, request } = await fixture();
  server.on("connection", (socket, handshake) => {
    expect(handshake.headers["x-test-auth"]).toBe("fixture");
    socket.send("early");
    socket.on("message", (data, binary) => {
      expect(binary).toBe(true);
      socket.send(data);
      socket.close(3002, "完成");
    });
  });
  expect((await service.open(1, "session", request)).protocol).toBe("asr");
  expect(await service.receive(1, "session")).toEqual({ type: "message", data: "early" });
  await service.send(1, "session", new Uint8Array([1, 2]));
  expect(await service.receive(1, "session")).toEqual({
    type: "message",
    data: new Uint8Array([1, 2]),
  });
  expect(await service.receive(1, "session")).toEqual({
    type: "close",
    code: 3002,
    reason: "完成",
    wasClean: true,
  });
});
it("主动关闭走握手，生命周期释放终止待读取，跨窗口不可访问", async () => {
  const { service, request } = await fixture();
  await service.open(1, "first", request);
  await expect(service.receive(2, "first")).rejects.toThrow();
  service.close(1, "first", 3003, "主动结束");
  expect(await service.receive(1, "first")).toMatchObject({
    type: "close",
    code: 3003,
    reason: "主动结束",
  });
  await service.open(1, "second", request);
  const pending = service.receive(1, "second");
  service.releaseOwner(1);
  await expect(pending).rejects.toThrow(/取消/);
});

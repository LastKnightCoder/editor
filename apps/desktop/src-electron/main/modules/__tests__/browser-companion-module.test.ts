import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  dir: "",
  route: null as null | ((request: any, socket: any, head: Buffer) => void),
  handlers: new Map<string, (...args: any[]) => any>(),
  sent: [] as Array<[string, unknown]>,
  startRun: vi.fn(),
}));
const mainWindow = vi.hoisted(() => ({
  isDestroyed: () => false,
  webContents: {
    isDestroyed: () => false,
    send: (channel: string, payload: unknown) => env.sent.push([channel, payload]),
  },
}));

vi.mock("electron", () => ({
  app: { getPath: () => env.dir, getVersion: () => "9.9.9" },
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) =>
      env.handlers.set(channel, handler),
    on: (channel: string, handler: (...args: any[]) => any) => env.handlers.set(channel, handler),
    removeListener: () => {},
  },
  BrowserWindow: { fromWebContents: () => mainWindow },
}));
vi.mock("../server", () => ({
  default: {
    registerUpgradeRoute: (_path: string, route: typeof env.route) => (env.route = route),
  },
}));
vi.mock("../../windows/main-window", () => ({
  getMainWindows: () => [mainWindow],
  isMainWindow: () => true,
  showOrCreateMainWindow: () => {},
}));
vi.mock("../../windows/notification-router", () => ({
  routeNotification: () => "in-app",
  dismissNotification: () => {},
}));
vi.mock("../../windows", () => ({ getMainWindows: () => [] }));
vi.mock("../user-setting", () => ({
  default: {
    getSettingSnapshot: async () => ({
      llmUsageSettings: { chat: { providerId: "p", modelId: "m" } },
      llmProviders: [{ id: "p", apiKey: "sk-secret", models: [{ id: "m", name: "模型 M" }] }],
    }),
  },
}));
vi.mock("../pi-session-host", () => ({ default: {} }));
vi.mock("../../utils/PathUtil", () => ({ default: { getAppDir: () => env.dir } }));
vi.mock("../browser-companion/run-driver", () => ({
  createCompanionRunDriver: () => ({ start: env.startRun }),
}));
vi.mock("../browser-companion/library", () => ({
  listAnnotations: () => [],
  syncAnnotations: () => ({ ok: true }),
  saveNote: async () => ({ cardId: 1 }),
}));

import companion from "../browser-companion";
import { writeSessionFile } from "../pi-session-files";
import { browserSessionDirOf } from "../pi-session-paths";

const ORIGIN = `chrome-extension://${"a".repeat(32)}`;
const CLIENT = "client00000000000001";
let server: http.Server;
let url: string;

beforeAll(async () => {
  env.dir = mkdtempSync(path.join(tmpdir(), "companion-"));
  companion.init();
  server = http.createServer();
  server.on("upgrade", (request, socket, head) => env.route!(request, socket, head));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/browser`;
});
afterAll(() => {
  server.close();
  rmSync(env.dir, { recursive: true, force: true });
});

interface Client {
  ws: WebSocket;
  notes: Array<{ method: string; data: any }>;
  call(method: string, params?: unknown): Promise<any>;
  closed: Promise<number>;
}

let seq = 0;
const connect = (origin = ORIGIN) =>
  new Promise<Client>((resolve, reject) => {
    const ws = new WebSocket(url, { headers: { origin } });
    const pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();
    const notes: Client["notes"] = [];
    const closed = new Promise<number>(done => ws.on("close", code => done(code)));
    ws.on("message", raw => {
      const frame = JSON.parse(String(raw));
      if (frame.type === "JsonRpcNotification")
        notes.push({ method: frame.method, data: frame.data });
      if (frame.type === "JsonRpcResponse") {
        const entry = pending.get(frame.id);
        if (frame.error) entry?.reject(new Error(frame.error.message));
        else entry?.resolve(frame.result);
      }
    });
    ws.on("unexpected-response", (_request, response) =>
      reject(new Error(String(response.statusCode)))
    );
    ws.on("open", () =>
      resolve({
        ws,
        notes,
        closed,
        call: (method, params) =>
          new Promise((ok, fail) => {
            const id = `c${++seq}`;
            pending.set(id, { resolve: ok, reject: fail });
            ws.send(JSON.stringify({ type: "JsonRpcRequest", id, method, params }));
          }),
      })
    );
  });

const event = { sender: mainWindow.webContents };
const INFO = { browser: "Chrome", os: "macOS", version: "0.1.0" };

async function pair(clientId: string): Promise<Client> {
  env.sent.length = 0;
  const client = await connect();
  await client.call("pair.request", { clientId, info: INFO, nonce: "a".repeat(32) });
  const prompt = env.sent.find(([channel]) => channel === "browser-companion:pair-prompt")?.[1] as {
    requestId: string;
  };
  const decide = env.handlers.get("browser-companion:pair-decide");
  if (!decide) throw new Error("未注册配对处理器");
  await decide(event, prompt.requestId, true, []);
  await vi.waitFor(() => expect(client.notes.some(note => note.method === "ready")).toBe(true));
  return client;
}

describe("browser-companion 模块", () => {
  it("拒绝网页来源与无来源的握手", async () => {
    await expect(connect("https://evil.example")).rejects.toThrow("403");
    await expect(
      new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        ws.on("open", resolve);
        ws.on("unexpected-response", (_r, response) =>
          reject(new Error(String(response.statusCode)))
        );
      })
    ).rejects.toThrow("403");
  });

  it("未授权连接只能握手；伪造 token 被拒", async () => {
    const client = await connect();
    await expect(client.call("models.list")).rejects.toThrow("尚未完成授权");
    await expect(
      client.call("hello", { clientId: CLIENT, token: "guess", info: INFO })
    ).rejects.toThrow("unknown-client");
    await client.closed;
  });

  it("配对：主窗口弹窗与扩展的校验码一致，允许后签发 token 并就绪", async () => {
    const client = await connect();
    const pending = await client.call("pair.request", {
      clientId: CLIENT,
      info: INFO,
      nonce: "e".repeat(32),
    });
    expect(pending).toMatchObject({
      status: "pending",
      nonce: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
    const prompt = env.sent.find(
      ([channel]) => channel === "browser-companion:pair-prompt"
    )![1] as any;
    const { deriveSas } = await import("@tau/shared/browser-companion");
    expect(prompt.code).toBe(await deriveSas("e".repeat(32), pending.nonce));

    await env.handlers.get("browser-companion:pair-decide")!(event, prompt.requestId, true, [
      "tools",
    ]);
    await vi.waitFor(() =>
      expect(client.notes.map(note => note.method)).toEqual(["pair.granted", "ready"])
    );
    const granted = client.notes[0].data;
    expect(granted.scopes).toEqual(["chat", "annotations", "notes", "tools"]);

    const models = await client.call("models.list");
    expect(models).toEqual([{ providerId: "p", modelId: "m", label: "模型 M", isDefault: true }]);
    expect(JSON.stringify(models)).not.toContain("sk-secret");
    await expect(client.call("pair.request", {})).rejects.toThrow("未知方法");
    client.ws.close();
    await client.closed;

    // 之后用 token 直连
    const again = await connect();
    const ready = await again.call("hello", { clientId: CLIENT, token: granted.token, info: INFO });
    expect(ready).toMatchObject({ appVersion: "9.9.9", scopes: granted.scopes });
    await expect(again.call("annotations.list", { url: "https://a.com" })).resolves.toEqual([]);
    env.sent.length = 0;
    await again.call("chat.open", { session: { id: "s1", pageUrl: "https://a.com/x#h" } });
    expect(env.sent).toContainEqual([
      "browser-companion:open-chat",
      { url: "https://a.com/x", session: "s1" },
    ]);
    await expect(
      again.call("chat.open", { session: { id: "../x", pageUrl: "https://a.com" } })
    ).rejects.toThrow("参数无效");

    // token 不能换个扩展来源使用
    const other = await connect(`chrome-extension://${"b".repeat(32)}`);
    await expect(
      other.call("hello", { clientId: CLIENT, token: granted.token, info: INFO })
    ).rejects.toThrow("bad-token");

    // 收回可选权限后立即生效；撤销即断开
    await env.handlers.get("browser-companion:set-scopes")!(event, CLIENT, []);
    const snapshot = await env.handlers.get("browser-companion:snapshot")!(event);
    expect(snapshot.clients[0]).not.toHaveProperty("tokenHash");
    expect(snapshot.online).toContain(CLIENT);
    await env.handlers.get("browser-companion:revoke")!(event, CLIENT);
    expect(await again.closed).toBe(4006);
    expect(again.notes.some(note => note.method === "revoked")).toBe(true);

    const after = await connect();
    await expect(
      after.call("hello", { clientId: CLIENT, token: granted.token, info: INFO })
    ).rejects.toThrow("unknown-client");
  });

  it("拒绝三次后冷却期内不再弹窗", async () => {
    const id = "client00000000000002";
    for (let i = 0; i < 3; i += 1) {
      env.sent.length = 0;
      const client = await connect();
      await client.call("pair.request", { clientId: id, info: INFO, nonce: "f".repeat(32) });
      const prompt = env.sent.find(
        ([channel]) => channel === "browser-companion:pair-prompt"
      )![1] as any;
      await env.handlers.get("browser-companion:pair-decide")!(event, prompt.requestId, false, []);
      await client.closed;
    }
    env.sent.length = 0;
    const client = await connect();
    const result = await client.call("pair.request", {
      clientId: id,
      info: INFO,
      nonce: "f".repeat(32),
    });
    expect(result.status).toBe("throttled");
    expect(env.sent.some(([channel]) => channel === "browser-companion:pair-prompt")).toBe(false);
  });

  it("同一会话的启动和删除互斥，删除后拒绝继续旧会话", async () => {
    const a = await pair("client00000000000003");
    const b = await pair("client00000000000004");
    const session = { id: "shared", pageUrl: "https://example.com/shared" };
    writeSessionFile({
      sessionDir: browserSessionDirOf(session.pageUrl),
      sessionId: session.id,
      cwd: env.dir,
      createdAt: 1,
      messages: [],
    });
    let finish!: () => void;
    const done = new Promise(resolve => {
      finish = () => resolve({ ok: true, aborted: false });
    });
    env.startRun.mockResolvedValue({
      done,
      baseMessages: [],
      abort: vi.fn(),
      approve: vi.fn(),
      answer: vi.fn(),
    });
    const params = {
      runId: "shared-run",
      session,
      sessionMode: "continue",
      messages: [{ role: "user", content: "继续" }],
    };
    try {
      await expect(a.call("ai.run.start", params)).resolves.toEqual({ runId: params.runId });
      await expect(b.call("chat.delete", { session })).rejects.toThrow("正在回答");
      await expect(b.call("ai.run.state", { session })).resolves.toEqual({ running: true });
      await expect(a.call("ai.run.state", { session })).resolves.toMatchObject({
        runId: params.runId,
      });

      finish();
      await vi.waitFor(() =>
        expect(a.notes).toContainEqual(
          expect.objectContaining({
            method: "ai.run.event",
            data: expect.objectContaining({ event: expect.objectContaining({ type: "settled" }) }),
          })
        )
      );
      expect(b.notes.some(note => note.method === "ai.run.event")).toBe(false);
      const deleted = b.call("chat.delete", { session });
      const continued = b.call("ai.run.start", params);
      await expect(Promise.all([deleted, continued])).resolves.toEqual([
        { ok: true },
        { missingSession: true },
      ]);
      expect(env.startRun).toHaveBeenCalledTimes(1);
    } finally {
      finish();
      for (const client of [a, b]) client.ws.close();
      await Promise.all([a.closed, b.closed]);
    }
  });
});

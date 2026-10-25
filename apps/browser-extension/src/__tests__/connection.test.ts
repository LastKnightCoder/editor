import { describe, expect, it, vi } from "vitest";
import { deriveSas } from "@tau/shared/browser-companion";
import { CompanionConnection, type KeyValueStore } from "../background/connection";
import type { SocketLike } from "../background/rpc-socket";
import type { ConnectionStatus } from "../shared/messages";

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: Array<Record<string, any>> = [];
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(private readonly reply: (frame: Record<string, any>, socket: FakeSocket) => void) {
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.({});
    });
  }
  send(data: string) {
    const frame = JSON.parse(data);
    this.sent.push(frame);
    queueMicrotask(() => this.reply(frame, this));
  }
  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000, reason: "" });
  }
  respond(frame: Record<string, any>, result: unknown, error?: string) {
    this.onmessage?.({
      data: JSON.stringify({
        type: "JsonRpcResponse",
        id: frame.id,
        method: frame.method,
        result,
        error: error ? { code: -1, message: error } : null,
      }),
    });
  }
  notify(method: string, data?: unknown) {
    this.onmessage?.({ data: JSON.stringify({ type: "JsonRpcNotification", method, data }) });
  }
}

const memory = (
  initial: Record<string, unknown> = {}
): KeyValueStore & { data: Record<string, unknown> } => {
  const data = { ...initial };
  return {
    data,
    get: async <T>(key: string) => data[key] as T | undefined,
    set: async (key, value) => void (data[key] = value),
    remove: async key => void delete data[key],
  };
};

const READY = {
  scopes: ["chat", "annotations", "notes"],
  appVersion: "1",
  appearance: { theme: "paper", mode: "light" },
};

const setup = (
  storage: ReturnType<typeof memory>,
  reply: (frame: Record<string, any>, socket: FakeSocket) => void
) => {
  const statuses: ConnectionStatus[] = [];
  const sockets: FakeSocket[] = [];
  const onReady = vi.fn();
  const connection = new CompanionConnection({
    storage,
    createSocket: () => {
      const socket = new FakeSocket(reply);
      sockets.push(socket);
      return socket;
    },
    info: { browser: "Chrome", os: "macOS", version: "0.1.0" },
    onStatus: status => statuses.push(status),
    onNotification: () => {},
    onRequest: async () => null,
    onReady,
  });
  return { connection, statuses, sockets, onReady };
};

describe("CompanionConnection", () => {
  it("没有 token 时启动不连接；打开面板才发起配对并显示校验码", async () => {
    const storage = memory();
    let appNonce = "";
    const { connection, statuses, sockets } = setup(storage, (frame, socket) => {
      if (frame.method === "pair.request") {
        appNonce = "b".repeat(32);
        socket.respond(frame, { status: "pending", nonce: appNonce });
      }
    });
    await connection.start();
    expect(sockets).toHaveLength(0);
    expect(statuses.at(-1)?.state).toBe("unpaired");

    const status = await connection.connect();
    expect(status.state).toBe("pairing");
    const request = sockets[0].sent[0];
    expect(request.params.clientId).toMatch(/^[0-9a-f]{24}$/);
    expect(status.code).toBe(await deriveSas(request.params.nonce, appNonce));
  });

  it("Tau 允许后保存 token 并就绪；之后 hello 直连", async () => {
    const storage = memory();
    const { connection, sockets, onReady } = setup(storage, (frame, socket) => {
      if (frame.method === "pair.request") {
        socket.respond(frame, { status: "pending", nonce: "c".repeat(32) });
        setTimeout(() => {
          socket.notify("pair.granted", { token: "secret-token", scopes: READY.scopes });
          socket.notify("ready", READY);
        }, 0);
      }
    });
    await connection.connect();
    await vi.waitFor(() => expect(connection.current.state).toBe("ready"));
    expect(storage.data["companion.token"]).toBe("secret-token");
    expect(onReady).toHaveBeenCalled();
    sockets[0].close();
  });

  it("token 被拒（撤销）时删掉 token，回到需重新配对", async () => {
    const storage = memory({ "companion.token": "old", "companion.clientId": "a".repeat(24) });
    const { connection } = setup(storage, (frame, socket) => {
      if (frame.method === "hello") socket.respond(frame, null, "bad-token");
    });
    await connection.start();
    expect(connection.current.state).toBe("revoked");
    expect(storage.data["companion.token"]).toBeUndefined();
  });

  it("就绪后收到 revoked 通知也删 token", async () => {
    const storage = memory({ "companion.token": "t", "companion.clientId": "a".repeat(24) });
    const { connection, sockets } = setup(storage, (frame, socket) => {
      if (frame.method === "hello") socket.respond(frame, READY);
    });
    await connection.start();
    expect(connection.current.state).toBe("ready");
    sockets[0].notify("revoked");
    expect(connection.current.state).toBe("revoked");
    await vi.waitFor(() => expect(storage.data["companion.token"]).toBeUndefined());
  });

  it("Tau 关闭了新连接或被限流时给出对应状态", async () => {
    const closed = setup(memory(), (frame, socket) => socket.respond(frame, { status: "closed" }));
    expect((await closed.connection.connect()).state).toBe("closed");
    const throttled = setup(memory(), (frame, socket) =>
      socket.respond(frame, { status: "throttled", retryAt: 9 })
    );
    expect(await throttled.connection.connect()).toMatchObject({ state: "throttled", retryAt: 9 });
  });
});

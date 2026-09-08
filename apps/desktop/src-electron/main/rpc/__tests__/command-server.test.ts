import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";

const senderFromId = vi.hoisted(() => vi.fn());
const fallbackSenderProvider = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
  app: { isPackaged: false },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeListener: vi.fn(),
  },
  webContents: { fromId: (...args: unknown[]) => senderFromId(...args) },
  BrowserWindow: {
    fromId: vi.fn(() => null),
    getAllWindows: vi.fn(() => []),
  },
}));

// express.json 在真实实现中依赖请求流，测试中以直通中间件代替（仅验证链路顺序）
vi.mock("express", () => ({
  default: {
    json: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  },
}));

// installIpcRegistry 会覆写 ipcMain.handle，之后的注册即进入 registry
import { ipcMain, app } from "electron";
import { installIpcRegistry } from "../ipc-registry";
import { getRpcToken, registerCommandRoutes, setDefaultSenderProvider } from "../command-server";
import type { Application } from "express";

installIpcRegistry();
setDefaultSenderProvider(() => fallbackSenderProvider() as never);

type RouteHandler = (req: unknown, res: unknown, next: () => void) => void;
const routes = new Map<string, RouteHandler[]>();
const fakeApp = {
  post: (path: string, ...handlers: RouteHandler[]) => {
    routes.set(path, handlers);
  },
} as unknown as Application;

registerCommandRoutes(fakeApp);

/** 按注册顺序执行中间件链，直至某个中间件不再调用 next（发出响应） */
function runRoute(path: string, req: unknown) {
  const res = makeRes();
  const handlers = routes.get(path)!;
  let index = 0;
  const next = () => {
    index += 1;
    handlers[index]!(req, res, next);
  };
  handlers[0]!(req, res, next);
  return res;
}

const sender = { id: 7, getTitle: () => "main" };
function registerInvoke(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => unknown
) {
  ipcMain.handle(channel, handler as never);
}

function makeRes() {
  const res = {
    status: vi.fn((_code: number) => res),
    json: vi.fn((_body: unknown) => res),
    end: vi.fn(() => res),
  };
  return res;
}

function authedReq(body: unknown, authorized = true) {
  return {
    headers: authorized
      ? { authorization: `Bearer ${getRpcToken()}` }
      : { authorization: "Bearer wrong" },
    body,
  };
}

async function invoke(req: unknown) {
  const res = runRoute("/rpc/invoke", req);
  await vi.waitFor(() => expect(res.json.mock.calls.length).toBeGreaterThan(0));
  return { res, body: res.json.mock.calls[0]![0] as Record<string, any> };
}

const fallbackSender = { id: 1 };

beforeEach(() => {
  senderFromId.mockReset().mockReturnValue(null);
  // 默认提供兜底 sender，各用例可按需覆盖
  fallbackSenderProvider.mockReset().mockReturnValue(fallbackSender);
});

describe("command-server 鉴权", () => {
  it("打包模式下无/错 token 返回 401 UNAUTHORIZED", async () => {
    (app as { isPackaged: boolean }).isPackaged = true;
    try {
      const { res, body } = await invoke(authedReq({ channel: "x" }, false));
      expect(res.status).toHaveBeenCalledWith(401);
      expect(body.error.code).toBe("UNAUTHORIZED");
    } finally {
      (app as { isPackaged: boolean }).isPackaged = false;
    }
  });

  it("打包模式下正确 token 放行；dev 模式跳过校验", async () => {
    registerInvoke("auth-ok", () => "fine");

    (app as { isPackaged: boolean }).isPackaged = true;
    let result = await invoke(authedReq({ channel: "auth-ok" }));
    expect(result.body).toEqual({ ok: true, data: "fine" });
    (app as { isPackaged: boolean }).isPackaged = false;

    // dev：无 authorization 头也放行
    result = await invoke({ headers: {}, body: { channel: "auth-ok" } });
    expect(result.body.ok).toBe(true);
  });
});

describe("command-server /rpc/invoke 分发", () => {
  it("body 非法返回 400", async () => {
    const { res, body } = await invoke(authedReq({ foo: 1 }));
    expect(res.status).toHaveBeenCalledWith(400);
    expect(body.ok).toBe(false);
  });

  it("handler 未注册返回 200 + NO_HANDLER（客户端据此重试）", async () => {
    const { res, body } = await invoke(authedReq({ channel: "not-registered" }));
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(body.error.code).toBe("NO_HANDLER");
  });

  it("参数含非法信封时返回 500 错误体，而非挂起无响应", async () => {
    registerInvoke("fragile", () => "unreachable");

    const { res, body } = await invoke(
      authedReq({
        channel: "fragile",
        args: [{ $__t: "bigint", v: "not-a-number" }],
      })
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(body.ok).toBe(false);
    expect(body.error.channel).toBe("fragile");
  });

  it("handler 正常执行：参数反序列化、结果信封化、sender 按 windowId 解析", async () => {
    senderFromId.mockReturnValue(sender);
    registerInvoke("roundtrip", (event, arg) => {
      expect(event.sender).toBe(sender);
      return { at: arg.at, echoed: true };
    });

    const { body } = await invoke(
      authedReq({
        channel: "roundtrip",
        args: [{ at: { $__t: "date", v: "2026-01-01T00:00:00.000Z" } }],
        windowId: 7,
      })
    );

    expect(senderFromId).toHaveBeenCalledWith(7);
    expect(body.ok).toBe(true);
    // 入参信封已还原为 Date，返回的 Date 再次被编码为信封
    expect(body.data).toEqual({
      at: { $__t: "date", v: "2026-01-01T00:00:00.000Z" },
      echoed: true,
    });
  });

  it("windowId 未命中时回退 defaultSenderProvider", async () => {
    const fallback = { id: 1 };
    fallbackSenderProvider.mockReturnValue(fallback);
    let receivedSender: unknown;
    registerInvoke("fallback-sender", event => {
      receivedSender = event.sender;
      return null;
    });

    const { body } = await invoke(
      authedReq({ channel: "fallback-sender", args: [], windowId: 999 })
    );

    expect(body.ok).toBe(true);
    expect(receivedSender).toBe(fallback);
  });

  it("handler 抛错返回 500，错误体附带 channel 定位信息", async () => {
    registerInvoke("boom", () => {
      throw new Error("disk full");
    });

    const { res, body } = await invoke(authedReq({ channel: "boom", args: [] }));

    expect(res.status).toHaveBeenCalledWith(500);
    expect(body.error.message).toBe("disk full");
    expect(body.error.channel).toBe("boom");
  });
});

describe("command-server /rpc/send 分发", () => {
  it("已注册 on handler：同步分发并返回 202", async () => {
    const received: unknown[][] = [];
    ipcMain.on("notify", ((...args: unknown[]) => received.push(args)) as never);

    const res = runRoute("/rpc/send", authedReq({ channel: "notify", args: ["hello"] }));

    expect(received[0].slice(1)).toEqual(["hello"]);
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it("同 channel 多个 on listener 均被分发（与 ipcMain.on 语义对齐）", () => {
    const first: unknown[][] = [];
    const second: unknown[][] = [];
    ipcMain.on("multi", ((...args: unknown[]) => first.push(args)) as never);
    ipcMain.on("multi", ((...args: unknown[]) => second.push(args)) as never);

    const res = runRoute("/rpc/send", authedReq({ channel: "multi", args: ["x"] }));

    expect(first[0].slice(1)).toEqual(["x"]);
    expect(second[0].slice(1)).toEqual(["x"]);
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it("removeListener 移除的 listener 不再被 HTTP 分发", () => {
    const received: unknown[][] = [];
    const listener = (...args: unknown[]) => received.push(args);
    ipcMain.on("temp", listener as never);
    ipcMain.removeListener("temp", listener as never);

    const res = runRoute("/rpc/send", authedReq({ channel: "temp", args: [] }));

    expect(received).toHaveLength(0);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("未注册 on handler 返回 404", async () => {
    const res = runRoute("/rpc/send", authedReq({ channel: "nobody-listens", args: [] }));

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

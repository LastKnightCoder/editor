import { describe, expect, it, vi } from "vitest";
import { CompanionHub, type PortLike } from "../background/hub";
import type { BackgroundToContent, ContentToBackground } from "../shared/messages";

const port = () => {
  const received: BackgroundToContent[] = [];
  let listener: (message: ContentToBackground) => void = () => {};
  const value: PortLike & {
    received: BackgroundToContent[];
    send(message: ContentToBackground): void;
  } = {
    received,
    postMessage: message => received.push(message),
    onMessage: { addListener: fn => (listener = fn) },
    onDisconnect: { addListener: () => {} },
    send: message => listener(message),
  };
  return value;
};

const setup = () => {
  const hub = new CompanionHub();
  const connection = {
    current: { state: "ready" as const },
    connect: vi.fn(),
    request: vi.fn(async () => ({ runId: "r1" })),
  };
  hub.bind(connection as never, { load: vi.fn(), save: vi.fn() } as never);
  return { hub, connection };
};

describe("CompanionHub", () => {
  it("对话事件只回给发起那一轮的标签页", async () => {
    const { hub } = setup();
    const a = port();
    const b = port();
    hub.attach(a, 1);
    hub.attach(b, 2);
    a.send({
      kind: "call",
      id: 1,
      method: "rpc",
      params: { method: "ai.run.start", params: { runId: "r1" } },
    });
    await vi.waitFor(() =>
      expect(a.received.some(message => message.kind === "result")).toBe(true)
    );
    hub.onNotification("ai.run.event", {
      runId: "r1",
      seq: 0,
      event: { type: "text", turnId: "t", fullText: "x" },
    });
    expect(a.received.filter(message => message.kind === "notify")).toHaveLength(1);
    expect(b.received.filter(message => message.kind === "notify")).toHaveLength(0);
  });

  it("不透传握手类方法", async () => {
    const { hub, connection } = setup();
    const a = port();
    hub.attach(a, 1);
    a.send({ kind: "call", id: 7, method: "rpc", params: { method: "pair.request" } });
    await vi.waitFor(() =>
      expect(a.received.at(-1)).toMatchObject({ kind: "result", id: 7, error: expect.any(String) })
    );
    expect(connection.request).not.toHaveBeenCalled();
  });

  it("页面工具按 URL 找到对应标签页执行；页面已关时报错", async () => {
    const { hub } = setup();
    const a = port();
    hub.attach(a, 1);
    a.send({ kind: "page", url: "https://a.com/x#h" });
    const pending = hub.onRequest("page.tool", {
      pageUrl: "https://a.com/x",
      name: "read_page",
      args: { from: 1 },
    });
    const call = a.received.find(message => message.kind === "pageTool") as Extract<
      BackgroundToContent,
      { kind: "pageTool" }
    >;
    expect(call).toMatchObject({ name: "read_page", args: { from: 1 } });
    a.send({ kind: "pageToolResult", id: call.id, content: "[1] 正文" });
    expect(await pending).toEqual({ content: "[1] 正文" });
    await expect(
      hub.onRequest("page.tool", { pageUrl: "https://b.com", name: "read_page", args: {} })
    ).rejects.toThrow("关闭");
  });
});

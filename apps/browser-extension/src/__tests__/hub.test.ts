import { describe, expect, it, vi } from "vitest";
import { CompanionHub, type PortLike } from "../background/hub";
import { LibraryTab, type TabsLike } from "../background/library-tab";
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
  const annotations = { load: vi.fn(async () => []), save: vi.fn() };
  const library = { open: vi.fn(async () => {}) };
  hub.bind(connection as never, annotations as never, library);
  return { hub, connection, annotations, library };
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

  it("扩展页面只能调各自白名单里的方法；伴读库读标注走本机缓存", async () => {
    const { hub, connection, annotations } = setup();
    await hub.handleExtensionPage("library", "library.pages", { offset: 0 });
    expect(connection.request).toHaveBeenLastCalledWith("library.pages", { offset: 0 }, 60_000);
    await hub.handleExtensionPage("library", "annotations.load", {
      url: "https://a.com/",
    });
    expect(annotations.load).toHaveBeenCalledWith("https://a.com/");
    await expect(hub.handleExtensionPage("library", "note.save", {})).rejects.toThrow("不支持");
    await expect(hub.handleExtensionPage("note", "library.rename", {})).rejects.toThrow("不支持");
    await expect(hub.handleExtensionPage("library", "ai.run.start", {})).rejects.toThrow("不支持");
  });

  it("面板请求打开伴读库并带上本页", async () => {
    const { hub, library } = setup();
    const a = port();
    hub.attach(a, 1);
    a.send({
      kind: "call",
      id: 7,
      method: "library.open",
      params: { page: "https://a.com/x" },
    });
    await vi.waitFor(() => expect(library.open).toHaveBeenCalledWith("https://a.com/x"));
  });
});

describe("LibraryTab", () => {
  const tabs = () => {
    const value = {
      create: vi.fn(async () => ({ id: 9 })),
      update: vi.fn(async (): Promise<{ windowId?: number } | undefined> => ({
        windowId: 2,
      })),
      focusWindow: vi.fn(async () => {}),
    } satisfies TabsLike;
    return value;
  };

  it("首次新开；再次打开切过去，带页面键时跳到该页", async () => {
    const api = tabs();
    const library = new LibraryTab(api, "chrome-extension://x/library.html");
    await library.open("https://a.com/x?q=1");
    expect(api.create).toHaveBeenCalledWith({
      url: "chrome-extension://x/library.html?page=https%3A%2F%2Fa.com%2Fx%3Fq%3D1",
    });
    await library.open();
    expect(api.update).toHaveBeenLastCalledWith(9, { active: true });
    expect(api.focusWindow).toHaveBeenCalledWith(2);
    await library.open("https://b.com/");
    expect(api.update).toHaveBeenLastCalledWith(9, {
      url: "chrome-extension://x/library.html?page=https%3A%2F%2Fb.com%2F",
      active: true,
    });
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  it("记住的标签页已关闭时新开一个", async () => {
    const api = tabs();
    api.update.mockRejectedValue(new Error("No tab with id"));
    const library = new LibraryTab(api, "chrome-extension://x/library.html");
    await library.open();
    await library.open();
    expect(api.create).toHaveBeenCalledTimes(2);
  });
});

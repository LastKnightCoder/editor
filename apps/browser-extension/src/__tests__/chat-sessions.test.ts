import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMPANION_METHODS as methods } from "@tau/shared/browser-companion";
import { PageChat } from "../content/state/chat";
import { getState, patchChat, setState } from "../content/state/store";

const pageA = "https://example.com/a";
const pageB = "https://example.com/b";
const history = (sessionId: string) => ({
  sessionId,
  messages: [{ role: "user", content: sessionId }],
});
const deferred = () => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>(done => (resolve = done));
  return { promise, resolve };
};

const setup = () => {
  const rpc = vi.fn(async (method: string, params?: unknown): Promise<unknown> => {
    if (method === methods.runState) return { running: false };
    if (method === methods.chatHistory) return history("latest");
    if (method === methods.chatSession)
      return history((params as { session: { id: string } }).session.id);
    return [];
  });
  const chat = new PageChat({ rpc, changeChatSelection: vi.fn() } as never);
  chat.setPage(pageA);
  return { chat, rpc };
};

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: storage.get(key) }),
        set: async (values: Record<string, string>) => {
          for (const [key, value] of Object.entries(values)) storage.set(key, value);
        },
        remove: async (key: string) => {
          storage.delete(key);
        },
      },
    },
  });
  setState({ status: { state: "ready" } });
});
afterEach(() => vi.unstubAllGlobals());

describe("扩展会话管理", () => {
  it("SPA 往返后丢弃旧页面代次的会话和列表", async () => {
    const { chat, rpc } = setup();
    const pendingHistory = deferred();
    const pendingList = deferred();
    rpc.mockImplementationOnce(() => pendingHistory.promise);
    rpc.mockImplementationOnce(() => pendingList.promise);
    const switching = chat.switchSession("old");
    const listing = chat.listSessions();
    chat.setPage(pageB);
    chat.setPage(pageA);
    const currentId = getState().chat.sessionId;

    pendingHistory.resolve(history("old"));
    pendingList.resolve([{ id: "old" }]);
    await Promise.all([switching, listing]);
    expect(getState().chat).toMatchObject({ sessionId: currentId, messages: [], sessions: [] });
    expect(storage.size).toBe(0);
  });

  it("新建会话后丢弃旧选择的运行快照", async () => {
    const { chat, rpc } = setup();
    await chat.load();
    const pending = deferred();
    rpc.mockImplementationOnce(async () => history("older"));
    rpc.mockImplementationOnce(() => pending.promise);
    const switching = chat.switchSession("older");
    await vi.waitFor(() =>
      expect(rpc).toHaveBeenLastCalledWith(methods.runState, {
        session: { id: "older", pageUrl: pageA },
      })
    );
    chat.newSession();
    const currentId = getState().chat.sessionId;
    pending.resolve({ running: true, runId: "stale", snapshot: { runId: "stale" } });
    await switching;
    expect(getState().chat).toMatchObject({ sessionId: currentId, runId: null, messages: [] });
    expect(storage.size).toBe(0);
  });

  it("首轮落盘后记住新会话，刷新时优先于其他历史", async () => {
    const { chat, rpc } = setup();
    await chat.load();
    chat.newSession();
    patchChat({ usePage: false });
    const { sessionId } = getState().chat;
    rpc.mockResolvedValueOnce({ runId: "accepted" });
    const runId = await chat.ask("第一问");
    if (!runId) throw new Error("首轮未被受理");
    expect(rpc).toHaveBeenLastCalledWith(
      methods.runStart,
      expect.objectContaining({ sessionMode: "create" })
    );
    expect(storage.size).toBe(0);
    chat.onEvent({
      runId,
      seq: 0,
      sessionSaved: true,
      event: { type: "settled", ok: true, aborted: false, lastText: "" },
    });
    expect(storage.get(`chat-session:${pageA}`)).toBe(sessionId);

    const reopened = setup().chat;
    await reopened.load();
    expect(getState().chat).toMatchObject({ sessionId, sessionSaved: true });
  });

  it("续聊目标已被其他标签页删除时清空旧状态", async () => {
    const { chat, rpc } = setup();
    await chat.load();
    patchChat({
      usePage: false,
      sessions: [{ id: "latest", title: "旧对话", createTime: 1, updateTime: 1, messageCount: 1 }],
    });
    rpc.mockResolvedValueOnce({ missingSession: true });
    expect(await chat.ask("继续问")).toBeNull();
    expect(rpc).toHaveBeenLastCalledWith(
      methods.runStart,
      expect.objectContaining({
        sessionMode: "continue",
        session: { id: "latest", pageUrl: pageA },
      })
    );
    expect(getState().chat).toMatchObject({
      sessionSaved: false,
      runId: null,
      messages: [],
      sessions: [],
      error: expect.stringContaining("已删除"),
    });
    expect(getState().chat.sessionId).not.toBe("latest");
  });
});

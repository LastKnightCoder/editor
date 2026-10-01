import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Flashcard, FlashcardDeck } from "@/types";

vi.mock("@/stores/useSettingStore", async () => {
  const { create } = await import("zustand");
  return { default: create(() => ({ setting: { database: { active: "a" } } })) };
});
vi.mock("@/hooks/useDatabaseConnected", () => ({ default: () => true }));

const invoke = vi.fn();
const listeners = new Map<string, (...args: unknown[]) => void>();
let api: typeof import("../queries");
let settings: typeof import("@/stores/useSettingStore").default;
let sharedClient: QueryClient;
let client: QueryClient;
let root: Root | undefined;
let host: HTMLDivElement;
let mutations: ReturnType<typeof import("../queries").useFlashcardMutations>;
let snapshot: ReturnType<typeof import("../queries").useFlashcardSnapshot>;

const deck = (name: string): FlashcardDeck => ({
  id: 1,
  name,
  description: "",
  coverColor: "",
  emoji: "brain",
  sortOrder: 0,
  meta: null,
  createTime: 0,
  updateTime: 0,
});
const card = (tag: string): Flashcard => ({
  id: 1,
  deckId: 1,
  type: "qa",
  prompt: [],
  detail: [],
  data: {},
  tags: [tag],
  difficulty: "standard",
  reviewLevel: 0,
  dueTime: 0,
  lastReviewTime: null,
  reviewCount: 0,
  easeFactor: 2.5,
  status: "new",
  references: [],
  createTime: 0,
  updateTime: 0,
});
const switchDatabase = (active: string) =>
  settings.setState(state => ({
    setting: { ...state.setting, database: { ...state.setting.database, active } },
  }));

beforeAll(async () => {
  window.electron = {
    platform: "darwin",
    invoke,
    on: (channel: string, handler: (...args: unknown[]) => void) => listeners.set(channel, handler),
  } as unknown as ElectronAPI;
  api = await import("../queries");
  settings = (await import("@/stores/useSettingStore")).default;
  sharedClient = (await import("@/queryClient")).queryClient;
});
beforeEach(() => {
  switchDatabase("a");
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  invoke.mockReset();
  invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
    const scope = args.at(-1) as { toolDatabaseName?: string };
    if (!scope.toolDatabaseName) throw new Error("未指定数据库");
    if (channel === "flashcard:list-decks") return [deck(scope.toolDatabaseName)];
    if (channel === "flashcard:list-cards") return [];
    return card(scope.toolDatabaseName);
  });
});
afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  host?.remove();
  client.clear();
  sharedClient.clear();
  vi.restoreAllMocks();
});

async function mount(component: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root?.render(<QueryClientProvider client={client}>{component}</QueryClientProvider>)
  );
}
async function waitFor(check: () => void) {
  await act(async () => {
    await vi.waitFor(check);
  });
}
function DecksProbe() {
  const { decks } = api.useFlashcardDecks();
  return <output>{decks.map(item => item.name).join(",")}</output>;
}
function MutationProbe() {
  mutations = api.useFlashcardMutations();
  return null;
}
function SnapshotProbe() {
  snapshot = api.useFlashcardSnapshot();
  return <output>{snapshot.error?.message ?? snapshot.snapshot?.decks[0]?.name}</output>;
}

describe("闪卡数据库隔离", () => {
  it("加载失败保留错误并记录所属库，重试成功后恢复快照", async () => {
    const failure = new Error("闪卡读取失败");
    const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    invoke.mockRejectedValueOnce(failure);
    await mount(<SnapshotProbe />);
    await waitFor(() => expect(host.textContent).toBe(failure.message));
    expect(snapshot.error).toBe(failure);
    expect(snapshot.snapshot).toBeUndefined();
    expect(logError).toHaveBeenCalledWith("[flashcards] 加载失败", { database: "a" }, failure);

    await act(async () => {
      await snapshot.retry();
    });
    await waitFor(() => expect(host.textContent).toBe("a"));
    expect(snapshot.error).toBeNull();
    expect(invoke).toHaveBeenCalledWith("flashcard:list-cards", {}, { toolDatabaseName: "a" });
  });

  it("选择卡组只读轻表，切库期间不展示旧库列表", async () => {
    await mount(<DecksProbe />);
    await waitFor(() => expect(host.textContent).toBe("a"));
    expect(invoke.mock.calls.some(call => call[0] === "flashcard:list-cards")).toBe(false);
    expect(invoke).toHaveBeenCalledWith("flashcard:list-decks", { toolDatabaseName: "a" });
    let finish!: (rows: FlashcardDeck[]) => void;
    invoke.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    await act(async () => switchDatabase("b"));
    expect(host.textContent).toBe("");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("flashcard:list-decks", { toolDatabaseName: "b" })
    );
    await act(async () => finish([deck("b")]));
    await waitFor(() => expect(host.textContent).toBe("b"));
    expect(client.getQueryData(api.flashcardKeys.decks("a"))).toEqual([deck("a")]);
  });

  it("在途写入只回写原库缓存，旧闭包切库后不能再次写入", async () => {
    await mount(<MutationProbe />);
    client.setQueryData(api.flashcardKeys.snapshot("a"), { decks: [], cards: [card("a")] });
    client.setQueryData(api.flashcardKeys.snapshot("b"), { decks: [], cards: [card("b")] });
    const previous = mutations;
    let finish!: (value: Flashcard) => void;
    invoke.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const update = previous.updateCard({ id: 1, tags: ["a-updated"] });
    expect(invoke).toHaveBeenCalledWith(
      "flashcard:update-card",
      { id: 1, tags: ["a-updated"] },
      { toolDatabaseName: "a" }
    );
    await act(async () => switchDatabase("b"));
    await act(async () => {
      finish(card("a-updated"));
      await update;
    });
    expect(client.getQueryData(api.flashcardKeys.snapshot("a"))).toMatchObject({
      cards: [{ tags: ["a-updated"] }],
    });
    expect(client.getQueryData(api.flashcardKeys.snapshot("b"))).toMatchObject({
      cards: [{ tags: ["b"] }],
    });
    const calls = invoke.mock.calls.length;
    await expect(
      previous.createCard({ deckId: 1, type: "qa", prompt: [], data: {} })
    ).rejects.toThrow("数据库已切换");
    expect(invoke).toHaveBeenCalledTimes(calls);
  });

  it("已删除对象的更新失败，不发布成功缓存", async () => {
    await mount(<MutationProbe />);
    client.setQueryData(api.flashcardKeys.snapshot("a"), { decks: [], cards: [card("a")] });
    invoke.mockResolvedValueOnce(null);
    await expect(mutations.updateCard({ id: 1 })).rejects.toThrow("闪卡已不存在");
    expect(client.getQueryData(api.flashcardKeys.snapshot("a"))).toMatchObject({
      cards: [{ tags: ["a"] }],
    });
    invoke.mockResolvedValueOnce(null);
    await expect(mutations.updateDeck({ id: 1, name: "已删除" })).rejects.toThrow("卡组已不存在");
  });

  it("原库通知只失效原库查询，不污染当前库", () => {
    switchDatabase("b");
    sharedClient.setQueryData(api.flashcardKeys.decks("a"), [deck("a")]);
    sharedClient.setQueryData(api.flashcardKeys.decks("b"), [deck("b")]);
    const handler = listeners.get("flashcards:changed");
    if (!handler) throw new Error("通知未注册");
    handler(null, { databaseName: "a.db" });
    expect(sharedClient.getQueryState(api.flashcardKeys.decks("a"))?.isInvalidated).toBe(true);
    expect(sharedClient.getQueryState(api.flashcardKeys.decks("b"))?.isInvalidated).toBe(false);
  });
});

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ICard } from "@/types/card";
import useSettingStore from "@/stores/useSettingStore";
import useGlobalStateStore from "@/stores/useGlobalStateStore";
import { defaultCardEventBus } from "@/utils/event-bus/card-event-bus";
import { defaultContentEventBus } from "@/utils/event-bus/content-event-bus";
import { getScopedCard, getScopedCards, patchScopedCard } from "@/commands/card";
import {
  bucketByTimeGroups,
  buildTagTree,
  cardsKey,
  cardDetailKey,
  filterCards,
  sortCards,
  useCardDetail,
  useCardsFeed,
  useCardsMutations,
} from "../queries";

vi.mock("@/commands/card", () => ({
  getScopedCards: vi.fn(),
  getScopedCard: vi.fn(),
  patchScopedCard: vi.fn(),
  createScopedCard: vi.fn(),
  deleteScopedCard: vi.fn(),
}));
vi.mock("@tau/ui", async () => {
  const actual = await vi.importActual<typeof import("@tau/ui")>("@tau/ui");
  return { ...actual, toast: { error: vi.fn() } };
});
vi.mock("@/stores/useSettingStore", async () => {
  const { create } = await import("zustand");
  return { default: create(() => ({ setting: { database: { active: "a" } } })) };
});

const card = (id: number, patch: Partial<ICard> = {}): ICard => ({
  id,
  contentId: id,
  content: [],
  count: 0,
  create_time: 0,
  update_time: 0,
  tags: [],
  links: [],
  isTop: false,
  ...patch,
});
let root: Root | undefined;
let host: HTMLDivElement;
let client: QueryClient;
let feed: ReturnType<typeof useCardsFeed>;
let mutations: ReturnType<typeof useCardsMutations>;
let detail: ReturnType<typeof useCardDetail>;
let detailId: number | null;
const switchDatabase = (active: string) =>
  useSettingStore.setState(state => ({
    setting: { ...state.setting, database: { ...state.setting.database, active } },
  }));
function Probe() {
  feed = useCardsFeed();
  mutations = useCardsMutations();
  detail = useCardDetail(detailId);
  return <span>{feed.cards.map(card => card.id).join(",")}</span>;
}
async function mount() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>
    );
  });
}
async function waitFor(check: () => void) {
  await act(async () => {
    await vi.waitFor(check);
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  detailId = null;
  switchDatabase("a");
  useGlobalStateStore.setState({ databaseStatus: { a: "ready", b: "ready" } });
  vi.mocked(getScopedCards).mockResolvedValue([card(1)]);
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host?.remove();
  client?.clear();
  vi.useRealTimers();
});

describe("卡片派生", () => {
  it("标签前缀过滤后按置顶优先、创建时间降序排列", () => {
    const cards = [
      card(1, { isTop: true, create_time: 100, tags: ["读书"] }),
      card(2, { create_time: 90, tags: ["读书/历史"] }),
      card(3, { create_time: 80, tags: ["读书/历史"] }),
      card(4, { create_time: 70, tags: ["写作"] }),
    ];
    expect(filterCards(cards, { tag: "读书" }).map(card => card.id)).toEqual([1, 2, 3]);
  });
  it("按本地自然日、周、月分组，昨天白天不进入今天", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 20, 15));
    const dates = [
      [20, 0],
      [19, 12],
      [18, 12],
      [1, 12],
    ];
    const cards = dates.map(([day, hour], index) =>
      card(index, { create_time: new Date(2026, 8, day, hour).getTime() })
    );
    cards.push(card(4, { create_time: new Date(2026, 7, 31, 23).getTime() }));
    expect(
      bucketByTimeGroups(cards).map(group => [group.key, group.cards.map(card => card.id)])
    ).toEqual([
      ["today", [0]],
      ["yesterday", [1]],
      ["week", [2]],
      ["month", [3]],
      ["earlier", [4]],
    ]);
  });
  it("跨月的周一仍将周日归为昨天", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 1, 15));
    expect(
      bucketByTimeGroups([card(1, { create_time: new Date(2026, 4, 31, 12).getTime() })])[0].key
    ).toBe("yesterday");
  });
  it("同一卡片多个子标签或父子标签只给祖先计数一次", () => {
    const cards = [
      card(1, { tags: ["读书", "读书/历史", "读书/文学"] }),
      card(2, { tags: ["读书/历史"] }),
    ];
    const tree = buildTagTree(cards);
    expect(tree[0].count).toBe(2);
    expect(tree[0].children.map(node => node.count)).toEqual([2, 1]);
    expect(filterCards(cards, { tag: "读书" })).toHaveLength(2);
  });
  it("筛选结果不改变关联解析使用的排序全集", () => {
    const cards = [card(1, { links: [2] }), card(2)];
    const all = sortCards(cards);
    expect(filterCards(cards, { tag: "" })).toHaveLength(2);
    expect(all.find(card => card.id === all[0].links[0])?.id).toBe(2);
  });
});

describe("卡片查询与写入", () => {
  it("正文事件更新同内容卡片及详情缓存，保留元数据且不重拉列表", async () => {
    const first = card(1, { tags: ["标签"], isTop: true, update_time: 30 });
    const shared = card(2, { contentId: 1 });
    const unrelated = card(3);
    vi.mocked(getScopedCards).mockResolvedValue([first, shared, unrelated]);
    await mount();
    await waitFor(() => expect(feed.cards).toHaveLength(3));
    client.setQueryData(cardDetailKey("a", 1), first);
    client.setQueryData(cardsKey("b"), [first]);
    const content = [{ type: "paragraph", children: [{ text: "更新的正文" }] }] as ICard["content"];
    await act(async () => {
      defaultContentEventBus.createEditor().publishContentEvent("content:updated", {
        id: 1,
        content,
        count: 5,
        createTime: 0,
        updateTime: 20,
        refCount: 2,
      });
    });
    await waitFor(() => expect(feed.cards[0].content).toEqual(content));
    expect(feed.cards[0]).toMatchObject({ tags: ["标签"], isTop: true, count: 5, update_time: 30 });
    expect(feed.cards[1].content).toEqual(content);
    expect(feed.cards[2]).toEqual(unrelated);
    expect(client.getQueryData<ICard>(cardDetailKey("a", 1))?.content).toEqual(content);
    expect(client.getQueryData<ICard[]>(cardsKey("b"))?.[0].content).toEqual([]);
    expect(getScopedCards).toHaveBeenCalledTimes(1);
    expect(getScopedCard).not.toHaveBeenCalled();
  });
  it("切库立即隔离旧数据，未就绪时不查询", async () => {
    await mount();
    await waitFor(() => expect(feed.cards).toHaveLength(1));
    await act(async () => {
      useGlobalStateStore.setState({ databaseStatus: { a: "ready", b: "connecting" } });
      switchDatabase("b");
    });
    expect(feed.cards).toEqual([]);
    expect(getScopedCards).not.toHaveBeenCalledWith("b");
    vi.mocked(getScopedCards).mockResolvedValue([card(2)]);
    await act(async () =>
      useGlobalStateStore.setState({ databaseStatus: { a: "ready", b: "ready" } })
    );
    await waitFor(() => expect(feed.cards[0]?.id).toBe(2));
    expect(client.getQueryData<ICard[]>(cardsKey("a"))?.[0].id).toBe(1);
  });
  it.each(["card:created", "card:updated", "card:deleted"])(
    "%s 按 id 单卡并入缓存，不触发整域重拉",
    async event => {
      await mount();
      await waitFor(() => expect(feed.cards).toHaveLength(1));
      const callsBefore = vi.mocked(getScopedCards).mock.calls.length;
      await act(async () => {
        defaultCardEventBus.createEditor().publishCardEvent(event, card(1, { isTop: true }));
        if (event !== "card:deleted") {
          defaultCardEventBus.createEditor().publishCardEvent(event, card(2));
        }
      });
      if (event === "card:deleted") {
        await waitFor(() => expect(feed.cards).toHaveLength(0));
      } else {
        await waitFor(() => expect(feed.cards.map(item => item.id).sort()).toEqual([1, 2]));
        expect(feed.cards.find(item => item.id === 1)?.isTop).toBe(true);
      }
      expect(vi.mocked(getScopedCards).mock.calls.length).toBe(callsBefore);
    }
  );
  it("单卡详情按需拉取全文", async () => {
    detailId = 1;
    const blocks = [{ type: "p", children: [{ text: "全文块" }] }] as unknown as ICard["content"];
    vi.mocked(getScopedCard).mockResolvedValue(card(1, { content: blocks }));
    await mount();
    await waitFor(() => expect(detail.data?.content).toEqual(blocks));
    expect(getScopedCard).toHaveBeenCalledWith("a", 1);
  });
  it("置顶补丁只发送 isTop 字段，并同步确认快照", async () => {
    await mount();
    await waitFor(() => expect(feed.cards).toHaveLength(1));
    const updated = card(1, { isTop: true });
    vi.mocked(patchScopedCard).mockResolvedValue(updated);
    vi.mocked(getScopedCards).mockResolvedValue([updated]);
    await act(async () => {
      await mutations.toggleTop.mutateAsync({ card: card(1), isTop: true });
    });
    expect(patchScopedCard).toHaveBeenCalledWith("a", 1, { isTop: true });
    await waitFor(() => expect(feed.cards[0]).toMatchObject({ isTop: true }));
  });
});

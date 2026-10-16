import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WalkDailyDeck, WalkItem } from "@/types";

const mocks = vi.hoisted(() => ({
  dailyDeck: vi.fn(async () => null as WalkDailyDeck | null),
  advance: vi.fn(async () => undefined),
  markSeen: vi.fn(async () => undefined),
  mute: vi.fn(async () => undefined),
  reroll: vi.fn(async () => null as WalkDailyDeck | null),
  push: vi.fn(),
  openWalkItem: vi.fn(),
}));

vi.mock("@/commands/random-walk", () => ({
  getRandomWalkDailyDeck: mocks.dailyDeck,
  advanceRandomWalkDailyDeck: mocks.advance,
  markRandomWalkSeen: mocks.markSeen,
  muteRandomWalk: mocks.mute,
  rerollRandomWalkDailyDeck: mocks.reroll,
}));
vi.mock("@/page/PageProvider", () => ({
  usePage: () => ({ navigator: { push: mocks.push } }),
}));
vi.mock("@/features/walk/open", () => ({ openWalkItem: mocks.openWalkItem }));
vi.mock("@/features/cards/components/CardContentPreview", () => ({
  CardContentPreview: () => <div>正文预览</div>,
}));

import { WalkDeckPanel } from "../views/WalkDeckPanel";

const item = (id: number, title: string): WalkItem => ({
  ref: { kind: "card", id },
  title,
  contentId: id,
  content: [{ type: "p", children: [{ text: "正文" }] }],
  excerpt: null,
  note: null,
  source: null,
  tags: [],
  createTime: 1_700_000_000_000,
  updateTime: 1_700_000_000_000,
  lastSeenTime: null,
  reason: { type: "stale", days: 40 },
});

const ITEMS = [1, 2, 3, 4, 5].map(id => item(id, `旧卡 ${id}`));
const deck = (cursor: number): WalkDailyDeck => ({ date: "today", items: ITEMS, cursor });

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

const render = () =>
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <WalkDeckPanel />
      </QueryClientProvider>
    );
  });
const settle = async () => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
};
const waitFor = async (predicate: () => boolean, timeoutMs = 2000) => {
  const start = Date.now();
  while (!predicate() && Date.now() - start < timeoutMs) await settle();
  expect(predicate()).toBe(true);
};
const click = (el: Element | null | undefined) =>
  act(() => {
    (el as HTMLElement).click();
  });
const findButton = (text: string) =>
  [...document.querySelectorAll("button")].find(b => b.textContent?.includes(text));

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
  // jsdom 无 matchMedia：stub 为 reduce，跳过翻牌动画直接推进
  vi.stubGlobal(
    "matchMedia",
    vi
      .fn()
      .mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

describe("WalkDeckPanel", () => {
  it("渲染当前牌标题、进度 1 / 5 与右列清单，当前牌记 seen", async () => {
    mocks.dailyDeck.mockResolvedValue(deck(0));
    render();
    await waitFor(() => (document.body.textContent ?? "").includes("今日漫步"));
    const text = document.body.textContent ?? "";
    expect(text).toContain("旧卡 1");
    expect(text).toContain("1 / 5");
    expect(text).toContain("今天的 5 张");
    expect(mocks.markSeen).toHaveBeenCalledWith(ITEMS[0].ref);
    expect(mocks.markSeen).toHaveBeenCalledTimes(1);
  });

  it("点下一张：daily-advance 落库、进度变 2 / 5、新当前牌记 seen", async () => {
    mocks.dailyDeck.mockResolvedValue(deck(0));
    render();
    await waitFor(() => (document.body.textContent ?? "").includes("旧卡 1"));

    await click(findButton("下一张"));
    await waitFor(() => (document.body.textContent ?? "").includes("2 / 5"));
    expect(mocks.advance).toHaveBeenCalledWith({ date: expect.any(String), cursor: 1 });
    expect(mocks.markSeen).toHaveBeenLastCalledWith(ITEMS[1].ref);
    expect(document.body.textContent ?? "").toContain("旧卡 2");
  });

  it("池为空时整块（含小节标题）不渲染", async () => {
    mocks.dailyDeck.mockResolvedValue({ date: "today", items: [], cursor: 0 });
    render();
    await settle();
    await settle();
    expect(document.body.textContent ?? "").not.toContain("今日漫步");
    expect(document.body.textContent ?? "").not.toContain("重温");
  });

  it("完成态显示再抽 5 张并隐藏动作条；重抽后回到 1 / 5", async () => {
    mocks.dailyDeck.mockResolvedValue(deck(5));
    render();
    await waitFor(() => (document.body.textContent ?? "").includes("已走完"));
    const text = document.body.textContent ?? "";
    expect(text).toContain("今天的 5 张走完了");
    expect(text).toContain("再抽 5 张");
    expect(findButton("下一张")).toBeUndefined();

    mocks.reroll.mockResolvedValue(deck(0));
    await click(findButton("再抽 5 张"));
    await waitFor(() => (document.body.textContent ?? "").includes("1 / 5"));
    expect(mocks.reroll).toHaveBeenCalledWith({ date: expect.any(String) });
  });
});

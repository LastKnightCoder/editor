import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WalkItem, WalkNeighbor } from "@/types";

const mocks = vi.hoisted(() => ({
  pick: vi.fn(async () => null as WalkItem | null),
  get: vi.fn(async () => null as WalkItem | null),
  sameTag: vi.fn(async () => [] as WalkNeighbor[]),
  markSeen: vi.fn(async () => undefined),
  mute: vi.fn(async () => undefined),
  entityContext: vi.fn(async () => null),
  entityRelated: vi.fn(async () => []),
  openAiFlashcard: vi.fn(),
}));

vi.mock("@/commands/random-walk", () => ({
  pickRandomWalk: mocks.pick,
  getRandomWalkItem: mocks.get,
  getRandomWalkSameTag: mocks.sameTag,
  markRandomWalkSeen: mocks.markSeen,
  muteRandomWalk: mocks.mute,
}));
vi.mock("@/commands/entity-context", () => ({
  getEntityContext: mocks.entityContext,
  getEntityRelated: mocks.entityRelated,
}));
vi.mock("@/page/PageProvider", () => ({
  usePage: () => ({ navigator: { current: () => ({ key: "walk" }) } }),
  usePageParams: () => ({ from: undefined }),
}));
vi.mock("@/features/flashcards/hooks/useFlashcardCreation", () => ({
  default: () => ({
    deckSelectorOpen: false,
    deckSelectorMode: "ai",
    selectedDeck: null,
    flashcardEditorOpen: false,
    aiGenerationModalOpen: false,
    editingGeneratedCard: null,
    generatedCardEditModalOpen: false,
    generatedCards: [],
    isGenerating: false,
    isGenerationPending: false,
    generationError: null,
    getReference: vi.fn(),
    openAiFlashcard: mocks.openAiFlashcard,
    openManualFlashcard: vi.fn(),
    handleDeckSelect: vi.fn(),
    handleConfirmAiGeneration: vi.fn(),
    handleCancelAiGeneration: vi.fn(),
    handleEditGeneratedCard: vi.fn(),
    handleSaveGeneratedCard: vi.fn(),
    toggleCardSelection: vi.fn(),
    selectAll: vi.fn(),
    deselectAll: vi.fn(),
    closeFlashcardEditor: vi.fn(),
    closeDeckSelector: vi.fn(),
    closeGeneratedCardEditModal: vi.fn(),
    changeDeck: vi.fn(),
  }),
}));
vi.mock("@/features/flashcards/components/DeckSelectorDialog", () => ({ default: () => null }));
vi.mock("@/features/flashcards/components/FlashcardGenerationDialog", () => ({
  default: () => null,
}));
vi.mock("@/features/flashcards/components/GeneratedFlashcardEditDialog", () => ({
  default: () => null,
}));
vi.mock("@/features/flashcards/components/CreateFlashcardDialog", () => ({ default: () => null }));
vi.mock("@/features/cards/components/CardContentPreview", () => ({
  CardContentPreview: () => <div>正文预览</div>,
}));
vi.mock("@/services/open-content", () => ({ openEntity: vi.fn() }));
vi.mock("@/services/open-material", () => ({ openMaterial: vi.fn() }));
vi.mock("@tau/themes/react", () => ({
  useThemeStore: (selector: (mode: string) => unknown) => selector("light"),
}));

import { WalkView } from "../views/WalkView";

const item = (id: number, title: string, tags: string[] = []): WalkItem => ({
  ref: { kind: "card", id },
  title,
  contentId: id,
  content: [{ type: "p", children: [{ text: "正文" }] }],
  excerpt: null,
  note: null,
  source: null,
  tags,
  createTime: 1_700_000_000_000,
  updateTime: 1_700_000_000_000,
  lastSeenTime: null,
  reason: { type: "stale", days: 40 },
});

const ITEM_A = item(1, "重排与重绘", ["前端"]);
const ITEM_B = item(2, "合成层与 GPU", ["前端"]);
const NEIGHBOR: WalkNeighbor = {
  ref: { kind: "card", id: 2 },
  title: "合成层与 GPU",
  relation: "tag",
  sharedTag: "前端",
};

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

const render = () =>
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <WalkView />
      </QueryClientProvider>
    );
  });
const settle = async () => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
};
/** react-query 的 fetch 经 setTimeout 调度：轮询等待条件成立（超时抛断言） */
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
  window.localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

describe("WalkView", () => {
  it("首屏渲染标题与岔路，起点记 seen", async () => {
    mocks.pick.mockResolvedValue(ITEM_A);
    mocks.sameTag.mockResolvedValue([NEIGHBOR]);
    render();
    await waitFor(() => (document.body.textContent ?? "").includes("合成层与 GPU"));
    const text = document.body.textContent ?? "";
    expect(text).toContain("漫步");
    expect(text).toContain("重排与重绘");
    expect(text).toContain("从这里走向");
    expect(mocks.pick).toHaveBeenCalledWith({ bias: "stale", kinds: expect.any(Array) });
    expect(mocks.markSeen).toHaveBeenCalledWith(ITEM_A.ref);
  });

  it("点击岔路前进：get 取回内容、足迹 +1、新站记 seen", async () => {
    mocks.pick.mockResolvedValue(ITEM_A);
    mocks.sameTag.mockResolvedValue([NEIGHBOR]);
    render();
    await waitFor(() => (document.body.textContent ?? "").includes("合成层与 GPU"));
    expect(document.querySelectorAll('[aria-current="step"]')).toHaveLength(1);

    mocks.get.mockResolvedValue(ITEM_B);
    await click(findButton("合成层与 GPU"));
    await waitFor(() =>
      (document.querySelector('[aria-current="step"]')?.textContent ?? "").includes("合成层与 GPU")
    );
    expect(mocks.get).toHaveBeenCalledWith(NEIGHBOR.ref);
    expect(mocks.markSeen).toHaveBeenCalledTimes(2);
    expect(mocks.markSeen).toHaveBeenLastCalledWith(ITEM_B.ref);
  });

  it("pick 为 null 显示空态；范围收窄时给放宽入口", async () => {
    mocks.pick.mockResolvedValue(null);
    render();
    await waitFor(() => (document.body.textContent ?? "").includes("还没有可以漫步的内容"));
    expect(document.body.textContent).toContain("写下 30 字以上的卡片、文章或日记");

    window.localStorage.setItem(
      "walk:prefs",
      JSON.stringify({ kinds: ["pdf-annotation"], bias: "stale" })
    );
    vi.clearAllMocks();
    mocks.pick.mockResolvedValue(null);
    act(() => root.unmount());
    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render();
    await waitFor(() => (document.body.textContent ?? "").includes("当前范围里没有内容"));
    expect(mocks.pick).toHaveBeenCalledWith({ bias: "stale", kinds: ["pdf-annotation"] });
    click(findButton("放宽到全部内容"));
    await waitFor(() =>
      (document.body.textContent ?? "").includes("写下 30 字以上的卡片、文章或日记")
    );
    expect(mocks.pick).toHaveBeenLastCalledWith({
      bias: "stale",
      kinds: ["card", "article", "diary-moment", "project-item", "pdf-annotation"],
    });
  });
});

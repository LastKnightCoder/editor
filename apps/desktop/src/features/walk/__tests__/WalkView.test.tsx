import { desktopLocaleSource } from "@/app/i18n/runtime";
import { walkTranslator } from "../i18n";
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
vi.mock("@/components/ContentEditor", () => ({
  default: ({ contentId, readonly }: { contentId: number; readonly: boolean }) => (
    <div data-content-id={contentId} data-readonly={readonly}>
      正文订阅
    </div>
  ),
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
    expect(document.querySelector('[data-content-id="1"]')?.getAttribute("data-readonly")).toBe(
      "true"
    );
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
    expect(document.querySelector('[data-content-id="2"]')).not.toBeNull();
    expect(document.querySelector('[data-content-id="1"]')).toBeNull();
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

it("切换语言保留当前站、前进足迹和已打开偏好，不重抽或重复记已见", async () => {
  const original = desktopLocaleSource.getSnapshot();
  mocks.pick.mockResolvedValue(ITEM_A);
  mocks.get.mockResolvedValue(ITEM_B);
  mocks.sameTag.mockResolvedValue([NEIGHBOR]);
  const button = (text: string) => {
    const result = [...document.querySelectorAll("button")].find(
      node => node.textContent?.trim() === text
    );
    if (!result) throw new Error(`未找到操作：${text}`);
    return result;
  };
  try {
    await act(async () => desktopLocaleSource.setLocale("zh-CN"));
    render();
    await vi.waitFor(async () => {
      await act(() => Promise.resolve());
      expect(findButton(ITEM_B.title)).toBeDefined();
    });
    await click(findButton(ITEM_B.title));
    await vi.waitFor(async () => {
      await act(() => Promise.resolve());
      expect(document.querySelector('[data-content-id="2"]')).not.toBeNull();
    });
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }))
    );
    await vi.waitFor(async () => {
      await act(() => Promise.resolve());
      expect(document.querySelector('[data-content-id="1"]')).not.toBeNull();
    });
    await click(findButton(walkTranslator.t("pool.all")));
    const selectedBias = document.querySelector<HTMLInputElement>(
      'input[type="radio"][value="random"]'
    );
    if (!selectedBias) throw new Error("偏好选项未挂载");
    await click(selectedBias);
    const removedKind = button(walkTranslator.t("kind.pdf-annotation"));
    await click(removedKind);
    expect(removedKind.getAttribute("aria-pressed")).toBe("false");
    const current = document.querySelector('[aria-current="step"]');
    const content = document.querySelector('[data-content-id="1"]');
    const stored = localStorage.getItem("walk:prefs");
    expect(JSON.parse(stored ?? "null")).toEqual({
      kinds: ["card", "article", "diary-moment", "project-item"],
      bias: "random",
    });
    const calls = () => ({
      pick: mocks.pick.mock.calls.length,
      get: mocks.get.mock.calls.length,
      seen: mocks.markSeen.mock.calls.length,
      mute: mocks.mute.mock.calls.length,
      links: mocks.entityContext.mock.calls.length,
      related: mocks.entityRelated.mock.calls.length,
      tags: mocks.sameTag.mock.calls.length,
      flashcards: mocks.openAiFlashcard.mock.calls.length,
    });
    const before = calls(),
      keys = queryClient
        .getQueryCache()
        .getAll()
        .map(query => query.queryKey);
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(document.querySelector('[aria-current="step"]')).toBe(current);
      expect(document.querySelector('[data-content-id="1"]')).toBe(content);
      expect(document.querySelector('input[type="radio"][value="random"]')).toBe(selectedBias);
      expect(selectedBias.checked).toBe(true);
      expect(button(walkTranslator.t("kind.pdf-annotation"))).toBe(removedKind);
      expect(removedKind.getAttribute("aria-pressed")).toBe("false");
      expect(localStorage.getItem("walk:prefs")).toBe(stored);
      expect(queryClient.getQueryData(["walk", "start", "random"])).toEqual(ITEM_A);
      expect(
        queryClient
          .getQueryCache()
          .getAll()
          .map(query => query.queryKey)
      ).toEqual(keys);
      expect(calls()).toEqual(before);
    }
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
    );
    expect(document.querySelector('[data-content-id="2"]')).not.toBeNull();
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain(ITEM_B.title);
    expect(mocks.pick).toHaveBeenCalledTimes(before.pick);
    expect(mocks.get).toHaveBeenCalledTimes(before.get);
    expect(mocks.markSeen).toHaveBeenCalledTimes(before.seen);
  } finally {
    await act(async () => desktopLocaleSource.setLocale(original));
  }
});

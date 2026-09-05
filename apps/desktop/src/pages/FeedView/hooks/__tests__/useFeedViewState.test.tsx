import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useFeedViewState from "../useFeedViewState";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const rssMock = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  listeners: new Set<() => void>(),
}));

const readLaterState = vi.hoisted(() => ({
  items: [],
  loading: false,
  init: vi.fn(),
  checkExists: vi.fn().mockResolvedValue(false),
  removeBySource: vi.fn(),
  addItem: vi.fn(),
  unstarItem: vi.fn(),
  starItem: vi.fn(),
  archiveItem: vi.fn(),
  unarchiveItem: vi.fn(),
  removeItem: vi.fn(),
}));

const navigateTo = vi.hoisted(() => vi.fn());

vi.mock("@/stores/useRssStore", async () => {
  const { useSyncExternalStore } = await import("react");
  const useMockRssStore = () =>
    useSyncExternalStore(
      (listener) => {
        rssMock.listeners.add(listener);
        return () => rssMock.listeners.delete(listener);
      },
      () => rssMock.state,
    );

  return {
    RssStatus: {
      UN_INIT: 0,
      LOADING: 1,
      SUCCESS: 2,
      FAIL: 3,
    },
    default: useMockRssStore,
  };
});

vi.mock("@/stores/useReadLaterStore", () => ({
  default: () => readLaterState,
}));

vi.mock("@/stores/useTabStore", () => ({
  default: (selector: (state: { navigateTo: typeof navigateTo }) => unknown) =>
    selector({ navigateTo }),
}));

vi.mock("@/hooks/useTabParams", () => ({
  default: () => ({ entryId: 42 }),
}));

vi.mock("@/commands", () => ({
  getAllProjectItems: vi.fn().mockResolvedValue([]),
  getWebLinksByIds: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/commands/rss", () => ({
  BILIBILI_FOLLOWINGS_DYNAMIC_FEED_URL: "tau://rss/bilibili/followings-dynamic",
}));

const createRssState = (status: number) => ({
  feeds: [],
  subscriptions: [],
  entries: [],
  entriesTotal: 0,
  entriesHasMore: false,
  entriesSearch: "",
  status,
  entriesStatus: 0,
  isRefreshing: false,
  init: vi.fn(),
  loadEntries: vi.fn(),
  loadUnreadEntries: vi.fn(),
  loadStarredEntries: vi.fn(),
  loadAllEntries: vi.fn(),
  loadCategoryEntries: vi.fn(),
  clearEntries: vi.fn(),
  markRead: vi.fn(),
  markUnread: vi.fn(),
  markAllRead: vi.fn(),
  toggleStar: vi.fn(),
  deleteEntry: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAll: vi.fn(),
  loadMoreEntries: vi.fn().mockResolvedValue(undefined),
  setEntriesSearch: vi.fn(),
  subscribeBilibiliFollowings: vi.fn().mockResolvedValue(undefined),
});

const updateRssState = (updates: Record<string, unknown>) => {
  rssMock.state = { ...rssMock.state, ...updates };
  rssMock.listeners.forEach((listener) => listener());
};

describe("useFeedViewState RSS 初始化时序", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    rssMock.listeners.clear();
    rssMock.state = createRssState(0);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("首页直跳时应等待 RSS 初始化成功后再加载列表", async () => {
    const Harness = () => {
      useFeedViewState();
      return null;
    };

    await act(async () => {
      root.render(<Harness />);
    });

    expect(rssMock.state.init).toHaveBeenCalledTimes(1);
    expect(rssMock.state.loadAllEntries).not.toHaveBeenCalled();

    await act(async () => {
      updateRssState({ status: 1 });
    });
    expect(rssMock.state.loadAllEntries).not.toHaveBeenCalled();

    await act(async () => {
      updateRssState({ status: 2 });
    });
    expect(rssMock.state.loadAllEntries).toHaveBeenCalledTimes(1);
  });
});

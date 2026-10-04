import { act, type Ref } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { CardGraphSection } from "../components/CardGraphSection";
import { useGraphMilestoneStore } from "../graphMilestones";
import { type ICard } from "@/types/card";

const mocks = vi.hoisted(() => ({ graph: vi.fn(), play: vi.fn() }));
vi.mock("@/components/LinkGraph", async () => {
  const { useImperativeHandle } = await import("react");
  function MockLinkGraph(props: { playbackRef?: Ref<{ play(): void; stop(): void }> }) {
    mocks.graph(props);
    useImperativeHandle(props.playbackRef, () => ({ play: mocks.play, stop: () => {} }));
    return null;
  }
  return { default: MockLinkGraph };
});
vi.mock("@/stores/useSettingStore", () => ({
  default: (select: (state: unknown) => unknown) =>
    select({ setting: { database: { active: "data.db" } } }),
}));

beforeEach(() => {
  mocks.graph.mockReset();
  mocks.play.mockReset();
  useGraphMilestoneStore.setState({ seenByDatabase: {} });
});

const makeCards = (count: number): ICard[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    contentId: i + 1,
    content: [],
    count: 0,
    tags: [],
    links: [],
    isTop: false,
    create_time: i,
    update_time: 0,
  }));

async function mountSection(cards: ICard[]) {
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <CardGraphSection
        cards={cards}
        highlightIds={null}
        onOpenCard={() => {}}
        enableHoverPreview
      />
    )
  );
  return root;
}

it("这个库第一次进入图谱时自动播一次，第二次进入不再自动播", async () => {
  vi.useFakeTimers();
  try {
    const first = await mountSection(makeCards(120));
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(mocks.play).toHaveBeenCalledTimes(1);
    expect(mocks.graph.mock.lastCall![0].caption).toBe(true);
    await act(async () => first.unmount());

    const second = await mountSection(makeCards(120));
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(mocks.play).toHaveBeenCalledTimes(1);
    expect(mocks.graph.mock.lastCall![0].captionHint).toBeNull();
    await act(async () => second.unmount());
  } finally {
    vi.useRealTimers();
  }
});

it("跨过里程碑时说明行换成邀请语，点开播放后才算看过", async () => {
  useGraphMilestoneStore.setState({ seenByDatabase: { "data.db": 100 } });
  const root = await mountSection(makeCards(320));
  const props = mocks.graph.mock.lastCall![0];
  expect(mocks.play).not.toHaveBeenCalled();
  expect(props.captionHint).toBe("长到 300 张了 · 看看它是怎么长出来的");
  expect(useGraphMilestoneStore.getState().seenByDatabase["data.db"]).toBe(100);
  await act(async () => props.onPlaybackChange({ active: true }));
  expect(useGraphMilestoneStore.getState().seenByDatabase["data.db"]).toBe(300);
  expect(mocks.graph.mock.lastCall![0].captionHint).toBeNull();
  await act(async () => root.unmount());
});
vi.mock("@/utils/card", () => ({ getInlineLinks: () => [2, 3] }));
vi.mock("../queries", () => ({
  useKnowledgeMap: () => ({ data: null, isPending: false, isFetching: false }),
}));

it("悬停随浮层开关恢复，筛选只改变高亮而不删除图谱节点", async () => {
  const cards: ICard[] = [1, 2, 3].map(id => ({
    id,
    contentId: id,
    content: [],
    count: 0,
    tags: [],
    links: [2],
    isTop: false,
    create_time: 0,
    update_time: 0,
  }));
  const host = document.createElement("div");
  const root = createRoot(host);
  const open = vi.fn();
  try {
    for (const enableHoverPreview of [true, false, true]) {
      await act(async () =>
        root.render(
          <CardGraphSection
            cards={cards}
            highlightIds={[1]}
            onOpenCard={open}
            enableHoverPreview={enableHoverPreview}
          />
        )
      );
      const props = mocks.graph.mock.lastCall![0];
      expect(props.initCards).toEqual(cards);
      expect(props.filterCardIds).toEqual([1]);
      expect(props.currentCardIds).toBeUndefined();
      expect(props.caption).toBe(true);
      expect(props.enableHoverPreview).toBe(enableHoverPreview);
      expect(props.getCardLinks(cards[0])).toEqual([2, 3]);
    }
  } finally {
    await act(async () => root.unmount());
  }
});

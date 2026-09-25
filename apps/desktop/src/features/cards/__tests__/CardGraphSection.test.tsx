import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CardGraphSection } from "../components/CardGraphSection";
import { ECardCategory, type ICard } from "@/types/card";

const mocks = vi.hoisted(() => ({ graph: vi.fn() }));
vi.mock("@/components/LinkGraph", () => ({
  default: (props: unknown) => {
    mocks.graph(props);
    return null;
  },
}));
vi.mock("@/utils/card", () => ({ getInlineLinks: () => [2, 3] }));

it("悬停随浮层开关恢复，筛选只改变高亮而不删除图谱节点", async () => {
  const cards: ICard[] = [1, 2, 3].map(id => ({
    id,
    contentId: id,
    content: [],
    count: 0,
    tags: [],
    links: [2],
    category: ECardCategory.Temporary,
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
      expect(props.currentCardIds).toEqual([1]);
      expect(props.enableHoverPreview).toBe(enableHoverPreview);
      expect(props.getCardLinks(cards[0])).toEqual([2, 3]);
    }
  } finally {
    await act(async () => root.unmount());
  }
});

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CardWallList } from "../components/CardWallList";
import { ECardCategory, type ICard } from "@/types/card";
import type { CardItemActions } from "../types";

const { scrollToOffset } = vi.hoisted(() => ({ scrollToOffset: vi.fn() }));
vi.mock("@/utils/editor", () => ({ getEditorText: () => "卡片正文" }));
vi.mock("@/components/ContentEditor", () => ({
  default: () => {
    throw new Error("卡片墙不应打开协作会话");
  },
}));
vi.mock("@tau/editor/src", () => ({
  Editor: ({ initValue, collaboration, readonly }: any) => {
    expect(collaboration).toBeUndefined();
    expect(readonly).toBe(true);
    const [initial] = useState(initValue);
    return <p data-preview>{JSON.stringify(initial)}</p>;
  },
}));
vi.mock("@/components/ErrorBoundary", () => ({ default: ({ children }: any) => children }));
vi.mock("@/stores/useDynamicExtensionsStore", () => ({ default: () => [] }));
vi.mock("../queries", () => ({
  bucketByTimeGroups: (cards: ICard[]) => [
    { label: "今天", cards: cards.filter(card => !card.isTop) },
  ],
}));
vi.mock("@tau/ui", async () => {
  const actual = await vi.importActual<typeof import("@tau/ui")>("@tau/ui");
  return {
    ...actual,
    Menu: Object.assign(({ trigger }: any) => trigger, {
      Item: () => null,
      Submenu: () => null,
      Separator: () => null,
    }),
    IconButton: ({ children, title, onClick }: any) => (
      <button title={title} onClick={onClick}>
        {children}
      </button>
    ),
  };
});
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => 1000,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 100 })),
    measureElement: () => {},
    scrollToOffset,
  }),
}));

it("置顶与时间分组同现，props 更新跟随渲染，回顶按钮与筛选变更均可回顶", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const cards = [true, false].map((isTop, index): ICard => ({
    id: index + 1,
    contentId: index + 10,
    content: Array.from({ length: 4 }, (_, block) => ({
      type: "paragraph",
      children: [{ text: `卡片${index + 1}正文${block + 1}` }],
    })) as ICard["content"],
    count: 0,
    tags: [],
    links: [],
    category: ECardCategory.Temporary,
    isTop,
    create_time: Date.now(),
    update_time: 0,
  }));
  const actions: CardItemActions = {
    onOpen: vi.fn(),
    onOpenDetail: vi.fn(),
    onPresent: vi.fn(),
    onDelete: vi.fn(),
    onExportMarkdown: vi.fn(),
    onExportImage: vi.fn(),
    onExportEpub: vi.fn(),
    onExportPdf: vi.fn(),
    onToggleTop: vi.fn(),
    onChangeCategory: vi.fn(),
  };
  try {
    await act(async () => root.render(<CardWallList cards={cards} actions={actions} />));
    expect(host.querySelector("header")?.textContent).toContain("置顶");
    expect(host.querySelector("[draggable=true]")).toBeNull();
    expect(host.textContent).toContain("卡片1正文1");
    expect(host.textContent).toContain("卡片2正文3");
    expect(host.textContent).not.toContain("正文4");
    const updated = cards.map(card => ({
      ...card,
      content: [{ type: "paragraph", children: [{ text: `更新${card.id}` }] }] as ICard["content"],
    }));
    await act(async () => root.render(<CardWallList cards={updated} actions={actions} />));
    expect(host.textContent).toContain("更新1");
    expect(host.textContent).toContain("更新2");
    expect(host.textContent).not.toContain("正文");
    await act(async () =>
      root.render(
        <CardWallList cards={[cards[1], cards[0]]} actions={actions} resetScrollKey="first" />
      )
    );
    expect(host.querySelector("header")?.textContent).toContain("置顶");
    expect([...host.querySelectorAll("[data-preview]")].map(node => node.textContent)).toEqual([
      JSON.stringify(cards[0].content.slice(0, 3)),
      JSON.stringify(cards[1].content.slice(0, 3)),
    ]);
    const scroller = host.querySelector(".overflow-y-auto") as HTMLDivElement;
    await act(async () => {
      scroller.scrollTop = 500;
      scroller.dispatchEvent(new Event("scroll"));
    });
    const backToTop = host.querySelector('button[title="回到顶部"]') as HTMLButtonElement;
    expect(backToTop).toBeTruthy();
    await act(async () => backToTop.click());
    expect(scrollToOffset).toHaveBeenCalledWith(0);
    await act(async () =>
      root.render(<CardWallList cards={cards} actions={actions} resetScrollKey="second" />)
    );
    expect(scroller.scrollTop).toBe(0);
    expect(host.querySelector('button[title="回到顶部"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    scrollToOffset.mockClear();
    vi.unstubAllGlobals();
  }
});

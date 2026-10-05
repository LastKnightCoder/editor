import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ICard } from "@/types/card";

vi.mock("@/features/search/queries", () => ({
  useSearchContent: () => ({ data: [], isFetching: false, error: null }),
  resultDisplay: () => ({ title: "" }),
}));

import { CardConnections, cardConnectionCount } from "../components/CardDetailLinks";

const text = (t: string) => ({ type: "formatted", text: t });
const link = (contentType: string, refId: number, title: string) => ({
  type: "content-link",
  contentType,
  refId,
  contentId: refId * 10,
  contentTitle: title,
  children: [text(title)],
});

const makeCard = (id: number, content: unknown[], links: number[] = []) =>
  ({
    id,
    content,
    links,
    tags: [],
    create_time: 0,
    update_time: 0,
    count: 0,
    contentId: id * 100,
  }) as unknown as ICard;

const card = makeCard(1, [
  {
    type: "paragraph",
    children: [
      text("见"),
      link("article", 5, "深度学习简介"),
      link("card", 2, "旧标题"),
      link("card", 1, "自己"),
    ],
  },
]);
const other = makeCard(2, [{ type: "paragraph", children: [text("事件循环")] }]);
const linkedCard = makeCard(3, [{ type: "paragraph", children: [text("关键渲染路径")] }]);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("卡片连接", () => {
  it("计数包含对文章等任何实体的正文引用，排除自引用", () => {
    expect(cardConnectionCount(card)).toBe(2);
    expect(cardConnectionCount({ ...card, links: [3, 2] } as ICard)).toBe(3);
  });

  it("文章引用用节点标题展示并带类型；卡片用轻表标题；只有双向链接可解除", () => {
    const onNavigate = vi.fn();
    const onUnlink = vi.fn();
    act(() => {
      root.render(
        <CardConnections
          card={{ ...card, links: [3] } as ICard}
          cards={[other, linkedCard]}
          onNavigate={onNavigate}
          onUnlink={onUnlink}
          onOpenAddDialog={() => {}}
        />
      );
    });
    const text = container.textContent ?? "";
    expect(text).toContain("深度学习简介");
    expect(text).toContain("文章");
    expect(text).toContain("事件循环");
    expect(text).toContain("关键渲染路径");
    expect(container.querySelectorAll('[aria-label="解除链接"]')).toHaveLength(1);

    const articleRow = [...container.querySelectorAll("button")].find(b =>
      b.textContent?.includes("深度学习简介")
    )!;
    act(() => articleRow.click());
    expect(onNavigate).toHaveBeenCalledWith({ kind: "article", id: 5 });

    act(() => (container.querySelector('[aria-label="解除链接"]') as HTMLElement).click());
    expect(onUnlink).toHaveBeenCalledWith(3);
  });
});

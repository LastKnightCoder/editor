// 关联区块集成测试：平铺列表渲染 → 添加弹层勾选 → 完成 → 双向写回与列表刷新。
// SnapSheet / router 以最小替身注入，聚焦 LinksDisclosure ↔ CardLinksSheet ↔ tauri 链路。

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

import type { CardListItem } from "../../../types";

const tauriMocks = vi.hoisted(() => ({
  getCardsByIds: vi.fn(
    async (ids: number[]) =>
      ids.map((id, idx) => ({
        id,
        contentId: id * 100,
        updateTime: 1_736_000_000_000 + idx,
        category: "permanent",
        tags: [],
        excerpt: `关联卡片 ${id} 的摘要`,
        content: [],
      })) as CardListItem[]
  ),
  updateCardLinks: vi.fn(async (params: { id: number; links: number[] }) => ({
    id: params.id,
    contentId: params.id * 100,
    createTime: 0,
    updateTime: 1_736_000_000_100,
    category: "permanent",
    tags: [],
    links: params.links,
    content: [],
    count: 10,
  })),
  getCardsOverview: vi.fn(async () => ({
    total: 2,
    page: 1,
    pageSize: 20,
    query: "",
    category: "",
    searchMode: "none",
    items: [
      {
        id: 7,
        contentId: 700,
        updateTime: 1_736_000_000_000,
        category: "permanent",
        tags: [],
        excerpt: "关联卡片 7 的摘要",
        content: [],
      },
      {
        id: 9,
        contentId: 900,
        updateTime: 1_736_000_000_001,
        category: "literature",
        tags: [],
        excerpt: "关联卡片 9 的摘要",
        content: [],
      },
    ] as CardListItem[],
  })),
}));

vi.mock("../../../services/tauri", () => tauriMocks);
vi.mock("../../../router", () => ({
  getNavigator: () => ({ push: vi.fn() }),
}));
vi.mock("../../../components/SnapSheet", () => {
  const SnapSheet = ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null;
  (SnapSheet as unknown as { Handle: () => null }).Handle = () => null;
  (
    SnapSheet as unknown as {
      Scroll: (props: { children: ReactNode }) => ReactElement;
    }
  ).Scroll = ({ children }) => <div>{children}</div>;
  return { SnapSheet };
});

import LinksDisclosure from "../LinksDisclosure";

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  root = null;
});

function renderUi(element: ReactElement) {
  root = createRoot(container);
  act(() => root!.render(element));
}

function findText(text: string): HTMLElement | null {
  const all = [...container.querySelectorAll<HTMLElement>("*")];
  return (
    // 叶子元素的精确文本，或图标按钮的整体文本（如「＋ 添加」内含 svg）
    all.find(el => el.childElementCount === 0 && el.textContent === text) ??
    all.find(el => el.tagName === "BUTTON" && el.textContent?.trim() === text) ??
    null
  );
}

function clickText(text: string) {
  const el = findText(text);
  if (!el) throw new Error(`未找到文本: ${text}`);
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function flushAsync(settleMs = 0) {
  await act(async () => {
    if (settleMs > 0) {
      await new Promise(resolve => setTimeout(resolve, settleMs));
    }
  });
}

describe("LinksDisclosure 平铺关联区", () => {
  it("有关联时直接平铺列表，不走折叠入口", async () => {
    renderUi(<LinksDisclosure links={[7]} cardId={5} />);
    await flushAsync();

    expect(findText("关联卡片 7 的摘要")).toBeTruthy();
    expect(findText("关联 · 1")).toBeTruthy();
    expect(findText("关联内容")).toBeNull();
  });

  it("弹层勾选 → 完成后写回 links 并刷新列表", async () => {
    const onLinksChanged = vi.fn();
    renderUi(<LinksDisclosure links={[7]} cardId={5} onLinksChanged={onLinksChanged} />);
    await flushAsync();

    clickText("添加关联");
    await flushAsync(450);

    clickText("关联卡片 9 的摘要");
    clickText("完成 · 2");
    await flushAsync();

    expect(tauriMocks.updateCardLinks).toHaveBeenCalledWith({
      id: 5,
      links: [7, 9],
    });
    const savedLinks = onLinksChanged.mock.calls[0]?.[0];
    expect(savedLinks).toEqual([7, 9]);

    // 父层写回后重渲染：列表出现新关联
    act(() =>
      root!.render(
        <LinksDisclosure links={savedLinks} cardId={5} onLinksChanged={onLinksChanged} />
      )
    );
    await flushAsync();
    expect(findText("关联卡片 9 的摘要")).toBeTruthy();
    expect(findText("关联 · 2")).toBeTruthy();
  });

  it("无勾选变化时点完成不触发写库", async () => {
    renderUi(<LinksDisclosure links={[7]} cardId={5} />);
    await flushAsync();

    clickText("添加关联");
    await flushAsync(450);

    clickText("完成 · 1");
    await flushAsync();

    expect(tauriMocks.updateCardLinks).not.toHaveBeenCalled();
  });
});

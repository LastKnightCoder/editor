// 关联区块展示测试：只读平铺列表渲染 / 无关联不渲染。
// 管理入口已迁至卡片详情 ⋯ ActionSheet（pages/contentDetail.page.tsx），此处不再覆盖编辑链路。

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import type { CardListItem } from "../../../types";

const tauriMocks = vi.hoisted(() => ({
  getCardsByIds: vi.fn(
    async (ids: number[]) =>
      ids.map((id, idx) => ({
        id,
        contentId: id * 100,
        updateTime: 1_736_000_000_000 + idx,
        tags: [],
        excerpt: `关联卡片 ${id} 的摘要`,
        content: [],
      })) as CardListItem[]
  ),
}));

vi.mock("../../../services/tauri", () => tauriMocks);
vi.mock("../../../router", () => ({
  getNavigator: () => ({ push: vi.fn() }),
}));

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
  return all.find(el => el.childElementCount === 0 && el.textContent === text) ?? null;
}

async function flushAsync() {
  await act(async () => {});
}

describe("LinksDisclosure 平铺关联区", () => {
  it("有关联时直接平铺列表", async () => {
    renderUi(<LinksDisclosure links={[7]} />);
    await flushAsync();

    expect(findText("关联卡片 7 的摘要")).toBeTruthy();
    expect(findText("关联 · 1")).toBeTruthy();
  });

  it("无关联时不渲染，也不发起拉取", async () => {
    renderUi(<LinksDisclosure links={[]} />);
    await flushAsync();

    expect(container.querySelector("*")).toBeNull();
    expect(tauriMocks.getCardsByIds).not.toHaveBeenCalled();
  });

  it("关联集合变化后重新拉取并刷新列表", async () => {
    renderUi(<LinksDisclosure links={[7]} />);
    await flushAsync();
    expect(findText("关联卡片 7 的摘要")).toBeTruthy();

    act(() => root!.render(<LinksDisclosure links={[7, 9]} />));
    await flushAsync();

    expect(findText("关联卡片 9 的摘要")).toBeTruthy();
    expect(findText("关联 · 2")).toBeTruthy();
  });
});

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

type VirtualRow = { index: number; key: string | number; start: number; size: number };

// 实例必须稳定：真实 useVirtualizer 用 useState 创建实例，滚动只触发内部 rerender，
// 实例引用终生不变。mock 若每次返回新对象，就会掩盖“依赖 virtualizer 导致滚动不重跑”的缺陷。
const virtualMock = vi.hoisted(() => {
  const state = { items: [] as VirtualRow[] };
  const instance = {
    getVirtualItems: () => state.items,
    getTotalSize: () => 0,
    measureElement: () => {},
  };
  return { state, instance };
});

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => virtualMock.instance,
}));

import { VirtualContainerList } from "../VirtualContainerList";

function row(index: number): VirtualRow {
  return { index, key: index, start: index * 100, size: 100 };
}

function setup(items: Array<{ id: number }>, fetchNextPage: () => Promise<unknown>) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);

  const renderList = async (hasNextPage: boolean, isFetchingNextPage = false) => {
    await act(async () => {
      root.render(
        <VirtualContainerList
          items={items}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={fetchNextPage}
          renderItem={item => <span>{item.id}</span>}
        />
      );
    });
  };

  return {
    renderList,
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

afterEach(() => {
  virtualMock.state.items = [];
  document.body.innerHTML = "";
});

describe("VirtualContainerList 分页触发", () => {
  it("滚动使末尾行进入可视区后触发下一页加载", async () => {
    const fetchNextPage = vi.fn().mockResolvedValue(undefined);
    const items = Array.from({ length: 40 }, (_, index) => ({ id: index + 1 }));
    const { renderList, cleanup } = setup(items, fetchNextPage);

    virtualMock.state.items = [row(0), row(1)];
    await renderList(true);
    expect(fetchNextPage).not.toHaveBeenCalled();

    // 模拟滚动：末尾附近的行进入可视区，组件随虚拟项变化重渲染
    virtualMock.state.items = [row(38), row(39)];
    await renderList(true);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    await cleanup();
  });

  it("已无下一页或正在加载时不触发", async () => {
    const fetchNextPage = vi.fn().mockResolvedValue(undefined);
    const items = Array.from({ length: 40 }, (_, index) => ({ id: index + 1 }));

    const noNext = setup(items, fetchNextPage);
    virtualMock.state.items = [row(39)];
    await noNext.renderList(false);
    expect(fetchNextPage).not.toHaveBeenCalled();
    await noNext.cleanup();

    const loading = setup(items, fetchNextPage);
    virtualMock.state.items = [row(39)];
    await loading.renderList(true, true);
    expect(fetchNextPage).not.toHaveBeenCalled();
    await loading.cleanup();
  });
});

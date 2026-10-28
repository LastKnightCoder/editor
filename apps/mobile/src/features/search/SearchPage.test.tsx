import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { UnifiedSearchResponse } from "../../types";

const state = vi.hoisted(() => ({ revision: 1 }));
vi.mock("../../services/pluginEntities", () => ({
  useMobileEntityHostRevision: () => state.revision,
}));
vi.mock("../../hooks/useSearchHistory", () => ({
  useSearchHistory: () => ({ history: ["测试"], addHistory: vi.fn(), clearHistory: vi.fn() }),
}));
import { SearchPage } from "./SearchPage";

let root: Root;
let host: HTMLElement;
const response = (page: number): UnifiedSearchResponse => ({
  total: 2,
  page,
  pageSize: 1,
  query: "测试",
  searchMode: "like",
  items: [
    {
      id: page,
      type: "plugin-entity",
      title: `笔记${page}`,
      excerpt: "",
      contentId: page * 10,
      updateTime: 10,
      score: 1,
      date: null,
      containerId: null,
      containerTitle: null,
      pluginEntity: { pluginId: "test", kind: "journal", label: "周记", icon: "", createdAt: 10 },
    },
  ],
});
const open = vi.fn();
let search: ReturnType<
  typeof vi.fn<(query: string, page?: number) => Promise<UnifiedSearchResponse>>
>;
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(item =>
    item.textContent?.includes(text)
  );
beforeEach(() => {
  state.revision = 1;
  open.mockClear();
  search = vi.fn(async (_query, page = 1) => response(page));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const render = () =>
  act(() =>
    root.render(
      <SearchPage onClose={() => {}} onSearch={search} onOpenResult={open} isSearching={false} />
    )
  );

it("显示持久插件类型名并有界加载下一页，结果交给打开入口", async () => {
  render();
  await act(async () => button("测试")?.click());
  expect(document.body.textContent).toContain("周记");
  await act(async () => button("加载更多")?.click());
  expect(search).toHaveBeenLastCalledWith("测试", 2);
  expect(button("笔记1")).toBeDefined();
  expect(button("笔记2")).toBeDefined();
  await act(async () => button("笔记2")?.click());
  expect(open).toHaveBeenCalledWith(expect.objectContaining({ id: 2, type: "plugin-entity" }));
});

it("切换宿主工作区后丢弃迟到分页结果", async () => {
  let finish!: (result: UnifiedSearchResponse) => void;
  search.mockImplementation(async (_query, page = 1) =>
    page === 1
      ? response(1)
      : new Promise(resolve => {
          finish = resolve;
        })
  );
  render();
  await act(async () => button("测试")?.click());
  await act(async () => button("加载更多")?.click());
  state.revision++;
  render();
  await act(async () => finish(response(2)));
  expect(button("笔记2")).toBeUndefined();
  expect(document.body.textContent).toContain("搜索历史");
});

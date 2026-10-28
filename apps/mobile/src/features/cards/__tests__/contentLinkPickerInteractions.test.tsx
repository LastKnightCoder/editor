import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  query: vi.fn(),
  metadata: vi.fn(),
  warning: vi.fn(),
  revision: 1,
  kinds: [{ pluginId: "test.notes", kind: "note" }],
}));
vi.mock("../../../services/tauri", () => ({ searchAllContent: fixtures.query }));
vi.mock("../../../services/pluginEntities", () => ({
  useMobileMentionableEntityKinds: () => fixtures.kinds,
  useMobileEntityHostRevision: () => fixtures.revision,
  getMobilePluginEntityMetadata: fixtures.metadata,
  openMobilePluginEntity: vi.fn(),
}));
vi.mock("../../../components/toast", () => ({ toast: fixtures.warning }));

import { ContentLinkPickerSheet } from "../editorExtensions/ContentLinkPickerSheet";

let root: Root;
let host: HTMLElement;
let client: QueryClient;
const select = vi.fn();
const candidate = (id: number) => ({
  id,
  type: "plugin-entity",
  title: `周记${id}`,
  excerpt: "",
  contentId: id * 10,
  updateTime: 10,
  score: 1,
  date: null,
  containerId: null,
  containerTitle: null,
  pluginEntity: { pluginId: "test.notes", kind: "note", label: "周记", icon: "", createdAt: 10 },
});
const metadata = (id: number) => ({
  kind: "plugin-entity",
  id,
  pluginId: "test.notes",
  entityKind: "note",
  createdAt: 10,
  contentId: id * 10,
  contentCreatedAt: 10,
  title: `周记${id}`,
  label: "周记",
  icon: "",
});

beforeEach(() => {
  fixtures.revision = 1;
  fixtures.kinds = [{ pluginId: "test.notes", kind: "note" }];
  fixtures.query.mockReset().mockImplementation(async ({ page }: { page: number }) => ({
    page,
    pageSize: 1,
    total: 2,
    query: "",
    searchMode: "recent",
    items: [candidate(page)],
  }));
  fixtures.metadata.mockReset().mockImplementation(async (id: number) => metadata(id));
  fixtures.warning.mockClear();
  select.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  document.body.innerHTML = "";
});
const tick = () =>
  act(async () => {
    await new Promise(resolve => setTimeout(resolve, 15));
  });
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(item =>
    item.textContent?.includes(label)
  );
async function render(open = true) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <ContentLinkPickerSheet open={open} onClose={() => {}} onSelect={select} />
      </QueryClientProvider>
    )
  );
  await tick();
}

it("@空词候选按活跃mentionable类型分页，确认前复验身份", async () => {
  await render();
  expect(fixtures.query).toHaveBeenCalledWith(
    expect.objectContaining({
      query: "",
      page: 1,
      pageSize: 20,
      types: ["card", "article", "project-item", "plugin-entity"],
      pluginEntityKinds: fixtures.kinds,
    })
  );
  await act(async () => button("加载更多")?.click());
  await tick();
  expect(fixtures.query).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
  expect(button("周记1")).toBeDefined();
  expect(button("周记2")).toBeDefined();
  await act(async () => button("周记2")?.click());
  expect(fixtures.metadata).toHaveBeenCalledWith(2, 20);
  expect(select).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ contentType: "plugin-entity", contentId: 20, refId: 2 })
  );
});

it("关闭后重开选择器，旧确认请求不能写入新的选择上下文", async () => {
  let finish!: (value: ReturnType<typeof metadata>) => void;
  fixtures.metadata.mockReturnValue(
    new Promise(resolve => {
      finish = resolve;
    })
  );
  await render();
  await act(async () => button("周记1")?.click());
  await render(false);
  await render(true);
  await act(async () => finish(metadata(1)));
  expect(select).not.toHaveBeenCalled();
});

it("已复用的实体身份不插入引用，也不自动改成新内容", async () => {
  fixtures.metadata.mockResolvedValue({ ...metadata(1), createdAt: 11 });
  await render();
  await act(async () => button("周记1")?.click());
  expect(select).not.toHaveBeenCalled();
  expect(fixtures.warning).toHaveBeenCalledWith(
    expect.objectContaining({ text: expect.stringContaining("已变化") })
  );
});

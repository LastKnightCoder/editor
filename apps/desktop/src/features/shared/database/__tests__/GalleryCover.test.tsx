import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { IContent } from "@/types/content";
import { GalleryCover } from "../GalleryCover";
import { defaultContentEventBus } from "@/utils/event-bus/content-event-bus";

const { read, scope } = vi.hoisted(() => ({ read: vi.fn(), scope: { active: "a" } }));
vi.mock("@/commands/content", () => ({ getContentById: read }));
vi.mock("@/stores/useSettingStore", () => {
  const getState = () => ({ setting: { database: { active: scope.active } } });
  return {
    default: Object.assign(
      (selector: (state: ReturnType<typeof getState>) => unknown) => selector(getState()),
      { getState }
    ),
  };
});
vi.mock("@/components/ContentEditor", () => ({
  default: function Preview({ initValue }: { initValue: IContent["content"] }) {
    const [initial] = useState(initValue);
    return <span>{(initial[0] as { children: { text: string }[] }).children[0].text}</span>;
  },
}));

let root: Root | undefined;
let host: HTMLDivElement;
let client: QueryClient;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host?.remove();
  client?.clear();
  vi.clearAllMocks();
  scope.active = "a";
});
const content = (text: string): IContent => ({
  id: 17,
  createTime: 0,
  updateTime: 1,
  count: 1,
  refCount: 1,
  content: [{ type: "paragraph", children: [{ text }] }] as IContent["content"],
});
const mount = async () => {
  await act(async () =>
    root!.render(
      <QueryClientProvider client={client}>
        <GalleryCover row={{ id: "r", detailContentId: 17 }} columns={[]} coverType="detail" />
      </QueryClientProvider>
    )
  );
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
  });
};

it("缓存新鲜期内卸载再进入画廊也读取新正文，并重建只读预览", async () => {
  read.mockResolvedValue(content("旧正文"));
  client = new QueryClient({
    defaultOptions: { queries: { staleTime: 300000, refetchOnWindowFocus: false, retry: false } },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await mount();
  expect(host.textContent).toBe("旧正文");
  await act(async () =>
    root!.render(<QueryClientProvider client={client}>{null}</QueryClientProvider>)
  );
  read.mockResolvedValue(content("新正文"));
  await mount();
  expect(read).toHaveBeenCalledTimes(2);
  expect(host.textContent).toBe("新正文");
});

it("正文事件即时更新已挂载封面，旧库事件不污染新库缓存", async () => {
  read.mockResolvedValue(content("旧正文"));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await mount();
  read.mockResolvedValue(content("事件正文"));
  await act(async () => {
    defaultContentEventBus
      .createEditor()
      .publishContentEvent("content:updated", content("事件正文"));
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
  });
  expect(host.textContent).toBe("事件正文");
  scope.active = "b";
  await act(async () => {
    defaultContentEventBus
      .createEditor()
      .publishContentEvent("content:updated", content("迟到正文"));
  });
  expect(client.getQueryData<IContent>(["database", "a", "gallery-cover", 17])?.content).toEqual(
    content("事件正文").content
  );
});

it("新库同正文 ID 的订阅收到旧库迟到事件，只重读新库正文", async () => {
  read.mockResolvedValue(content("a 库正文"));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await mount();
  await act(async () =>
    root!.render(<QueryClientProvider client={client}>{null}</QueryClientProvider>)
  );
  scope.active = "b";
  read.mockResolvedValue(content("b 库正文"));
  await mount();
  await act(async () =>
    defaultContentEventBus
      .createEditor()
      .publishContentEvent("content:updated", content("a 库迟到正文"))
  );
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
  });
  expect(host.textContent).toBe("b 库正文");
  expect(client.getQueryData<IContent>(["database", "b", "gallery-cover", 17])?.content).toEqual(
    content("b 库正文").content
  );
});

// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { UiProvider } from "@tau/ui";
import { ApiProvider, createQueryClient } from "../../app/api";
import { createMockApi } from "../../api/mock/mockApi";
import { centerKeys } from "../catalog/center-queries";
import { LikeButton } from "./LikeButton";
import { PluginComments } from "./PluginComments";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function setup() {
  const api = createMockApi();
  render(
    <UiProvider>
      <ApiProvider api={api}>
        <QueryClientProvider client={createQueryClient()}>
          <LikeButton pluginId="test.plugin" />
          <PluginComments pluginId="test.plugin" />
        </QueryClientProvider>
      </ApiProvider>
    </UiProvider>
  );
  return api;
}
it("无需登录即可喜欢、取消、评论；纯文本显示且只展示本人删除入口", async () => {
  const api = setup();
  const session = vi.spyOn(api, "getSession");
  fireEvent.click(await screen.findByRole("button", { name: "喜欢 · 0" }));
  fireEvent.click(await screen.findByRole("button", { name: "取消喜欢 · 1" }));
  await screen.findByRole("button", { name: "喜欢 · 0" });
  fireEvent.change(screen.getByRole("textbox", { name: "评论内容" }), {
    target: { value: "<script>test</script>" },
  });
  fireEvent.click(screen.getByRole("button", { name: "发表评论" }));
  await screen.findByText("<script>test</script>");
  expect(screen.getAllByRole("button", { name: "删除我的评论" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "删除我的评论" }));
  fireEvent.click(await screen.findByRole("button", { name: "确认删除" }));
  await screen.findByText("暂无评论。");
  expect(session).not.toHaveBeenCalled();
});

it("评论结果未知时保留正文和请求ID，重试不会重复发表", async () => {
  const api = setup();
  const original = api.addComment;
  const add = vi
    .spyOn(api, "addComment")
    .mockImplementationOnce(async (...args: Parameters<typeof original>) => {
      await original(...args);
      throw new Error("网络连接中断，请求结果未知");
    })
    .mockImplementation(original);
  await screen.findByText("暂无评论。");
  fireEvent.change(screen.getByRole("textbox", { name: "评论内容" }), {
    target: { value: "这是一条评论" },
  });
  fireEvent.click(screen.getByRole("button", { name: "发表评论" }));
  await screen.findByRole("alert");
  expect((screen.getByRole("textbox", { name: "评论内容" }) as HTMLTextAreaElement).value).toBe(
    "这是一条评论"
  );
  fireEvent.click(screen.getByRole("button", { name: "发表评论" }));
  await waitFor(() => expect(add).toHaveBeenCalledTimes(2));
  expect(add.mock.calls[0][2]).toBe(add.mock.calls[1][2]);
  await screen.findByText("这是一条评论");
  expect(screen.getAllByText("这是一条评论")).toHaveLength(1);
});

it("喜欢先乐观更新，请求未返回也立即变化；失败回滚并提示", async () => {
  const api = setup();
  let reject: (error: Error) => void = () => undefined;
  const like = vi
    .spyOn(api, "setPluginLiked")
    .mockImplementationOnce(() => new Promise((_resolve, fail) => (reject = fail)));
  fireEvent.click(await screen.findByRole("button", { name: "喜欢 · 0" }));
  await screen.findByRole("button", { name: "取消喜欢 · 1" });
  expect(like).toHaveBeenCalledWith("test.plugin", true);
  reject(new Error("网络中断"));
  await screen.findByRole("button", { name: "喜欢 · 0" });
});

it("连点按顺序发出请求，最终状态与最后一次点击一致", async () => {
  const api = setup();
  const original = api.setPluginLiked;
  const calls: boolean[] = [];
  vi.spyOn(api, "setPluginLiked").mockImplementation(async (id, liked) => {
    calls.push(liked);
    await new Promise(resolve => setTimeout(resolve, 10));
    return original(id, liked);
  });
  fireEvent.click(await screen.findByRole("button", { name: "喜欢 · 0" }));
  fireEvent.click(await screen.findByRole("button", { name: "取消喜欢 · 1" }));
  fireEvent.click(await screen.findByRole("button", { name: "喜欢 · 0" }));
  await screen.findByRole("button", { name: "取消喜欢 · 1" });
  await waitFor(() => expect(calls).toEqual([true, false, true]));
  // 第三次请求发出后还要等它写入才落定，直接读会撞上写入前的状态
  await waitFor(async () => expect((await api.getCommunity("test.plugin", null)).liked).toBe(true));
  await screen.findByRole("button", { name: "取消喜欢 · 1" });
});

it("喜欢同步修改 v2 目录缓存中该插件的计数，任意平台筛选下都生效", async () => {
  const api = createMockApi();
  vi.spyOn(api, "setPluginLiked").mockReturnValue(new Promise(() => undefined));
  const client = createQueryClient();
  const key = centerKeys.catalog({ platform: "android", q: "", category: null, sort: "updated" });
  const entry = (pluginId: string) => ({ pluginId, likes: 3 });
  client.setQueryData(key, {
    pageParams: [null],
    pages: [{ items: [entry("test.plugin"), entry("other.plugin")], nextCursor: null }],
  });
  render(
    <UiProvider>
      <ApiProvider api={api}>
        <QueryClientProvider client={client}>
          <LikeButton pluginId="test.plugin" />
        </QueryClientProvider>
      </ApiProvider>
    </UiProvider>
  );
  fireEvent.click(await screen.findByRole("button", { name: "喜欢 · 0" }));
  await waitFor(() =>
    expect(
      client.getQueryData<{ pages: { items: { pluginId: string; likes: number }[] }[] }>(key)
        ?.pages[0].items
    ).toEqual([
      { pluginId: "test.plugin", likes: 4 },
      { pluginId: "other.plugin", likes: 3 },
    ])
  );
});

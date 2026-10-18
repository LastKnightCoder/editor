// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { UiProvider } from "@tau/ui";
import { ApiProvider, createQueryClient } from "../app/api";
import { createMockApi } from "../api/mock/mockApi";
import { PluginCommunityPanel } from "./PluginCommunityPanel";

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
          <PluginCommunityPanel pluginId="test.plugin" />
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
    .mockImplementationOnce(async (...args) => {
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

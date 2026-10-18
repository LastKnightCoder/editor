// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { UiProvider } from "@tau/ui";
import { ApiProvider, createQueryClient } from "../app/api";
import { createMockApi } from "../api/mock/mockApi";
import { ModerationPage } from "./ModerationPage";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function setup(reviewer = true) {
  const api = createMockApi({ reviewer });
  const comments = vi.spyOn(api, "listModerationComments").mockResolvedValue({
    items: [
      {
        id: "c1",
        pluginId: "test.plugin",
        visitorId: "visitor",
        message: "待处理评论",
        createdAt: "2026-10-18",
        deleted: false,
        suspended: false,
        visitorRevision: 0,
      },
    ],
    nextCursor: null,
  });
  render(
    <MemoryRouter>
      <UiProvider>
        <ApiProvider api={api}>
          <QueryClientProvider client={createQueryClient()}>
            <ModerationPage />
          </QueryClientProvider>
        </ApiProvider>
      </UiProvider>
    </MemoryRouter>
  );
  return { api, comments };
}
it("普通作者不查询管理数据", async () => {
  const { comments } = setup(false);
  await screen.findByText("只有管理员可以管理评论。");
  expect(comments).not.toHaveBeenCalled();
});
it("删除需要原因与确认，失败保留内容，重试复用请求ID", async () => {
  const { api, comments } = setup();
  const mutate = vi
    .spyOn(api, "moderate")
    .mockRejectedValueOnce(new Error("结果未知"))
    .mockResolvedValue({
      id: "event",
      reviewer: "admin",
      commentId: "c1",
      visitorId: "visitor",
      action: "delete_comment",
      reason: "垃圾内容",
      createdAt: "2026-10-18",
    });
  fireEvent.click(await screen.findByRole("button", { name: "删除评论" }));
  expect((screen.getByRole("button", { name: "确认处理" }) as HTMLButtonElement).disabled).toBe(
    true
  );
  fireEvent.change(screen.getByRole("textbox", { name: "处理原因" }), {
    target: { value: "垃圾内容" },
  });
  fireEvent.click(screen.getByRole("button", { name: "确认处理" }));
  await screen.findByText("结果未知");
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "确认处理" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
  expect(mutate.mock.calls[0][0]).toEqual(mutate.mock.calls[1][0]);
  expect(mutate.mock.calls[0][0]).toMatchObject({
    commentId: "c1",
    reason: "垃圾内容",
    action: "delete_comment",
    revision: 0,
  });
  await waitFor(() => expect(comments.mock.calls.length).toBeGreaterThan(1));
});
it("停用使用列表的身份版本，操作记录按需加载", async () => {
  const { api } = setup();
  const events = vi.spyOn(api, "listModerationEvents");
  const mutate = vi.spyOn(api, "moderate").mockResolvedValue({
    id: "event",
    reviewer: "admin",
    commentId: "c1",
    visitorId: "visitor",
    action: "suspend_visitor",
    reason: "刷屏",
    createdAt: "2026-10-18",
  });
  fireEvent.click(await screen.findByRole("button", { name: "停用匿名身份" }));
  fireEvent.change(screen.getByRole("textbox", { name: "处理原因" }), {
    target: { value: "刷屏" },
  });
  fireEvent.click(screen.getByRole("button", { name: "确认处理" }));
  await waitFor(() =>
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ action: "suspend_visitor", revision: 0 })
    )
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(events).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "操作记录" }));
  await waitFor(() => expect(events).toHaveBeenCalledWith(null));
});

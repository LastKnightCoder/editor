// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { UiProvider } from "@tau/ui";
import { ApiProvider, createQueryClient } from "../app/api";
import { createMockApi } from "../api/mock/mockApi";
import { PortalApiError } from "../api/errors";
import { AppFeedbackPage } from "./AppFeedbackPage";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup(reviewer = true) {
  const api = createMockApi({ reviewer });
  vi.spyOn(api, "getSession").mockResolvedValue({
    user: { id: "admin", login: "admin", avatarUrl: "" },
    csrfToken: "csrf",
    reviewer,
  });
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
  render(
    <MemoryRouter>
      <UiProvider>
        <ApiProvider api={api}>
          <QueryClientProvider client={createQueryClient()}>
            <AppFeedbackPage />
          </QueryClientProvider>
        </ApiProvider>
      </UiProvider>
    </MemoryRouter>
  );
  return api;
}

it("普通作者不查询反馈", async () => {
  const api = setup(false);
  const list = vi.spyOn(api, "listAppFeedback");
  await screen.findByText("只有管理员可以查看用户反馈。");
  expect(list).not.toHaveBeenCalled();
});

it("默认列出新反馈，选中后看详情并改状态", async () => {
  const api = setup();
  const update = vi.spyOn(api, "updateAppFeedback");
  fireEvent.click(await screen.findByText(/白板里拖动卡片时偶尔会卡住/));
  expect(screen.queryByText(/界面很好看/)).toBeNull();
  await screen.findByText("whiteboard");
  expect(screen.getByText("普通日志")).toBeTruthy();
  expect(screen.getByText("性能日志")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "标为处理中" }));
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith("fb-1", { status: "doing", revision: 0 })
  );
  await screen.findByRole("button", { name: "已解决" });
  expect(screen.queryByRole("button", { name: "标为处理中" })).toBeNull();
});

it("保存备注冲突时提示并保留草稿", async () => {
  const api = setup();
  vi.spyOn(api, "updateAppFeedback").mockRejectedValueOnce(
    new PortalApiError(409, "REVISION_CONFLICT", "这条反馈刚被更新过，请刷新后重试")
  );
  fireEvent.click(await screen.findByText(/希望闪卡复习/));
  const note = await screen.findByLabelText("内部备注");
  fireEvent.change(note, { target: { value: "排进下个版本" } });
  fireEvent.click(screen.getByRole("button", { name: "保存备注" }));
  await screen.findByText("这条反馈刚被更新过，请刷新后重试");
  expect((screen.getByLabelText("内部备注") as HTMLTextAreaElement).value).toBe("排进下个版本");
});

it("按匿名身份筛选", async () => {
  const api = setup();
  const list = vi.spyOn(api, "listAppFeedback");
  fireEvent.click(await screen.findByText(/希望闪卡复习/));
  fireEvent.click(await screen.findByRole("button", { name: "只看该身份" }));
  await waitFor(() =>
    expect(list).toHaveBeenLastCalledWith(
      { status: "all", kind: "all", visitorId: "3f9a1c2e-visitor" },
      null
    )
  );
  const chip = await screen.findByText("只看");
  expect(within(chip.parentElement as HTMLElement).getByText("3f9a1c2e-v")).toBeTruthy();
});

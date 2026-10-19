// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { UiProvider } from "@tau/ui";
import { ApiProvider, createQueryClient } from "../app/api";
import { createMockApi } from "../api/mock/mockApi";
import { SubmissionsPage } from "./SubmissionsPage";

afterEach(cleanup);

it("同一插件的多次提交合为一行，展开后列出各次提交，筛选按插件计数", async () => {
  const api = createMockApi({ reviewer: true });
  const make = async () => {
    const draft = await api.createSubmission(crypto.randomUUID());
    const ticket = await api.createUpload({ fileName: "p.zip", size: 1 });
    const up = await api.sendUpload(ticket, new Blob(["x"]), () => undefined).result;
    return api.saveSubmission(draft.id, {
      revision: 1,
      packageUploadId: up.id,
      repository: "https://github.com/author/plugin",
    });
  };
  const first = await make();
  const pending = await api.submitSubmission(first.id, first.revision);
  await api.reviewSubmission(pending.id, {
    revision: pending.revision,
    decision: "approve",
    comment: "",
  });
  await make();
  await api.createSubmission(crypto.randomUUID());
  render(
    <MemoryRouter>
      <UiProvider>
        <ApiProvider api={api}>
          <QueryClientProvider client={createQueryClient()}>
            <SubmissionsPage />
          </QueryClientProvider>
        </ApiProvider>
      </UiProvider>
    </MemoryRouter>
  );
  const toggle = await screen.findByRole("button", { name: "阅读助手的提交记录" });
  expect(screen.getAllByText("阅读助手")).toHaveLength(1);
  expect(toggle.textContent).toContain("提交记录 2");
  // 待作者继续的草稿优先于已批准的那次
  expect(screen.getByRole("button", { name: "继续编辑" })).toBeTruthy();
  expect(screen.queryByText("审核通过")).toBeNull();
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  const links = screen.getAllByRole("link");
  expect(links).toHaveLength(2);
  expect(within(links[1]).getByText("审核通过")).toBeTruthy();
  expect(screen.getByText("1 个草稿还没有上传插件包", { exact: false })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^已批准/ }));
  expect(screen.getByText("这个状态下没有插件")).toBeTruthy();
});

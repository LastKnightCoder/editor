// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { UiProvider } from "@tau/ui";
import { ApiProvider, createQueryClient } from "../app/api";
import { createMockApi } from "../api/mock/mockApi";
import { SubmissionsPage } from "./SubmissionsPage";

afterEach(cleanup);

it("同一插件的多次提交合为一行，展开后列出各次提交，筛选按插件计数", async () => {
  const api = createMockApi({ reviewer: true });
  const make = async () => {
    const ticket = await api.createUpload({ fileName: "p.zip", size: 1 });
    const up = await api.sendUpload(ticket, new Blob(["x"]), () => undefined).result;
    const draft = await api.createSubmission({
      clientRequestId: crypto.randomUUID(),
      packageUploadId: up.id,
    });
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
  // 旧协议遗留的无包草稿：移除包后模拟它仍能在列表中单独成组
  const legacy = await make();
  await api.saveSubmission(legacy.id, {
    revision: legacy.revision,
    packageUploadId: null,
    repository: "",
  });
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
  // 展开后草稿行可删除（按钮在链接外、同一行内）；确认后列表只剩已批准的那次
  const draftRow = links[0].closest("li") as HTMLElement;
  expect(within(links[0]).queryByRole("button")).toBeNull();
  fireEvent.click(within(draftRow).getByRole("button", { name: "删除草稿" }));
  fireEvent.click(await screen.findByRole("button", { name: "删除" }));
  await waitFor(() => expect(toggle.textContent).toContain("提交记录 1"));
  fireEvent.click(screen.getByRole("button", { name: /^已批准/ }));
  expect(screen.getAllByText("阅读助手")).toHaveLength(1);
});

it("只有已发布版本的插件行提供「发布新版本」，点击带插件 ID 进入新建页", async () => {
  const api = createMockApi({ reviewer: true });
  const ticket = await api.createUpload({ fileName: "p.zip", size: 1 });
  const up = await api.sendUpload(ticket, new Blob(["x"]), () => undefined).result;
  const draft = await api.createSubmission({
    clientRequestId: crypto.randomUUID(),
    packageUploadId: up.id,
  });
  const saved = await api.saveSubmission(draft.id, {
    revision: 1,
    packageUploadId: up.id,
    repository: "https://github.com/author/plugin",
  });
  const pending = await api.submitSubmission(saved.id, saved.revision);
  await api.reviewSubmission(pending.id, {
    revision: pending.revision,
    decision: "approve",
    comment: "",
  });
  function Probe() {
    const location = useLocation();
    return <p data-testid="location">{location.pathname + location.search}</p>;
  }
  render(
    <MemoryRouter initialEntries={["/submissions"]}>
      <UiProvider>
        <ApiProvider api={api}>
          <QueryClientProvider client={createQueryClient()}>
            <Routes>
              <Route path="/submissions" element={<SubmissionsPage />} />
              <Route path="/submissions/new" element={<Probe />} />
            </Routes>
          </QueryClientProvider>
        </ApiProvider>
      </UiProvider>
    </MemoryRouter>
  );
  const release = await screen.findByRole("button", { name: "发布新版本" });
  expect(screen.queryByRole("button", { name: "继续编辑" })).toBeNull();
  fireEvent.click(release);
  expect((await screen.findByTestId("location")).textContent).toBe(
    "/submissions/new?plugin=example.reader"
  );
});

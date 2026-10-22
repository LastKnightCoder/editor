// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { UiProvider } from "@tau/ui";
import { ApiProvider, createQueryClient } from "../app/api";
import { createMockApi } from "../api/mock/mockApi";
import { PortalApiError } from "../api/errors";
import type { PortalApi } from "../api/types";
import { NewSubmissionPage } from "./NewSubmissionPage";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

function Probe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname + location.search}</p>;
}

/** prepare 在渲染与计数之前预置数据（如先登记一个插件） */
async function setup(path = "/submissions/new", prepare?: (api: PortalApi) => Promise<void>) {
  const api = createMockApi();
  await prepare?.(api);
  const create = vi.spyOn(api, "createSubmission");
  const { container } = render(
    <MemoryRouter initialEntries={[path]}>
      <UiProvider>
        <ApiProvider api={api}>
          <QueryClientProvider client={createQueryClient()}>
            <Routes>
              <Route path="/submissions/new" element={<NewSubmissionPage />} />
              <Route path="/submissions" element={<Probe />} />
              <Route path="/submissions/:id" element={<Probe />} />
            </Routes>
          </QueryClientProvider>
        </ApiProvider>
      </UiProvider>
    </MemoryRouter>
  );
  const drop = () =>
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(["x"], "reader.zip")] },
    });
  return { api, create, drop };
}
/** 先走一次普通「发布新插件」，让模拟后端登记 example.reader */
async function registerExampleReader(api: PortalApi) {
  const ticket = await api.createUpload({ fileName: "p.zip", size: 1 });
  const up = await api.sendUpload(ticket, new Blob(["x"]), () => undefined).result;
  await api.createSubmission({ clientRequestId: crypto.randomUUID(), packageUploadId: up.id });
}

it("进入新建页不创建草稿；包通过校验后才创建并跳转详情", async () => {
  const { api, create, drop } = await setup();
  await screen.findByText("发布新插件");
  expect(create).not.toHaveBeenCalled();
  expect((await api.listSubmissionGroups()).groups).toHaveLength(0);
  drop();
  const probe = await screen.findByTestId("location");
  expect(create).toHaveBeenCalledTimes(1);
  const groups = (await api.listSubmissionGroups()).groups;
  expect(groups).toHaveLength(1);
  expect(groups[0].submissions[0].hasPackage).toBe(true);
  expect(probe.textContent).toBe(`/submissions/${groups[0].submissions[0].id}`);
});

it("发布新版本模式：标题指向目标插件，包内 ID 不符时提示且不创建", async () => {
  const { create, drop } = await setup("/submissions/new?plugin=other.plugin");
  await screen.findByText(/为 other\.plugin 发布新版本/);
  drop();
  await screen.findByText(/不是 other\.plugin 的新版本/);
  expect(create).not.toHaveBeenCalled();
  expect(screen.queryByTestId("location")).toBeNull();
});

it("发布新版本模式：包匹配且插件已登记时草稿预绑定该插件", async () => {
  const { api, create, drop } = await setup(
    "/submissions/new?plugin=example.reader",
    registerExampleReader
  );
  await screen.findByText(/为 example\.reader 发布新版本/);
  drop();
  await screen.findByTestId("location");
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  expect(create.mock.calls[0][0]).toMatchObject({ pluginId: "example.reader" });
  const { groups } = await api.listSubmissionGroups();
  expect(groups).toHaveLength(1);
  expect(groups[0].pluginId).toBe("example.reader");
  expect(groups[0].submissions).toHaveLength(2);
});

it("发布新版本模式：目标插件未登记时服务端拒绝，页面提示并可重试", async () => {
  const { create, drop } = await setup("/submissions/new?plugin=example.reader");
  await screen.findByText(/为 example\.reader 发布新版本/);
  drop();
  await screen.findByText("插件不存在或不属于当前账号");
  expect(create).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId("location")).toBeNull();
  expect(screen.getByRole("button", { name: "重试创建" })).toBeTruthy();
});

it("创建达到额度时显示管理入口而非重试按钮", async () => {
  const { create, drop } = await setup();
  create.mockRejectedValueOnce(new PortalApiError(409, "LIMIT_EXCEEDED", "请先处理未完成的提交"));
  drop();
  await screen.findByText("未完成的提交已达上限");
  expect(screen.getByText("请先处理未完成的提交")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "重试创建" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "管理我的提交" }));
  expect((await screen.findByTestId("location")).textContent).toBe("/submissions");
  expect(create).toHaveBeenCalledTimes(1);
});

it("网络失败仍可复用同一请求和上传重试创建", async () => {
  const { create, drop } = await setup();
  create.mockRejectedValueOnce(new PortalApiError(0, "NETWORK_ERROR", "网络连接中断"));
  drop();
  await screen.findByText("网络连接中断");
  fireEvent.click(screen.getByRole("button", { name: "重试创建" }));
  await screen.findByTestId("location");
  expect(create).toHaveBeenCalledTimes(2);
  expect(create.mock.calls[1][0]).toEqual(create.mock.calls[0][0]);
});

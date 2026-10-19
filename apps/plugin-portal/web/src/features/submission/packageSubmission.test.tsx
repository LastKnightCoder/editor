// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { UiProvider } from "@tau/ui";
import { ApiProvider, createQueryClient, queryKeys } from "../../app/api";
import { createMockApi } from "../../api/mock/mockApi";
import { SubmissionView } from "./SubmissionView";
import { PortalApiError } from "../../api/errors";
import { runUpload } from "./uploadFlow";
import { content } from "../../api/mock/samples";
import type { PortalApi } from "../../api/types";

afterEach(cleanup);
async function setup(pending = false) {
  const api = createMockApi(),
    client = createQueryClient();
  const draft = await api.createSubmission(crypto.randomUUID());
  let initial = draft;
  if (pending) {
    const ticket = await api.createUpload({ fileName: "p.zip", size: 1 });
    const up = await api.sendUpload(ticket, new Blob(["x"]), () => {}).result;
    const saved = await api.saveSubmission(draft.id, {
      revision: 1,
      packageUploadId: up.id,
      repository: "https://github.com/author/plugin",
    });
    initial = await api.submitSubmission(saved.id, saved.revision);
  }
  client.setQueryData(queryKeys.submission(draft.id), initial);
  function Page() {
    const q = useQuery({
      queryKey: queryKeys.submission(draft.id),
      queryFn: () => api.getSubmission(draft.id),
    });
    return q.data ? <SubmissionView submission={q.data} /> : null;
  }
  render(
    <MemoryRouter>
      <UiProvider>
        <ApiProvider api={api}>
          <QueryClientProvider client={client}>
            <Page />
          </QueryClientProvider>
        </ApiProvider>
      </UiProvider>
    </MemoryRouter>
  );
  return { api, draft, client };
}
describe("ZIP资料提交交互", () => {
  it("其他窗口提交后只展示已冻结包，不把本地未保存包当成提交内容", async () => {
    const { client, draft } = await setup();
    fireEvent.change(screen.getByLabelText("插件ZIP"), {
      target: { files: [new File(["x"], "local.zip")] },
    });
    await screen.findByText("整理阅读摘录");
    act(() =>
      client.setQueryData(queryKeys.submission(draft.id), {
        ...draft,
        status: "pending_review",
        revision: 2,
        canEdit: false,
        content: {
          ...content,
          readme: "# 已冻结的说明",
          manifest: { ...content.manifest, name: "已冻结版本" },
        },
      })
    );
    await screen.findByText("已冻结的说明");
    expect(screen.queryByLabelText("插件ZIP")).toBeNull();
    expect(screen.queryByRole("button", { name: "保留本地修改" })).toBeNull();
  });
  it("只上传ZIP与关联仓库即可提交，README只读，无截图或介绍输入", async () => {
    const { api, draft } = await setup();
    expect(screen.queryByLabelText("简介")).toBeNull();
    expect(screen.queryByLabelText("截图")).toBeNull();
    fireEvent.change(screen.getByLabelText("插件ZIP"), {
      target: { files: [new File(["x"], "reader.zip")] },
    });
    await screen.findByText("整理阅读摘录");
    fireEvent.change(screen.getByLabelText("源码仓库"), {
      target: { value: "https://github.com/author/plugin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交审核" }));
    await screen.findByLabelText("反馈内容");
    const record = await api.getSubmission(draft.id);
    expect(record.content?.readme).toBe(content.readme);
    expect(record.status).toBe("pending_review");
    expect(screen.queryByLabelText("插件ZIP")).toBeNull();
  });
  it("待审详情在站内发送反馈，不要求外部地址", async () => {
    const { api, draft } = await setup(true);
    fireEvent.change(screen.getByLabelText("反馈内容"), {
      target: { value: "请问如何补充使用步骤？" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    await screen.findByText("请问如何补充使用步骤？");
    expect((await api.listFeedback(draft.id, null)).items).toHaveLength(1);
    expect(screen.queryByLabelText("反馈地址")).toBeNull();
  });
  it("仓库格式不对或版本号不高于已发布版本时挡住提交", async () => {
    const { api } = await setup();
    vi.spyOn(api, "listReleases").mockResolvedValue({
      items: [
        {
          id: "r1",
          pluginId: content.manifest.id,
          version: "1.0.0",
          state: "published",
          sha256: "",
          size: 1,
          error: null,
          publishedAt: "2026-10-01",
          downloadUrl: null,
          manifest: content.manifest,
        },
      ],
      nextCursor: null,
    });
    fireEvent.change(screen.getByLabelText("插件ZIP"), {
      target: { files: [new File(["x"], "reader.zip")] },
    });
    await screen.findByText("已发布 v1.0.0，请提高版本号后重新打包");
    fireEvent.change(screen.getByLabelText("源码仓库"), { target: { value: "github.com/a" } });
    expect(screen.getByText("格式为 https://github.com/作者/仓库")).toBeTruthy();
    expect((screen.getByRole("button", { name: "提交审核" }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });
  it("要求修改后页顶显示审核意见，并能直接回到上传", async () => {
    const reviewerApi = createMockApi({ reviewer: true });
    const draft = await reviewerApi.createSubmission(crypto.randomUUID());
    const ticket = await reviewerApi.createUpload({ fileName: "p.zip", size: 1 });
    const up = await reviewerApi.sendUpload(ticket, new Blob(["x"]), () => {}).result;
    const saved = await reviewerApi.saveSubmission(draft.id, {
      revision: 1,
      packageUploadId: up.id,
      repository: "https://github.com/author/plugin",
    });
    const pending = await reviewerApi.submitSubmission(saved.id, saved.revision);
    await reviewerApi.reviewSubmission(pending.id, {
      revision: pending.revision,
      decision: "request_changes",
      comment: "请补充配置步骤",
    });
    const changed = await reviewerApi.getSubmission(pending.id);
    const client = createQueryClient();
    client.setQueryData(queryKeys.submission(changed.id), changed);
    render(
      <MemoryRouter>
        <UiProvider>
          <ApiProvider api={reviewerApi}>
            <QueryClientProvider client={client}>
              <SubmissionView submission={changed} />
            </QueryClientProvider>
          </ApiProvider>
        </UiProvider>
      </MemoryRouter>
    );
    await screen.findByText("请补充配置步骤");
    expect(screen.getByRole("button", { name: "上传修改后的包" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "重新提交审核" })).toBeTruthy();
    expect(screen.queryByRole("radiogroup", { name: "审核决定" })).toBeNull();
  });
  it("版本冲突保留本地仓库输入，要求用户确认", async () => {
    const { api, draft } = await setup();
    const save = api.saveSubmission.bind(api);
    await save(draft.id, {
      revision: 1,
      packageUploadId: null,
      repository: "https://github.com/other/plugin",
    });
    fireEvent.change(screen.getByLabelText("源码仓库"), {
      target: { value: "https://github.com/local/plugin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await screen.findByRole("button", { name: "保留本地修改" });
    expect((screen.getByLabelText("源码仓库") as HTMLInputElement).value).toBe(
      "https://github.com/local/plugin"
    );
    expect((screen.getByRole("button", { name: "保存草稿" }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });
  it.each(["UPLOAD_STATE_CONFLICT", "UPLOAD_EXPIRED"] as const)("上传%s有明确处理", async code => {
    const get = vi.fn(async () => ({ id: "u", status: "ready", content }));
    const api = {
      createUpload: async () => ({ upload: { id: "u" } }),
      sendUpload: () => ({
        result: Promise.reject(new PortalApiError(409, code, "上传已过期")),
        abort: () => {},
      }),
      getUpload: get,
    } as unknown as PortalApi;
    const result = await runUpload(api, new File(["x"], "x.zip"), {
      signal: new AbortController().signal,
      onPhase: () => {},
    });
    expect(result.type).toBe(code === "UPLOAD_EXPIRED" ? "failed" : "ready");
    expect(get).toHaveBeenCalledTimes(code === "UPLOAD_EXPIRED" ? 0 : 1);
  });
});

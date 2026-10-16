// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { UiProvider } from "@tau/ui";
import { ApiProvider, createQueryClient, queryKeys } from "../../app/api";
import { createMockApi } from "../../api/mock/mockApi";
import { SubmissionView } from "./SubmissionView";

afterEach(cleanup);
async function setup(reviewer = true) {
  const api = createMockApi({ reviewer }),
    client = createQueryClient();
  const d = await api.createSubmission(crypto.randomUUID()),
    ticket = await api.createUpload({ fileName: "p.zip", size: 1 });
  const up = await api.sendUpload(ticket, new Blob(["x"]), () => {}).result;
  const saved = await api.saveSubmission(d.id, {
    revision: 1,
    packageUploadId: up.id,
    repository: "https://github.com/author/plugin",
  });
  const pending = await api.submitSubmission(d.id, saved.revision);
  client.setQueryData(queryKeys.submission(d.id), pending);
  function Page() {
    const q = useQuery({
      queryKey: queryKeys.submission(d.id),
      queryFn: () => api.getSubmission(d.id),
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
  return { api, client, pending };
}
describe("审核操作", () => {
  it("作者看得到审核记录，但没有审核按钮", async () => {
    const { api } = await setup(false);
    await screen.findByText("审核与发布");
    await waitFor(() => expect(screen.queryByRole("button", { name: "批准并发布" })).toBeNull());
    expect((await api.getSession()).reviewer).toBe(false);
  });
  it("批准需要确认，完成后显示发布状态并禁止再次审批", async () => {
    const { api, pending } = await setup();
    const review = vi.spyOn(api, "reviewSubmission");
    fireEvent.click(await screen.findByRole("button", { name: "批准并发布" }));
    expect(review).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "确认" }));
    await screen.findByText("已发布，可下载");
    expect((await api.getSubmission(pending.id)).status).toBe("approved");
    expect(review).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "批准并发布" })).toBeNull();
  });
  it("要求修改必须有原因，作者恢复编辑并可重提", async () => {
    const { api, pending } = await setup();
    const button = await screen.findByRole("button", { name: "要求修改" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("审核意见"), { target: { value: "补充步骤" } });
    fireEvent.click(button);
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "确认" })
    );
    await screen.findByRole("button", { name: "重新提交审核" });
    expect((await api.getSubmission(pending.id)).canEdit).toBe(true);
    expect(await screen.findByText("补充步骤")).toBeTruthy();
  });
  it("确认框打开后修订变化，不能批准另一个修订", async () => {
    const { client, pending } = await setup();
    fireEvent.click(await screen.findByRole("button", { name: "批准并发布" }));
    const dialog = await screen.findByRole("dialog");
    act(() =>
      client.setQueryData(queryKeys.submission(pending.id), {
        ...pending,
        revision: pending.revision + 1,
      })
    );
    await waitFor(() =>
      expect(
        (within(dialog).getByRole("button", { name: "确认" }) as HTMLButtonElement).disabled
      ).toBe(true)
    );
  });
});

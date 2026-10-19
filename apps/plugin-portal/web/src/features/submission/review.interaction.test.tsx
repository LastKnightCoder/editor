// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { UiProvider } from "@tau/ui";
import { ApiProvider, createQueryClient, queryKeys } from "../../app/api";
import { createMockApi } from "../../api/mock/mockApi";
import { ReviewView } from "./ReviewView";

afterEach(cleanup);
async function setup() {
  const api = createMockApi({ reviewer: true }),
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
    return q.data ? <ReviewView submission={q.data} neighbors={null} /> : null;
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
  it("首次发布没有可对比版本时明确说明", async () => {
    await setup();
    await screen.findByText(/这是该插件的首次发布/);
  });
  it("批准需要先选决定再二次确认，完成后显示发布结果", async () => {
    const { api, pending } = await setup();
    const review = vi.spyOn(api, "reviewSubmission");
    const submit = await screen.findByRole("button", { name: "选择一个决定" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /批准并发布/ }));
    fireEvent.click(screen.getByRole("button", { name: "批准并发布" }));
    expect(review).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "确认" }));
    await screen.findByText("写入插件中心目录");
    expect((await api.getSubmission(pending.id)).status).toBe("approved");
    expect(review).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("radiogroup", { name: "审核决定" })).toBeNull();
  });
  it("要求修改必须写原因，可用预设短语，直接退回作者", async () => {
    const { api, pending } = await setup();
    fireEvent.click(await screen.findByRole("radio", { name: /要求修改/ }));
    const button = screen.getByRole("button", { name: "要求修改" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "README 缺少配置或使用说明" }));
    expect((screen.getByLabelText("审核意见") as HTMLTextAreaElement).value).toBe(
      "README 缺少配置或使用说明"
    );
    fireEvent.change(screen.getByLabelText("审核意见"), { target: { value: "补充步骤" } });
    fireEvent.click(button);
    await screen.findByText("补充步骤");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((await api.getSubmission(pending.id)).canEdit).toBe(true);
  });
  it("确认框打开后修订变化，不能批准另一个修订", async () => {
    const { client, pending } = await setup();
    fireEvent.click(await screen.findByRole("radio", { name: /批准并发布/ }));
    fireEvent.click(screen.getByRole("button", { name: "批准并发布" }));
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

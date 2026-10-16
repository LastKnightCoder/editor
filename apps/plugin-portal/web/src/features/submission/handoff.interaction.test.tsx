// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ApiProvider, createQueryClient } from "../../app/api";
import { createMockApi, memoryStorage } from "../../api/mock/mockApi";
import { createSampleDb } from "../../api/mock/samples";
import { PortalApiError } from "../../api/errors";
import { useDraftEditor } from "./useDraftEditor";
import type { Submission } from "../../../../contracts";

vi.mock("@tau/ui", () => ({ toast: { success: vi.fn() } }));
afterEach(() => {
  cleanup();
  localStorage.clear();
});

function setup() {
  const { api } = createMockApi({ storage: memoryStorage(), timing: { latencyMs: 0 } });
  const initial = createSampleDb().submissions.find(s => s.id === "sub_0003")!;
  const queryClient = createQueryClient();
  function Editor() {
    const editor = useDraftEditor(initial);
    return (
      <>
        <input
          aria-label="简介"
          value={editor.state.values.listing.summary}
          onChange={e => editor.patchListing({ summary: e.target.value })}
        />
        <button disabled={!editor.canSave} onClick={() => void editor.save()}>
          保存
        </button>
        <button onClick={() => void editor.submit()}>提交</button>
        <span data-testid="field">{editor.fieldErrors.summary}</span>
        <span data-testid="remote">{editor.state.remote?.revision}</span>
        <span data-testid="error">{editor.submitError?.code ?? editor.saveError?.code}</span>
      </>
    );
  }
  const mount = () =>
    render(
      <ApiProvider api={api}>
        <QueryClientProvider client={queryClient}>
          <Editor />
        </QueryClientProvider>
      </ApiProvider>
    );
  return { api, initial, mount, queryClient };
}

describe("草稿交接交互", () => {
  it("点击保存后将服务端fields定位到输入项，修改字段后清除错误", async () => {
    const { api, mount } = setup();
    vi.spyOn(api, "saveSubmission").mockRejectedValue(
      new PortalApiError(400, "INVALID_INPUT", "检查资料", {
        fields: { summary: "简介不符合要求" },
      })
    );
    mount();
    fireEvent.change(screen.getByLabelText("简介"), { target: { value: "我的修改" } });
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => expect(screen.getByTestId("field").textContent).toBe("简介不符合要求"));
    fireEvent.change(screen.getByLabelText("简介"), { target: { value: "再次修改" } });
    expect(screen.getByTestId("field").textContent).toBe("");
  });
  it("旧revision保存冲突会读取服务器版本但保留用户输入，不自动覆盖", async () => {
    const { api, initial, mount } = setup();
    vi.spyOn(api, "saveSubmission").mockRejectedValue(
      new PortalApiError(409, "REVISION_CONFLICT", "版本变化")
    );
    const latest: Submission = {
      ...initial,
      revision: initial.revision + 1,
      listing: { ...initial.listing, summary: "另一窗口" },
    };
    vi.spyOn(api, "getSubmission").mockResolvedValue(latest);
    mount();
    fireEvent.change(screen.getByLabelText("简介"), { target: { value: "本地修改" } });
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() =>
      expect(screen.getByTestId("remote").textContent).toBe(String(latest.revision))
    );
    expect((screen.getByLabelText("简介") as HTMLInputElement).value).toBe("本地修改");
    expect((screen.getByText("保存") as HTMLButtonElement).disabled).toBe(true);
  });
  it("重复版本错误不会被当成旧revision读取重试", async () => {
    const { api, mount } = setup();
    vi.spyOn(api, "submitSubmission").mockRejectedValue(
      new PortalApiError(409, "VERSION_ALREADY_SUBMITTED", "查看已有提交")
    );
    const read = vi.spyOn(api, "getSubmission");
    mount();
    fireEvent.click(screen.getByText("提交"));
    await waitFor(() =>
      expect(screen.getByTestId("error").textContent).toBe("VERSION_ALREADY_SUBMITTED")
    );
    expect(read).not.toHaveBeenCalled();
  });
  it("提交阶段返回字段错误也会定位到输入项", async () => {
    const { api, mount } = setup();
    vi.spyOn(api, "submitSubmission").mockRejectedValue(
      new PortalApiError(400, "INVALID_INPUT", "检查资料", {
        fields: { "listing.summary": "请补充简介" },
      })
    );
    mount();
    fireEvent.click(screen.getByText("提交"));
    await waitFor(() => expect(screen.getByTestId("field").textContent).toBe("请补充简介"));
  });
});

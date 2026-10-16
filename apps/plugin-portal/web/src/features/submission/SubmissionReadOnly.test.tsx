import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMockApi, memoryStorage } from "../../api/mock/mockApi";
import { createSampleDb } from "../../api/mock/samples";
import { ApiProvider, createQueryClient } from "../../app/api";
import { SubmissionReadOnly } from "./SubmissionReadOnly";

function renderPending() {
  const submission = createSampleDb().submissions.find(item => item.status === "pending_review")!;
  const { api } = createMockApi({ storage: memoryStorage() });
  return renderToStaticMarkup(
    <ApiProvider api={api}>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter>
          <SubmissionReadOnly submission={submission} />
        </MemoryRouter>
      </QueryClientProvider>
    </ApiProvider>
  );
}

describe("待审核只读页", () => {
  it("显示待审核状态与冻结说明，没有任何输入或提交控件", () => {
    const html = renderPending();
    expect(html).toContain("待审核");
    expect(html).toContain("已冻结");
    expect(html).not.toMatch(/<input|<textarea/);
    expect(html).not.toContain("提交审核");
    expect(html).not.toContain("保存草稿");
  });

  it("终点只到待审核：不出现批准或发布成功", () => {
    const html = renderPending();
    expect(html).not.toMatch(/已批准|已通过审核|已发布|发布成功|上架/);
  });
});

// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { UiProvider } from "@tau/ui";
import type {
  CenterRelease,
  PackageManifest,
  ReviewDetails,
  Submission,
} from "../../../../contracts";
import { centerRelease } from "../../../../../../tests/fixtures/plugins/center";
import { ApiProvider, createQueryClient, queryKeys } from "../../app/api";
import { createMockApi } from "../../api/mock/mockApi";
import { ReviewView } from "./ReviewView";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const target = (minAppVersion: string) => ({
  minAppVersion,
  required: ["pages.v1" as const],
  optional: [],
});
function portableManifest(version: string): PackageManifest {
  const base = centerRelease(version).content.manifest;
  if (base.formatVersion !== 3) throw new Error("样本应为格式 3");
  return { ...base, targets: { android: target("0.3.0"), ios: target("0.3.0") } };
}

async function setup({
  history = [],
  status,
  reviews,
}: {
  history?: CenterRelease[];
  status?: Submission["status"];
  reviews?: (pending: Submission) => ReviewDetails;
} = {}) {
  const api = createMockApi({ reviewer: true, centerReleases: history });
  const client = createQueryClient();
  const ticket = await api.createUpload({ fileName: "p.zip", size: 1 });
  const up = await api.sendUpload(ticket, new Blob(["x"]), () => {}).result;
  const draft = await api.createSubmission({
    clientRequestId: crypto.randomUUID(),
    packageUploadId: up.id,
  });
  const saved = await api.saveSubmission(draft.id, {
    revision: 1,
    packageUploadId: up.id,
    repository: "https://github.com/author/plugin",
  });
  const submitted = await api.submitSubmission(draft.id, saved.revision);
  if (!submitted.content) throw new Error("模拟提交缺少包内容");
  const pending: Submission = {
    ...submitted,
    ...(status ? { status } : {}),
    content: { ...submitted.content, manifest: portableManifest("1.1.0") },
  };
  vi.spyOn(api, "getSubmission").mockResolvedValue(pending);
  if (reviews) vi.spyOn(api, "getReviews").mockResolvedValue(reviews(pending));
  client.setQueryData(queryKeys.submission(pending.id), pending);
  function Page() {
    const q = useQuery({
      queryKey: queryKeys.submission(pending.id),
      queryFn: () => api.getSubmission(pending.id),
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
const approveButton = () => screen.getByRole("button", { name: "批准并发布" }) as HTMLButtonElement;

it("跨端包可直接批准，不要求审核者测试或填写平台验证记录", async () => {
  const { api } = await setup();
  const review = vi.spyOn(api, "reviewSubmission");
  fireEvent.click(await screen.findByRole("radio", { name: /批准并发布/ }));
  expect(screen.queryByRole("checkbox", { name: /上验证此版本/ })).toBeNull();
  expect(screen.queryByRole("textbox", { name: /验证说明/ })).toBeNull();
  expect(approveButton().disabled).toBe(false);
  fireEvent.click(approveButton());
  fireEvent.click(await screen.findByRole("button", { name: "确认" }));
  await waitFor(() => expect(review).toHaveBeenCalled());
  expect(review.mock.calls[0][1]).toMatchObject({
    decision: "approve",
  });
  expect(review.mock.calls[0][1]).not.toHaveProperty("systemReviewConfirmed");
  expect(review.mock.calls[0][1]).not.toHaveProperty("platformEvidence");
});

it("要求修改不展示也不提交平台证据", async () => {
  const { api } = await setup();
  const review = vi.spyOn(api, "reviewSubmission");
  fireEvent.click(await screen.findByRole("radio", { name: /要求修改/ }));
  expect(screen.queryByText(/已验证 \d\/\d/)).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "审核意见" }), {
    target: { value: "iOS 上返回无效" },
  });
  fireEvent.click(screen.getByRole("button", { name: "要求修改" }));
  await waitFor(() => expect(review).toHaveBeenCalled());
  expect(review.mock.calls[0][1]).not.toHaveProperty("platformEvidence");
});

it("作者更新修订后，已打开的批准确认不能提交旧版本", async () => {
  const { api, client, pending } = await setup();
  const review = vi.spyOn(api, "reviewSubmission");
  fireEvent.click(await screen.findByRole("radio", { name: /批准并发布/ }));
  fireEvent.click(approveButton());
  const confirm = await screen.findByRole("button", { name: "确认" });
  act(() =>
    client.setQueryData(queryKeys.submission(pending.id), {
      ...pending,
      revision: pending.revision + 1,
    })
  );
  await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(true));
  fireEvent.click(confirm);
  expect(review).not.toHaveBeenCalled();
});

it("版本对比用 v2 历史找上一版并列出平台声明变化；包预览只读展示平台", async () => {
  const previous = centerRelease("1.0.0", "r-prev");
  await setup({ history: [previous] });
  expect(await screen.findByText("v1.0.0 → v1.1.0")).toBeTruthy();
  const diff = screen.getByRole("heading", { name: "平台声明变化" }).parentElement?.parentElement;
  if (!diff) throw new Error("缺少平台声明变化面板");
  expect(within(diff).getByText("iOS")).toBeTruthy();
  expect(within(diff).getByText("新增平台")).toBeTruthy();
  expect(within(diff).getByText("最低 Tau 0.2.0 → 0.3.0")).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "平台" }));
  expect(await screen.findByText(/平台声明来自包内 manifest，只读/)).toBeTruthy();
  expect(screen.getByRole("region", { name: "iOS目标" })).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: /最低/ })).toBeNull();
});

it("已处理的提交展示审核决定，不展示平台验证记录", async () => {
  await setup({
    status: "approved",
    reviews: pending => ({
      release: null,
      reviews: [
        {
          id: "review-1",
          revision: pending.revision,
          packageUploadId: pending.packageUploadId ?? "",
          sha256: "a".repeat(64),
          manifest: portableManifest("1.1.0"),
          repository: pending.repository,
          commit: "c".repeat(40),
          reviewer: { id: "r", login: "reviewer", avatarUrl: "" },
          decision: "approve",
          comment: "允许上架",
          createdAt: "2026-10-23T00:00:00Z",
        },
      ],
    }),
  });
  expect(await screen.findByText("允许上架")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "平台验证" })).toBeNull();
  expect(screen.queryByRole("checkbox", { name: /上验证此版本/ })).toBeNull();
});

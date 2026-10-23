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

it("批准需逐个声明平台勾选并填写说明，请求只带声明平台的证据", async () => {
  const { api } = await setup();
  const review = vi.spyOn(api, "reviewSubmission");
  fireEvent.click(await screen.findByRole("radio", { name: /批准并发布/ }));
  expect(screen.getByText("已验证 0/2")).toBeTruthy();
  expect(approveButton().disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: "已在Android上验证此版本" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Android验证说明" }), {
    target: { value: " Pixel 9 / Android 16 " },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "已在iOS上验证此版本" }));
  // 勾选但未写说明仍不能批准
  expect(approveButton().disabled).toBe(true);
  fireEvent.change(screen.getByRole("textbox", { name: "iOS验证说明" }), {
    target: { value: "iPhone 15 / iOS 26.3" },
  });
  expect(approveButton().disabled).toBe(false);
  fireEvent.click(approveButton());
  fireEvent.click(await screen.findByRole("button", { name: "确认" }));
  await waitFor(() => expect(review).toHaveBeenCalled());
  expect(review.mock.calls[0][1]).toMatchObject({
    decision: "approve",
    platformEvidence: {
      android: { verified: true, note: "Pixel 9 / Android 16" },
      ios: { verified: true, note: "iPhone 15 / iOS 26.3" },
    },
  });
  expect(review.mock.calls[0][1]).not.toHaveProperty("systemReviewConfirmed");
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

it("修订变化后已填写的平台证据作废", async () => {
  const { client, pending } = await setup();
  fireEvent.click(await screen.findByRole("radio", { name: /批准并发布/ }));
  for (const label of ["Android", "iOS"]) {
    fireEvent.click(screen.getByRole("checkbox", { name: `已在${label}上验证此版本` }));
    fireEvent.change(screen.getByRole("textbox", { name: `${label}验证说明` }), {
      target: { value: "已验证" },
    });
  }
  expect(approveButton().disabled).toBe(false);
  act(() =>
    client.setQueryData(queryKeys.submission(pending.id), {
      ...pending,
      revision: pending.revision + 1,
    })
  );
  await waitFor(() => expect(approveButton().disabled).toBe(true));
  expect(screen.getByText("已验证 0/2")).toBeTruthy();
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

it("已处理的提交只读展示审核时提交的平台证据", async () => {
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
          comment: "",
          createdAt: "2026-10-23T00:00:00Z",
          platformEvidence: {
            android: { verified: true, note: "Pixel 9" },
            ios: { verified: true, note: "iPhone 15" },
          },
        },
      ],
    }),
  });
  expect(await screen.findByText("Pixel 9")).toBeTruthy();
  expect(screen.getByText("iPhone 15")).toBeTruthy();
  expect(screen.queryByRole("checkbox", { name: /上验证此版本/ })).toBeNull();
});

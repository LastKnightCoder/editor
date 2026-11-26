import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import { useChatWorkspaceI18n } from "../workspace.i18n";
import { WorkspaceCheckoutError } from "../workspace-errors";
import { useWorkspaceBranches, useWorkspaceCheckout, useWorkspaceInfo } from "../workspaceQueries";

const transport = vi.hoisted(() => ({
  info: vi.fn(async () => ({ ok: true, info: { path: "/repo", missing: false } })),
  branches: vi.fn(async () => ({ ok: true, branches: ["main", "feature/raw"] })),
  checkout: vi.fn<() => Promise<{ ok: boolean; error?: string }>>(async () => ({ ok: true })),
}));
vi.mock("@/commands/piSession", () => ({
  piWorkspaceInfo: transport.info,
  piWorkspaceBranches: transport.branches,
  piWorkspaceCheckout: transport.checkout,
}));

let current:
  | {
      info: ReturnType<typeof useWorkspaceInfo>;
      branches: ReturnType<typeof useWorkspaceBranches>;
      checkout: ReturnType<typeof useWorkspaceCheckout>;
    }
  | undefined;
function Harness() {
  useChatWorkspaceI18n();
  current = {
    info: useWorkspaceInfo("/repo"),
    branches: useWorkspaceBranches("/repo", true),
    checkout: useWorkspaceCheckout("/repo"),
  };
  return null;
}
function state() {
  if (!current) throw new Error("workspace hooks not mounted");
  return current;
}
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
const flush = () => act(async () => vi.advanceTimersByTimeAsync(0));
beforeEach(async () => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  current = undefined;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>
    )
  );
  await flush();
});
afterEach(() => {
  act(() => root.unmount());
  client.clear();
  host.remove();
  desktopLocaleSource.setLocale("zh-CN");
  vi.useRealTimers();
});

it("切换语言保留目录缓存与在途切分支，不重新查询或提交", async () => {
  const pending = Promise.withResolvers<{ ok: boolean }>();
  transport.checkout.mockImplementationOnce(() => pending.promise);
  const info = state().info.data;
  const branches = state().branches.data;
  expect(info).toMatchObject({ path: "/repo" });
  expect(branches).toContain("feature/raw");
  let outcome!: Promise<unknown>;
  act(() => {
    outcome = state().checkout.mutateAsync("feature/raw");
  });
  await flush();
  expect(state().checkout.isPending).toBe(true);
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    await flush();
    expect(state().info.data).toBe(info);
    expect(state().branches.data).toBe(branches);
    expect(state().checkout.isPending).toBe(true);
    expect(transport.info).toHaveBeenCalledTimes(1);
    expect(transport.branches).toHaveBeenCalledTimes(1);
    expect(transport.checkout).toHaveBeenCalledExactlyOnceWith("/repo", "feature/raw");
  }
  await act(async () => {
    pending.resolve({ ok: true });
    await outcome;
  });
  await flush();
  expect(state().checkout.isSuccess).toBe(true);
});

it("只有本机缺失诊断的失败可翻译，同文服务诊断仍保留外部错误身份", async () => {
  transport.checkout.mockResolvedValueOnce({ ok: false });
  let local: unknown;
  await act(async () => {
    local = await state()
      .checkout.mutateAsync("main")
      .catch(error => error);
  });
  expect(local).toBeInstanceOf(WorkspaceCheckoutError);
  transport.checkout.mockResolvedValueOnce({ ok: false, error: "切换分支失败" });
  let remote: unknown;
  await act(async () => {
    remote = await state()
      .checkout.mutateAsync("main")
      .catch(error => error);
  });
  expect(remote).toBeInstanceOf(Error);
  expect(remote).not.toBeInstanceOf(WorkspaceCheckoutError);
});

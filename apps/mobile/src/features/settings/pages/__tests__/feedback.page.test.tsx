import { createStorageRuntime } from "../../__tests__/storageProviders";
import { MobilePluginsContext } from "../../../../app/plugins/context";
let storageRuntime: Awaited<ReturnType<typeof createStorageRuntime>>;
// 反馈页集成测试：经 settingsModule 路由入栈，覆盖成功/失败提交与幂等请求 ID。

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageHost, PageQueryProvider, RouterProvider, getNavigator } from "../../../../router";
import { AppContext, type AppContextValue } from "../../../../app/AppContext";
import "../../../cards/pages/home.page";
import "../settingsModule.page";

const submitFeedback = vi.hoisted(() => vi.fn());
vi.mock("../../../../services/appFeedback", () => ({
  submitFeedback,
  stageFeedbackImage: vi.fn(),
  discardFeedbackImage: vi.fn(),
  APP_FEEDBACK_LIMITS: { message: 4000, contact: 200, images: 3, imageBytes: 1536 * 1024 },
}));
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("../../../../components/toast", () => ({
  toast: { success: toastSuccess, info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "0.2.8" }));

const appStub = {
  syncSettings: {
    safeSetting: null,
    isSavingSetting: false,
    isSyncing: false,
    updateSetting: () => {},
  },
  bootstrap: { databases: null, versions: null },
  resourceSync: { progress: null, statusFile: null, isResourceSyncing: false },
  handleSwitchDatabase: async () => {},
  handleSaveSetting: async () => {},
  handleCheckVersions: async () => ({}),
  handleSyncUpload: async () => ({}),
  handleSyncDownload: async () => ({}),
  handleResourceSyncRefresh: async () => {},
  handleResourceSyncStart: async () => ({}),
  handleResourceSyncRetryFailed: async () => ({}),
  handleResourceSyncCancel: async () => ({}),
} as unknown as AppContextValue;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function mountApp(): void {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <RouterProvider rootKey="home">
        <PageQueryProvider>
          <MobilePluginsContext.Provider value={storageRuntime}>
            <AppContext.Provider value={appStub}>
              <PageHost rootContent={<div data-testid="root" />} />
            </AppContext.Provider>
          </MobilePluginsContext.Provider>
        </PageQueryProvider>
      </RouterProvider>
    );
  });
}

function activeTitle(): string {
  return document.querySelector('[data-page-active="true"] h1')?.textContent ?? "";
}

function activeButton(text: string): HTMLElement | null {
  const nodes = [
    ...document.querySelectorAll(
      '[data-page-active="true"] button, [data-page-active="true"] [role="button"]'
    ),
  ] as HTMLElement[];
  return nodes.find(node => node.textContent?.includes(text)) ?? null;
}

function activeTextarea(): HTMLTextAreaElement {
  return document.querySelector('[data-page-active="true"] textarea') as HTMLTextAreaElement;
}

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor 超时");
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 25));
    });
  }
}

async function openFeedbackPage(): Promise<void> {
  act(() => {
    getNavigator().push("settingsModule", { module: "feedback" });
  });
  await waitFor(() => activeTitle() === "反馈");
}

async function clickSubmit(): Promise<void> {
  // 提交的 Promise 链在同一次 act 内 resolve，避免状态更新落在 act 外告警
  await act(async () => {
    activeButton("发送反馈")!.click();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

async function submitWithMessage(message: string): Promise<void> {
  setInputValue(activeTextarea(), message);
  await waitFor(() => !activeButton("发送反馈")!.hasAttribute("disabled"));
  await clickSubmit();
  await waitFor(() => submitFeedback.mock.calls.length > 0);
}

describe("反馈页", () => {
  beforeEach(async () => {
    storageRuntime = await createStorageRuntime();
    localStorage.clear();
    submitFeedback.mockReset();
    toastSuccess.mockReset();
    window.history.replaceState(null, "");
    mountApp();
  });

  afterEach(async () => {
    await storageRuntime.dispose();
    act(() => root?.unmount());
    host?.remove();
    document.body.innerHTML = "";
  });

  it("成功提交后提示并清空草稿", async () => {
    submitFeedback.mockResolvedValue({ ok: true, id: "fb-1" });
    await openFeedbackPage();
    await submitWithMessage("插件启动失败了");

    expect(submitFeedback).toHaveBeenCalledTimes(1);
    const input = submitFeedback.mock.calls[0][0];
    expect(input.kind).toBe("bug");
    expect(input.message).toBe("插件启动失败了");
    expect(input.includeContext).toBe(true);
    expect(input.includeLogs).toBe(false);
    expect(input.clientRequestId).toMatch(/^[\w-]{16,80}$/);
    await waitFor(() => toastSuccess.mock.calls.some(call => call[0] === "反馈已发送，谢谢你"));
    await waitFor(() => activeTextarea().value === "");
    expect(localStorage.getItem("tau-feedback-draft")).toBeNull();
  });

  it("失败保留草稿与请求 ID，原样重试复用同一 ID，改内容后更换", async () => {
    submitFeedback.mockResolvedValue({ ok: false, reason: "server", message: "服务暂不可用" });
    await openFeedbackPage();
    await submitWithMessage("有问题 A");
    expect(submitFeedback).toHaveBeenCalledTimes(1);
    const firstId = submitFeedback.mock.calls[0][0].clientRequestId;

    expect(
      document.querySelector('[data-page-active="true"] [role="alert"]')?.textContent
    ).toContain("服务暂不可用");
    expect(activeTextarea().value).toBe("有问题 A");

    submitFeedback.mockClear();
    await clickSubmit();
    await waitFor(() => submitFeedback.mock.calls.length > 0);
    expect(submitFeedback.mock.calls[0][0].clientRequestId).toBe(firstId);

    submitFeedback.mockClear();
    setInputValue(activeTextarea(), "补充说明");
    await clickSubmit();
    await waitFor(() => submitFeedback.mock.calls.length > 0);
    expect(submitFeedback.mock.calls[0][0].clientRequestId).not.toBe(firstId);
  });

  it("正文为空时不能发送", async () => {
    await openFeedbackPage();
    expect(activeButton("发送反馈")).toBeTruthy();
    expect(activeButton("发送反馈")!.hasAttribute("disabled")).toBe(true);
    expect(submitFeedback).not.toHaveBeenCalled();
  });
});

// settingsModule 页集成测试：二级模块以路由页入栈，
// 验证数据库/资源主页经配置子页往返后返回逐级退栈（而非直接回根页），
// 以及经 Activity 保活原样保留。

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PageHost, RouterProvider, getNavigator } from "../../../../router";
import { AppContext, type AppContextValue } from "../../../../app/AppContext";
import "../../../cards/pages/home.page";
import "../settingsModule.page";

const appStub = {
  syncSettings: {
    safeSetting: null,
    isSavingSetting: false,
    isSyncing: false,
    updateSetting: () => {},
  },
  bootstrap: {
    databases: null,
    versions: null,
  },
  resourceSync: {
    progress: null,
    statusFile: null,
    isResourceSyncing: false,
  },
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
        <AppContext.Provider value={appStub}>
          <PageHost rootContent={<div data-testid="root" />} />
        </AppContext.Provider>
      </RouterProvider>
    );
  });
}

/** 当前激活层（data-page-active）内的标题文本 */
function activeTitle(): string {
  return document.querySelector('[data-page-active="true"] h1')?.textContent ?? "";
}

/** 当前激活层内含指定文本的按钮（含 div[role=button] 的分组行） */
function activeButton(text: string): HTMLElement | null {
  const nodes = [
    ...document.querySelectorAll(
      '[data-page-active="true"] button, [data-page-active="true"] [role="button"]'
    ),
  ] as HTMLElement[];
  return nodes.find(node => node.textContent?.includes(text)) ?? null;
}

/** 当前激活层内 aria-label 精确匹配的按钮（ⓘ 图标按钮无可见文本） */
function activeAriaButton(label: string): HTMLElement | null {
  return document.querySelector(`[data-page-active="true"] button[aria-label="${label}"]`);
}

// jsdom 中 motion 退出动画按真实时间播放，用条件轮询等待最终状态
async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor 超时");
    }
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 25));
    });
  }
}

describe("settingsModule 路由页", () => {
  beforeEach(() => {
    window.history.replaceState(null, "");
    mountApp();
  });

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    document.body.innerHTML = "";
  });

  it("数据库/资源两个主页经配置子页往返后原样保留", async () => {
    // 数据库与同步主页：当前数据库 + 同步状态 + 同步服务
    act(() => {
      getNavigator().push("settingsModule", { module: "database" });
    });
    await waitFor(() => activeTitle() === "数据库与同步");
    expect(activeButton("AliOSS")).toBeTruthy();

    // 点 Github 服务行的 ⓘ 进入「Github 同步」配置子页
    const githubInfo = activeAriaButton("配置Github同步");
    expect(githubInfo).toBeTruthy();
    act(() => {
      githubInfo!.click();
    });
    await waitFor(() => activeTitle() === "Github 同步");
    expect(document.querySelector('[data-page-active="true"]')?.textContent).toContain("凭证");

    // 返回数据库与同步：分组原样保留（Activity 保活，而非重置）
    act(() => {
      getNavigator().goBack("code");
    });
    await waitFor(() => activeTitle() === "数据库与同步");
    expect(activeButton("AliOSS")).toBeTruthy();

    // 资源与存储主页：资源同步 + 存储目标（先等退栈完成再进入）
    act(() => {
      getNavigator().goBack("code");
    });
    await waitFor(
      () => document.querySelector('[data-page-active="true"] [data-testid="root"]') !== null
    );
    act(() => {
      getNavigator().push("settingsModule", { module: "resource" });
    });
    await waitFor(() => activeTitle() === "资源与存储");
    expect(activeButton("本地")).toBeTruthy();
    expect(activeButton("WebDAV")).toBeTruthy();
    act(() => {
      getNavigator().goBack("code");
    });
  });
});

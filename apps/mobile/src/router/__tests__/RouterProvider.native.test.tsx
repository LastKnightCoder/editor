import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RouterProvider, getNavigator } from "../RouterProvider";
import { definePage } from "../definePage";
import { clearPageDefinitionsForTest } from "../registry";
import { clearPageMetasForTest } from "../core/pageMeta";

const native = vi.hoisted(() => ({
  back: undefined as ((event: { canGoBack: boolean }) => void) | undefined,
  close: undefined as ((event: { preventDefault(): void }) => void) | undefined,
  registerBack: vi.fn(),
  registerClose: vi.fn(),
}));
vi.mock("@tauri-apps/api/app", () => ({ onBackButtonPress: native.registerBack }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onCloseRequested: native.registerClose }),
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  native.back = undefined;
  native.close = undefined;
  native.registerBack.mockImplementation(async handler => {
    native.back = handler;
    return {
      unregister: () => {
        native.back = undefined;
      },
    };
  });
  native.registerClose.mockImplementation(async handler => {
    native.close = handler;
    return () => {
      native.close = undefined;
    };
  });
  vi.stubGlobal("__TAURI_INTERNALS__", {});
  clearPageDefinitionsForTest();
  clearPageMetasForTest();
  window.history.replaceState(null, "");
  for (const key of ["home", "detail"]) definePage({ key, params: {}, component: () => null });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount(userAgent: string) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  await act(async () =>
    root.render(
      <RouterProvider rootKey="home">
        <div />
      </RouterProvider>
    )
  );
}
async function nativeBack(action: () => void) {
  await act(async () => {
    const changed = new Promise<void>(resolve =>
      window.addEventListener("popstate", () => resolve(), { once: true })
    );
    action();
    await changed;
  });
  expect(getNavigator().getActiveScreen()?.key).toBe("home");
}

// iPad 上调用 Android 专属监听曾在每次启动时产生 ACL 拒绝。
it.each([
  ["iPad", "Mozilla/5.0 (iPad; CPU OS 26_6 like Mac OS X)"],
  ["桌面模式 iPad", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15"],
  ["iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X)"],
])("%s 跳过 Android 物理返回监听，窗口关闭仍经过页面返回", async (_, userAgent) => {
  await mount(userAgent);
  expect(native.registerBack).not.toHaveBeenCalled();
  await act(async () => getNavigator().push("detail"));
  if (!native.close) throw new Error("窗口关闭监听未建立");
  const preventDefault = vi.fn();
  await nativeBack(() => native.close?.({ preventDefault }));
  expect(preventDefault).toHaveBeenCalledOnce();
});

it("Android 物理返回仍经过页面栈，卸载时注销原生监听", async () => {
  await mount("Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36");
  await act(async () => getNavigator().push("detail"));
  if (!native.back) throw new Error("Android 物理返回监听未建立");
  await nativeBack(() => native.back?.({ canGoBack: true }));
  await act(async () => root.unmount());
  expect(native.back).toBeUndefined();
  expect(native.close).toBeUndefined();
});

it("Android 浏览器不注册原生返回或窗口监听", async () => {
  vi.stubGlobal("__TAURI_INTERNALS__", undefined);
  await mount("Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36");
  expect(native.registerBack).not.toHaveBeenCalled();
  expect(native.registerClose).not.toHaveBeenCalled();
});

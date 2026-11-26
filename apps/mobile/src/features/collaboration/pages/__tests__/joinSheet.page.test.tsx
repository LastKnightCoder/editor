import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CollaborationSession, JoinRequestResult } from "@tau/collaboration";
import {
  RouterProvider,
  OverlayHost,
  definePage,
  getNavigator,
  paramString,
} from "../../../../router";
import { clearPageDefinitionsForTest, registerPageDefinition } from "../../../../router/registry";
import { clearPageMetasForTest, registerPageMeta } from "../../../../router/core/pageMeta";
import { mobileLocaleSource } from "../../../../services/i18n";
import { useCollaborationStore } from "../../core/store";
import { joinTranslator } from "../../join.i18n";
import joinPage from "../joinSheet.page";

const transport = vi.hoisted(() => ({
  joinByCode: vi.fn(),
  retain: vi.fn(),
  release: vi.fn(),
  start: vi.fn(async () => undefined),
}));
const presentError = vi.hoisted(() => vi.fn());
vi.mock("../../core/manager", () => ({ collaborationManager: transport }));
vi.mock("../../../../app/AppContext", () => ({
  useAppContext: () => ({
    syncSettings: { safeSetting: { collaboration: { nickname: "用户原名" } } },
    presentError,
  }),
}));

let root: Root;
let host: HTMLDivElement;
let originalLocale: string;
let originalState: ReturnType<typeof useCollaborationStore.getState>;
let originalClipboard: PropertyDescriptor | undefined;
const readText = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  transport.joinByCode.mockReset();
  originalLocale = mobileLocaleSource.getSnapshot();
  mobileLocaleSource.setLocale("zh-CN");
  originalState = useCollaborationStore.getState();
  useCollaborationStore.setState({ sessions: [], notices: [] });
  originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText } });
  readText.mockReset().mockResolvedValue("");
  clearPageDefinitionsForTest();
  clearPageMetasForTest();
  window.history.replaceState(null, "");
  definePage({ key: "home", params: {}, component: () => null });
  registerPageMeta(joinPage.meta);
  registerPageDefinition(joinPage);
  definePage({ key: "collabEditor", params: { documentId: paramString() }, component: () => null });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  useCollaborationStore.setState(originalState);
  mobileLocaleSource.setLocale(originalLocale);
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  host.remove();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});
async function mount() {
  await act(async () =>
    root.render(
      <RouterProvider rootKey="home">
        <OverlayHost />
      </RouterProvider>
    )
  );
  await act(async () => {
    await getNavigator().push("joinSheet");
  });
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}
function codeInput() {
  const input = document.querySelector<HTMLInputElement>(
    `input[aria-label="${joinTranslator.t("codeLabel")}"]`
  );
  if (!input) throw new Error("生产加入页输入未挂载");
  return input;
}
function button(key: "fill" | "submit") {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    item => item.textContent?.trim() === joinTranslator.t(key)
  );
  if (!found) throw new Error("加入页动作未挂载");
  return found;
}
function enterCode(value: string) {
  const input = codeInput();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("原生输入能力不可用");
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
function session(id: string): CollaborationSession {
  return {
    id,
    title: "用户文档原题",
    ownerId: "owner-raw",
    role: "editor",
    status: "active",
    members: [],
    updatedAt: 0,
    serverUrl: "https://collab.example",
    connection: "connected",
    pending: false,
    leaving: false,
  };
}

it("生产加入路由换语保留草稿与在途请求，剪贴板只读一次，批准只进入响应指定的文档", async () => {
  readText.mockResolvedValue("k7qx m3az 9bcd");
  let finish: ((result: JoinRequestResult) => void) | undefined;
  transport.joinByCode.mockImplementation(
    () =>
      new Promise<JoinRequestResult>(resolve => {
        finish = resolve;
      })
  );
  await mount();
  const navigator = getNavigator();
  const replace = vi.spyOn(navigator, "replace");
  await act(async () => button("fill").click());
  const input = codeInput();
  expect(input.value).toBe("K7QXM3AZ9BCD");
  await act(async () => enterCode("iO01 k7qx-m3az-9bcd"));
  await act(async () => {
    input.focus();
    input.setSelectionRange(1, 5);
  });
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(codeInput()).toBe(input);
    expect(input.value).toBe("K7QXM3AZ9BCD");
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 5]);
    expect(document.activeElement).toBe(input);
    expect(readText).toHaveBeenCalledTimes(1);
    expect(transport.start).toHaveBeenCalledExactlyOnceWith({ nickname: "用户原名" });
    expect(transport.retain).toHaveBeenCalledTimes(1);
    expect(transport.release).not.toHaveBeenCalled();
    expect(transport.joinByCode).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  }
  await act(async () => button("submit").click());
  for (const locale of ["zh-TW", "zh-CN"]) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(codeInput()).toBe(input);
    expect(input.disabled).toBe(true);
    expect(input.value).toBe("K7QXM3AZ9BCD");
    expect(transport.joinByCode).toHaveBeenCalledExactlyOnceWith("K7QXM3AZ9BCD");
    expect(readText).toHaveBeenCalledTimes(1);
  }
  if (!finish) throw new Error("加入请求未启动");
  const documentId = "response-document-42";
  await act(async () => finish?.({ id: "request-raw", status: "pending", documentId }));
  expect(document.querySelector("input")).toBeNull();
  await act(async () => mobileLocaleSource.setLocale("en-US"));
  expect(transport.joinByCode).toHaveBeenCalledTimes(1);
  expect(transport.start).toHaveBeenCalledTimes(1);
  expect(replace).not.toHaveBeenCalled();
  await act(async () =>
    useCollaborationStore.setState({ sessions: [session("unrelated-document")] })
  );
  expect(replace).not.toHaveBeenCalled();
  await act(async () =>
    useCollaborationStore.setState({
      sessions: [session("unrelated-document"), session(documentId)],
    })
  );
  expect(replace).toHaveBeenCalledExactlyOnceWith("collabEditor", { documentId });
  expect(navigator.getActiveScreen()).toMatchObject({
    key: "collabEditor",
    params: { documentId },
  });
  await act(async () => mobileLocaleSource.setLocale("zh-TW"));
  expect(replace).toHaveBeenCalledTimes(1);
  expect(transport.joinByCode).toHaveBeenCalledTimes(1);
  expect(readText).toHaveBeenCalledTimes(1);
});

it("失败后换语保留输入和原错误，不重新加入，未知诊断在重试后原样显示", async () => {
  const failure = new Error("COLLAB_INVALID_CODE: raw-server-trace");
  const unknown = new Error("server diagnostic: 原始消息 trace-43");
  transport.joinByCode.mockRejectedValueOnce(failure).mockRejectedValueOnce(unknown);
  await mount();
  await act(async () => enterCode("k7qx m3az 9bcd"));
  const input = codeInput();
  await act(async () => button("submit").click());
  const alert = document.querySelector('[role="alert"]');
  expect(alert).not.toBeNull();
  await act(async () => {
    input.focus();
    input.setSelectionRange(2, 6);
  });
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(codeInput()).toBe(input);
    expect(input.value).toBe("K7QXM3AZ9BCD");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 6]);
    expect(document.querySelector('[role="alert"]')).toBe(alert);
    expect(transport.joinByCode).toHaveBeenCalledExactlyOnceWith("K7QXM3AZ9BCD");
    expect(presentError).toHaveBeenCalledTimes(1);
    expect(presentError.mock.calls[0][0]).toBe(failure);
    expect(failure.message).toBe("COLLAB_INVALID_CODE: raw-server-trace");
    expect(readText).toHaveBeenCalledTimes(1);
    expect(transport.start).toHaveBeenCalledTimes(1);
  }
  await act(async () => button("submit").click());
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(unknown.message);
  expect(presentError.mock.calls[1][0]).toBe(unknown);
  await act(async () => mobileLocaleSource.setLocale("zh-TW"));
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(unknown.message);
  expect(transport.joinByCode.mock.calls).toEqual([["K7QXM3AZ9BCD"], ["K7QXM3AZ9BCD"]]);
});

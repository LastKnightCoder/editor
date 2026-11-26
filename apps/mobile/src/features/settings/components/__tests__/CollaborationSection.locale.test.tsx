import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SettingCompat } from "../../../../types";
import { RouterProvider, definePage } from "../../../../router";
import { mobileI18n, mobileLocaleSource } from "../../../../services/i18n";
import { useCollaborationStore } from "../../../collaboration/core/store";
import { CollaborationSection } from "../CollaborationSection";
import { collaborationSettingsTranslator } from "../../collaboration/i18n";

const mocks = vi.hoisted(() => {
  const setting: SettingCompat = {
    database: { active: "original.db", databases: [] },
    imageBed: { active: "local", enableCompression: false, local: { path: "resources" } },
    sync: { active: "none" },
    collaboration: { nickname: "用户原始昵称", customMetadata: "raw-original" },
  };
  return {
    updateNickname: vi.fn(),
    retain: vi.fn(),
    release: vi.fn(),
    start: vi.fn(),
    updateSetting: vi.fn(),
    presentError: vi.fn(),
    setting,
  };
});
vi.mock("../../../collaboration/core/manager", () => ({ collaborationManager: mocks }));
vi.mock("../../../../app/AppContext", () => ({
  useAppContext: () => ({
    syncSettings: { safeSetting: mocks.setting, updateSetting: mocks.updateSetting },
    presentError: mocks.presentError,
  }),
}));
definePage({ key: "collaboration-settings-locale-root", params: {}, component: () => null });
let host: HTMLDivElement;
let root: Root;
const locales = ["zh-TW", "en-US"] as const;
const byText = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    button => button.textContent?.trim() === text
  );
const deferred = () => {
  let resolve!: () => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const render = async () => {
  await act(async () =>
    root.render(
      <I18nRuntimeProvider runtime={mobileI18n}>
        <RouterProvider rootKey="collaboration-settings-locale-root">
          <CollaborationSection />
        </RouterProvider>
      </I18nRuntimeProvider>
    )
  );
  await act(async () => vi.waitFor(() => expect(mocks.start).toHaveBeenCalledOnce()));
};
const edit = async (input: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
beforeEach(() => {
  vi.clearAllMocks();
  mobileLocaleSource.setLocale("zh-CN");
  mocks.setting = {
    ...mocks.setting,
    collaboration: { nickname: "用户原始昵称", customMetadata: "raw-original" },
  };
  mocks.start.mockResolvedValue(undefined);
  mocks.updateNickname.mockResolvedValue(undefined);
  useCollaborationStore.setState({
    status: "ready",
    deviceId: "device-original",
    sessions: [],
    requests: [],
    notices: [],
    error: undefined,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  mobileLocaleSource.setLocale("zh-CN");
});

it("昵称草稿和在途提交跨语言保留，只在服务器成功后写原始昵称且不重连", async () => {
  const pending = deferred();
  mocks.updateNickname.mockReturnValue(pending.promise);
  await render();
  await act(async () => byText(collaborationSettingsTranslator.t("edit"))?.click());
  const input = document.querySelector("input");
  if (!input) throw new Error("nickname input missing");
  await edit(input, "  未提交的新昵称  ");
  input.focus();
  input.setSelectionRange(2, 5);
  for (const locale of locales) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(document.querySelector("input")).toBe(input);
    expect(input.value).toBe("  未提交的新昵称  ");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 5]);
    expect(mocks.updateNickname).not.toHaveBeenCalled();
    expect(mocks.updateSetting).not.toHaveBeenCalled();
    expect(mocks.start).toHaveBeenCalledExactlyOnceWith({ nickname: "用户原始昵称" });
    expect(mocks.retain).toHaveBeenCalledOnce();
    expect(mocks.release).not.toHaveBeenCalled();
  }
  await act(async () => byText(collaborationSettingsTranslator.t("save"))?.click());
  expect(mocks.updateNickname).toHaveBeenCalledExactlyOnceWith("未提交的新昵称");
  const original = mocks.setting;
  for (const locale of locales) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(document.querySelector("input")).toBe(input);
    expect(input.value).toBe("  未提交的新昵称  ");
    expect(byText(collaborationSettingsTranslator.t("saving"))?.disabled).toBe(true);
    expect(mocks.updateNickname).toHaveBeenCalledOnce();
    expect(mocks.updateSetting).not.toHaveBeenCalled();
    expect(mocks.setting).toBe(original);
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(mocks.release).not.toHaveBeenCalled();
  }
  await act(async () => pending.resolve());
  expect(mocks.updateSetting).toHaveBeenCalledOnce();
  const [apply, options] = mocks.updateSetting.mock.calls[0];
  expect(options).toEqual({ persist: true });
  expect(apply(original)).toEqual({
    ...original,
    collaboration: { nickname: "未提交的新昵称", customMetadata: "raw-original" },
  });
});

it("默认昵称保持身份原文，失败保留原诊断与草稿而不写设置或重复请求", async () => {
  mocks.setting = { ...mocks.setting, collaboration: {} };
  const pending = deferred();
  mocks.updateNickname.mockReturnValue(pending.promise);
  await render();
  expect(mocks.start).toHaveBeenCalledExactlyOnceWith({ nickname: "Tau 用户" });
  await act(async () => byText(collaborationSettingsTranslator.t("edit"))?.click());
  const input = document.querySelector("input");
  if (!input) throw new Error("nickname input missing");
  expect(input.value).toBe("Tau 用户");
  await edit(input, "失败也要保留的原稿");
  await act(async () => byText(collaborationSettingsTranslator.t("save"))?.click());
  const cause = new Error("original server diagnostic");
  await act(async () => pending.reject(cause));
  expect(mocks.presentError).toHaveBeenCalledWith(cause, expect.any(String));
  for (const locale of locales) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(document.querySelector("input")).toBe(input);
    expect(input.value).toBe("失败也要保留的原稿");
    expect(mocks.updateNickname).toHaveBeenCalledExactlyOnceWith("失败也要保留的原稿");
    expect(mocks.updateSetting).not.toHaveBeenCalled();
    expect(mocks.presentError).toHaveBeenCalledOnce();
    expect(mocks.start).toHaveBeenCalledOnce();
  }
});

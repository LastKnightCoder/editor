import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { desktopLocaleSource } from "../i18n/runtime";
import { featureTranslator } from "../features.i18n";
import { FEATURE_PRESETS } from "../features";
import { FeatureOnboarding } from "../FeatureOnboarding";
import { FeaturesSection } from "@/features/settings/sections/FeaturesSection";
import type { WorkspacePreferences } from "@/types/workspace-preferences";
const native = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
vi.mock("@/commands/workspace-preferences", () => ({
  getWorkspacePreferences: native.read,
  saveWorkspacePreferences: native.save,
}));
vi.mock("@/platform", () => ({
  isMac: true,
  platform: { window: { onMaximizedChange: () => () => undefined } },
}));
let host: HTMLDivElement, root: Root, client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  native.read.mockResolvedValue({ disabledFeatures: [], onboarding: "done" });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  client.clear();
});
function preset() {
  const found = [...host.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(button =>
    button.textContent?.includes(featureTranslator.t("preset.writing"))
  );
  if (!found) throw new Error("写作组合未挂载");
  return found;
}
it("首次启动换语保留组合选择与焦点，不提交偏好；主动进入仍按原功能ID保存", async () => {
  const original = desktopLocaleSource.getSnapshot();
  try {
    await act(async () => {
      desktopLocaleSource.setLocale("zh-CN");
      root.render(
        <QueryClientProvider client={client}>
          <FeatureOnboarding />
        </QueryClientProvider>
      );
    });
    const selected = preset();
    await act(async () => {
      selected.click();
      selected.focus();
    });
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(preset()).toBe(selected);
      expect(selected.getAttribute("aria-pressed")).toBe("true");
      expect(document.activeElement).toBe(selected);
      expect(native.save).not.toHaveBeenCalled();
      expect(native.read).not.toHaveBeenCalled();
    }
    native.save.mockImplementation(async (patch: Partial<WorkspacePreferences>) => ({
      disabledFeatures: [],
      onboarding: "done",
      ...patch,
    }));
    const writing = FEATURE_PRESETS.find(preset => preset.id === "writing");
    if (!writing) throw new Error("写作组合定义未注册");
    const count = writing.features.length;
    const enterLabel = featureTranslator.t("onboard.enter", {
      count,
      amount: count.toLocaleString(desktopLocaleSource.getSnapshot()),
    });
    const enter = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      button => button.textContent?.trim() === enterLabel
    );
    if (!enter) throw new Error("进入应用动作未挂载");
    await act(async () => enter.click());
    expect(native.save).toHaveBeenCalledTimes(1);
    const patch = native.save.mock.calls[0][0];
    expect(patch.onboarding).toBe("done");
    expect(patch.disabledFeatures).toContain("pomodoro");
    expect(patch.disabledFeatures).not.toContain("cards");
    expect(patch.disabledFeatures).not.toContain("diary");
  } finally {
    await act(async () => desktopLocaleSource.setLocale(original));
  }
});
it("功能偏好写入中换语保留乐观选择与查询身份，不重发保存或查询", async () => {
  const original = desktopLocaleSource.getSnapshot();
  let finish: ((value: WorkspacePreferences) => void) | undefined;
  native.save.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  try {
    await act(async () => {
      desktopLocaleSource.setLocale("zh-CN");
      root.render(
        <QueryClientProvider client={client}>
          <FeaturesSection />
        </QueryClientProvider>
      );
    });
    await vi.waitFor(async () => {
      await act(() => Promise.resolve());
      expect(native.read).toHaveBeenCalled();
      expect(preset().getAttribute("aria-pressed")).toBe("true");
    });
    const selected = preset();
    await act(async () => selected.click());
    expect(native.save).toHaveBeenCalledTimes(1);
    const before = client.getQueryData(["workspace", "preferences"]),
      reads = native.read.mock.calls.length,
      keys = client
        .getQueryCache()
        .getAll()
        .map(query => query.queryKey);
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(preset()).toBe(selected);
      expect(selected.getAttribute("aria-pressed")).toBe("false");
      expect(client.getQueryData(["workspace", "preferences"])).toBe(before);
      expect(
        client
          .getQueryCache()
          .getAll()
          .map(query => query.queryKey)
      ).toEqual(keys);
      expect(native.read).toHaveBeenCalledTimes(reads);
      expect(native.save).toHaveBeenCalledTimes(1);
    }
    const patch = native.save.mock.calls[0][0];
    expect(patch.disabledFeatures).toContain("articles");
    expect(patch.disabledFeatures).not.toContain("cards");
    expect(patch.disabledFeatures).not.toContain("diary");
  } finally {
    await act(async () => {
      finish?.({
        disabledFeatures: native.save.mock.calls[0]?.[0].disabledFeatures ?? [],
        onboarding: "done",
      });
      await Promise.resolve();
      desktopLocaleSource.setLocale(original);
    });
  }
});

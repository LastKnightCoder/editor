import { mobileLocaleSource } from "../../services/i18n";
import { pluginControlsTranslator } from "./controls.i18n";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PluginPermissionBroker } from "@tau/plugins/permission-host";
import type { PluginContext } from "@tau/plugins";
import { PluginPermissionPrompt } from "./PluginPermissionPrompt";
let back: (() => boolean) | undefined;
const navigator = {
  getTopOverlay: () => null,
  getActiveScreen: () => ({ id: "screen" }),
  registerBackHandler: vi.fn((_id, handler) => {
    back = handler;
    return () => {
      back = undefined;
    };
  }),
};
const router = {};
vi.mock("../../router", () => ({ useNavigator: () => navigator, useRouterContext: () => router }));
vi.mock("../../components/ActionSheet", () => ({
  ActionSheet: ({ items }: { items: { label: string; onClick(): void }[] }) => (
    <div>
      {items.map(item => (
        <button key={item.label} onClick={item.onClick}>
          {item.label}
        </button>
      ))}
    </div>
  ),
}));
it("全局授权层消费系统返回，关闭按拒绝处理且不持久授权", async () => {
  const write = vi.fn();
  const broker = new PluginPermissionBroker({ read: async () => ({}), write }, () => true);
  const context = { pluginId: "test", signal: new AbortController().signal } as PluginContext;
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<PluginPermissionPrompt broker={broker} />));
    let pending!: Promise<boolean>;
    await act(async () => {
      pending = broker.request(context, { id: "test", name: "测试" }, ["cards:read"]);
    });
    expect(container.textContent).toContain("仅这次");
    expect(navigator.registerBackHandler).toHaveBeenCalledWith("screen", expect.any(Function), {
      blockEdgeBack: true,
    });
    await act(async () => {
      expect(back?.()).toBe(true);
    });
    expect(await pending).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(container.textContent).toBe("");
  } finally {
    await act(async () => root.unmount());
    broker.dispose();
  }
});

it("换语保留原权限请求，不写授权或重绑返回，确认后才授予原权限", async () => {
  const original = mobileLocaleSource.getSnapshot();
  const write = vi.fn();
  const broker = new PluginPermissionBroker({ read: async () => ({}), write }, () => true);
  const context = { pluginId: "raw.plugin", signal: new AbortController().signal } as PluginContext;
  const container = document.createElement("div"),
    root = createRoot(container);
  try {
    await act(async () => root.render(<PluginPermissionPrompt broker={broker} />));
    let pending!: Promise<boolean>;
    await act(async () => {
      pending = broker.request(context, { id: "raw.plugin", name: "原始插件名" }, ["cards:read"]);
    });
    const prompt = broker.prompts[0],
      registrations = navigator.registerBackHandler.mock.calls.length;
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => mobileLocaleSource.setLocale(locale));
      expect(broker.prompts[0]).toBe(prompt);
      expect([...prompt.permissions]).toEqual(["cards:read"]);
      expect(prompt.plugin).toEqual({ id: "raw.plugin", name: "原始插件名" });
      expect(navigator.registerBackHandler).toHaveBeenCalledTimes(registrations);
      expect(write).not.toHaveBeenCalled();
    }
    const allow = [...container.querySelectorAll("button")].find(
      button => button.textContent === pluginControlsTranslator.t("permission.always")
    );
    if (!allow) throw new Error("Permission decision did not mount");
    await act(async () => allow.click());
    expect(await pending).toBe(true);
    expect(broker.rowState("raw.plugin")["cards:read"]).toBe("always");
    expect(write).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    broker.dispose();
    mobileLocaleSource.setLocale(original);
  }
});

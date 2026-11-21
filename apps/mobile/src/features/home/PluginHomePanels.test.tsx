import { act, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { definePlugin } from "@tau/plugins";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { usePortalContainer } from "@tau/ui";
import { MobilePluginRuntime } from "../../app/plugins/runtime";
import { PluginHomePanels } from "./PluginHomePanels";

let runtime: MobilePluginRuntime | null = null;
let phase = "active";
const navigator = { push: vi.fn(), registerBackHandler: () => () => undefined };
vi.mock("../../app/plugins/context", () => ({ useMobilePlugins: () => runtime }));
vi.mock("../../router", () => ({
  usePage: () => ({ navigator, entryId: "home" }),
}));
vi.mock("../../router/pageLifecycle", () => ({
  usePageInstanceContext: () => ({ phase }),
  usePageGuard: () => undefined,
}));

function Panel() {
  const container = usePortalContainer();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(0);
  return (
    <>
      <button onClick={() => setOpen(true)}>打开</button>
      {open &&
        createPortal(
          <div role="dialog">
            <button onClick={() => setValue(value + 1)}>{value}</button>
          </div>,
          container
        )}
    </>
  );
}

it("首页插件浮层越过页面层叠边界，离开首页隐藏，返回后保留输入状态", async () => {
  // 称重面板曾被局部 PortalScope 留在首页层叠上下文内，遭全局底栏遮挡。
  const created = new MobilePluginRuntime(
    createPluginEnvironmentStore({
      platform: "ios",
      input: { coarsePointer: true, finePointer: false },
    }),
    createMemoryStorage(),
    "A",
    navigator,
    "0.2.16"
  );
  runtime = created;
  created.host.registerTrusted(
    definePlugin({
      id: "test.home",
      name: "首页",
      version: "1",
      create: () => ({
        activate(context) {
          context.home.registerPanel({ id: "panel", title: "首页面板", component: Panel });
        },
      }),
    })
  );
  await created.host.enable("test.home");
  const page = document.createElement("div");
  page.style.cssText = "position:fixed;z-index:40;transform:translateX(0)";
  document.body.append(page);
  const root = createRoot(page);
  try {
    await act(async () => root.render(<PluginHomePanels />));
    await act(async () => page.querySelector("button")?.click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(page.contains(dialog)).toBe(false);
    await act(async () => dialog?.querySelector("button")?.click());
    expect(dialog?.querySelector("button")?.textContent).toBe("1");

    phase = "paused";
    await act(async () => root.render(<PluginHomePanels />));
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    phase = "active";
    await act(async () => root.render(<PluginHomePanels />));
    expect(document.querySelector('[role="dialog"] button')?.textContent).toBe("1");
  } finally {
    await act(async () => root.unmount());
    await created.dispose();
    page.remove();
    runtime = null;
    phase = "active";
  }
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

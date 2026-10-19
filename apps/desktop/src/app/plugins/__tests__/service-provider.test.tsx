import { act, StrictMode, useSyncExternalStore, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  defineEditorElement,
  defineEditorExtension,
  definePlugin,
  usePluginServices,
  type PluginServices,
} from "@tau/plugins";
import { bindPluginServiceRenderers } from "@tau/plugins/services-host";
import { DesktopPluginServicesProvider } from "../ServiceProvider";

const state = vi.hoisted(() => ({
  active: "A",
  listeners: new Set<() => void>(),
  jobs: [] as { signal: AbortSignal; finish(value: { html: string }): void }[],
}));
vi.mock("@/stores/useSettingStore", () => ({
  default: Object.assign(
    (selector: (value: { setting: { database: { active: string } } }) => string) =>
      selector({
        setting: {
          database: {
            active: useSyncExternalStore(
              listener => {
                state.listeners.add(listener);
                return () => {
                  state.listeners.delete(listener);
                };
              },
              () => state.active
            ),
          },
        },
      }),
    { getState: () => ({ setting: { database: { active: state.active } } }) }
  ),
}));
vi.mock("../content-plugin-state", () => ({
  contentPluginLoaded: (id: string) => id === "test.service",
}));
vi.mock("../services", () => ({
  desktopPluginServices: {
    typst: {
      compile: (_input: unknown, options: { signal: AbortSignal }) =>
        new Promise(resolve => state.jobs.push({ signal: options.signal, finish: resolve })),
    },
  },
}));

let services: PluginServices | undefined;
function Probe() {
  services = usePluginServices();
  return null;
}
const definition = bindPluginServiceRenderers(
  definePlugin({
    id: "test.service",
    name: "测试",
    version: "1.0.0",
    editorExtensions: [
      defineEditorExtension({
        id: "test.service",
        elements: [defineEditorElement({ type: "paragraph", kind: "block", render: Probe })],
      }),
    ],
  })
);
const Render = definition.editorExtensions![0].elements![0].render!;
const props = {
  element: { type: "paragraph", children: [] },
  attributes: { "data-slate-node": "element", ref: null },
  children: null,
} as ComponentProps<typeof Render>;
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  state.active = "A";
  state.jobs = [];
  services = undefined;
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
});
const switchWorkspace = async () =>
  act(async () => {
    state.active = "B";
    state.listeners.forEach(listener => listener());
  });

it("工作区切换和窗口 pagehide 会取消本窗口的在途服务", async () => {
  await act(async () =>
    root.render(
      <DesktopPluginServicesProvider>
        <Render {...props} />
      </DesktopPluginServicesProvider>
    )
  );
  const old = services!;
  const pending = old.typst.compile({ source: "A" });
  await switchWorkspace();
  expect(state.jobs[0].signal.aborted).toBe(true);
  state.jobs[0].finish({ html: "旧结果" });
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(services).not.toBe(old);
  const next = services!.typst.compile({ source: "B" });
  await act(async () => window.dispatchEvent(new Event("pagehide")));
  expect(state.jobs[1].signal.aborted).toBe(true);
  state.jobs[1].finish({ html: "已关闭窗口" });
  await expect(next).rejects.toMatchObject({ name: "AbortError" });
});

it("独立编辑窗口固定到文档数据库，主窗口切库不撤销它的服务", async () => {
  await act(async () =>
    root.render(
      <DesktopPluginServicesProvider workspace="document-db">
        <Render {...props} />
      </DesktopPluginServicesProvider>
    )
  );
  const original = services!;
  const pending = original.typst.compile({ source: "固定数据库" });
  await switchWorkspace();
  expect(services).toBe(original);
  expect(state.jobs[0].signal.aborted).toBe(false);
  state.jobs[0].finish({ html: "完成" });
  await expect(pending).resolves.toEqual({ html: "完成" });
});

it("StrictMode 重复挂载后提供新的有效作用域", async () => {
  await act(async () =>
    root.render(
      <StrictMode>
        <DesktopPluginServicesProvider>
          <Render {...props} />
        </DesktopPluginServicesProvider>
      </StrictMode>
    )
  );
  const pending = services!.typst.compile({ source: "有效作用域" });
  expect(state.jobs[0].signal.aborted).toBe(false);
  state.jobs[0].finish({ html: "完成" });
  await expect(pending).resolves.toEqual({ html: "完成" });
});

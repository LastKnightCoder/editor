import { act } from "react";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { createRoot } from "react-dom/client";
import { execFileSync } from "node:child_process";
import { expect, it, vi } from "vitest";
import * as ui from "@tau/ui";
import * as sdk from "@tau/plugins";
import { createMemoryStorage, type DevelopmentPluginPackage } from "@tau/plugins/host";
import { DesktopPluginRuntime } from "@/app/plugins/runtime";
import { registerPluginPackage } from "@/app/plugins/package-loader";
import { PluginRuntimeContext } from "@/app/plugins/context";
import useSettingStore, { EImageBed } from "@/stores/useSettingStore";
import { ResourceSection } from "../sections/ResourceSection";
const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/commands/plugin-local", () => ({ savePluginUploadConfig: mocks.save }));
const zip = process.env.TAU_UPLOAD_PLUGIN_ZIP;
it.skipIf(!zip)("真实上传插件配置保存成功才切换目标，失败保留表单，停用撤销", async () => {
  const artifact: DevelopmentPluginPackage = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "-e",
        "const z=new(require('adm-zip'))(process.argv[1]);const e=z.getEntries().find(e=>e.entryName.endsWith('/manifest.json'));const m=JSON.parse(e.getData().toString());process.stdout.write(JSON.stringify({manifest:m,code:z.readAsText(m.id+'/'+m.main)}));",
        zip!,
      ],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
    )
  );
  const runtime = new DesktopPluginRuntime({
    workspaceId: "test",
    storage: createMemoryStorage(),
    navigator: { push() {} },
    plugins: [],
    openSettings() {},
  });
  registerPluginPackage(runtime.host, artifact, async () => ({
    "@tau/plugins": sdk,
    "@tau/ui": ui,
    react: React,
    "react/jsx-runtime": jsx,
  }));
  await runtime.host.enable(artifact.manifest.id);
  const before = useSettingStore.getState().setting;
  useSettingStore.setState({
    setting: {
      ...before,
      imageBed: { ...before.imageBed, active: EImageBed.Plugin, plugin: undefined },
    },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <ui.UiProvider>
          <PluginRuntimeContext.Provider value={runtime}>
            <ResourceSection />
          </PluginRuntimeContext.Provider>
        </ui.UiProvider>
      )
    );
    for (const input of container.querySelectorAll<HTMLInputElement>("input")) {
      const label = input.getAttribute("aria-label") ?? "";
      const value = label.includes("公开")
        ? "https://cdn.test"
        : label.includes("Endpoint")
          ? "https://s3.test"
          : label.includes("邮箱")
            ? "test@example.com"
            : "test";
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
          input,
          value
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    const button = () =>
      [...container.querySelectorAll("button")].find(item => item.textContent === "保存并使用")!;
    mocks.save.mockRejectedValueOnce(new Error("磁盘写入失败"));
    await act(async () => button().click());
    expect(container.textContent).toContain("磁盘写入失败");
    expect(useSettingStore.getState().setting.imageBed.plugin).toBeUndefined();
    mocks.save.mockResolvedValueOnce(undefined);
    await act(async () => button().click());
    expect(useSettingStore.getState().setting.imageBed.plugin?.id).toBe(artifact.manifest.id);
    expect(container.textContent).toContain("已保存并选为上传目标");
    await act(async () => runtime.host.disable(artifact.manifest.id));
    expect(container.textContent).toContain("请在插件中心安装");
    expect(useSettingStore.getState().setting.imageBed.plugin?.id).toBe(artifact.manifest.id);
  } finally {
    await act(async () => {
      root.unmount();
      await runtime.dispose();
    });
    container.remove();
    useSettingStore.setState({ setting: before });
  }
});

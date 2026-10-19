import { act } from "react";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import * as ui from "@tau/ui";
import * as sdk from "@tau/plugins";
import { execFileSync } from "node:child_process";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { definePlugin, type PluginSettingsProps } from "@tau/plugins";
import { createMemoryStorage } from "@tau/plugins/host";
import { DesktopPluginRuntime } from "@/app/plugins/runtime";
import { PluginRuntimeContext } from "@/app/plugins/context";
import { registerPluginPackage } from "@/app/plugins/package-loader";
import useSettingStore from "@/stores/useSettingStore";
import { ImageGenerationSection } from "../sections/ImageGenerationSection";

const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/commands/plugin-images", () => ({ savePluginImagesConfig: mocks.save }));
let container: HTMLDivElement;
let root: Root;
let runtime: DesktopPluginRuntime;
const previous = useSettingStore.getState().setting;
const button = (label: string) =>
  [...document.querySelectorAll("button")].find(item => item.textContent?.includes(label));
const account = (id: string) => ({
  id,
  name: id,
  pluginId: "test.images",
  modelId: "model",
  config: { region: id },
});
const state = () => useSettingStore.getState().setting.imageGeneration;

function Settings({ imageConfig }: PluginSettingsProps) {
  return (
    <button
      onClick={() =>
        void imageConfig!.save({ region: "changed" }, "custom-model").catch(() => undefined)
      }
    >
      保存插件字段 {imageConfig?.instanceId}
    </button>
  );
}
const render = () =>
  act(() =>
    root.render(
      <PluginRuntimeContext.Provider value={runtime}>
        <ImageGenerationSection />
      </PluginRuntimeContext.Provider>
    )
  );

beforeEach(async () => {
  mocks.save.mockReset().mockResolvedValue(undefined);
  useSettingStore.setState({
    setting: { ...previous, imageGeneration: { providers: [], currentProviderId: "" } },
  });
  runtime = new DesktopPluginRuntime({
    workspaceId: "test",
    storage: createMemoryStorage(),
    navigator: { push() {} },
    plugins: [],
    openSettings() {},
  });
  runtime.host.registerTrusted(
    definePlugin({
      id: "test.images",
      name: "测试图片",
      version: "1.0.0",
      create: () => ({
        activate(context) {
          context.images.register({
            id: context.pluginId,
            name: "测试图片",
            create: () => ({ generate: async () => [] }),
          });
          context.settings.register({
            id: "connection",
            title: "插件账号",
            target: "images",
            component: Settings,
          });
        },
      }),
    })
  );
  await runtime.host.enable("test.images");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await runtime.dispose();
  });
  document.body.innerHTML = "";
  useSettingStore.setState({ setting: previous });
});

it("添加账号只列活动插件，不注入 OpenAI 字段或自动切换当前账号", async () => {
  render();
  expect(container.textContent).toContain("还没有图片生成提供商");
  await act(async () => button("添加提供商")!.click());
  await act(async () => button("插件账号")!.click());
  expect(state().providers).toHaveLength(1);
  expect(state().providers[0]).toMatchObject({ pluginId: "test.images", config: {}, modelId: "" });
  expect(state().currentProviderId).toBe("");
  expect(container.textContent).toContain("保存插件字段");
  expect(container.textContent).not.toContain("API Key");
});

it("非当前账号表单保存按实例隔离，保存失败不改配置，停用保留账号", async () => {
  useSettingStore.setState({
    setting: {
      ...previous,
      imageGeneration: { providers: [account("a"), account("b")], currentProviderId: "a" },
    },
  });
  render();
  await act(async () => button("b")!.click());
  mocks.save.mockRejectedValueOnce(new Error("disk"));
  await act(async () => button("保存插件字段")!.click());
  expect(state().providers[1].config).toEqual({ region: "b" });
  await act(async () => button("保存插件字段")!.click());
  expect(mocks.save).toHaveBeenLastCalledWith(
    "b",
    "test.images",
    { region: "changed" },
    "custom-model"
  );
  expect(state().providers[0].config).toEqual({ region: "a" });
  expect(state().currentProviderId).toBe("a");
  await act(async () => runtime.host.disable("test.images"));
  expect(container.textContent).toContain("插件设置暂不可用");
  expect(state().providers).toHaveLength(2);
});

it("删除当前账号清空选择，保留其他账号", async () => {
  useSettingStore.setState({
    setting: {
      ...previous,
      imageGeneration: { providers: [account("a"), account("b")], currentProviderId: "a" },
    },
  });
  render();
  await act(async () => button("删除")!.click());
  const confirm = [...document.querySelectorAll("button")]
    .filter(item => item.textContent?.trim() === "删除")
    .at(-1)!;
  await act(async () => confirm.click());
  expect(state().currentProviderId).toBe("");
  expect(state().providers.map(item => item.id)).toEqual(["b"]);
});

const zip = process.env.TAU_IMAGES_PLUGIN_ZIP;
it.skipIf(!zip)("真实 OpenAI ZIP 的配置表单按账号保存，失败保留草稿和已提交配置", async () => {
  const artifact = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "-e",
        "const zip=new(require('adm-zip'))(process.argv[1]);const entry=zip.getEntries().find(item=>item.entryName.endsWith('/manifest.json'));const manifest=JSON.parse(entry.getData().toString());process.stdout.write(JSON.stringify({manifest,code:zip.readAsText(manifest.id+'/'+manifest.main)}));",
        zip!,
      ],
      { encoding: "utf8" }
    )
  );
  registerPluginPackage(runtime.host, artifact, async () => ({
    "@tau/plugins": sdk,
    "@tau/ui": ui,
    react: React,
    "react/jsx-runtime": jsx,
  }));
  await runtime.host.enable(artifact.manifest.id);
  const profiles = ["a", "b"].map(id => ({
    id,
    name: id,
    pluginId: artifact.manifest.id,
    modelId: `model-${id}`,
    config: { baseUrl: `https://${id}.test/v1`, apiKey: `key-${id}` },
  }));
  useSettingStore.setState({
    setting: { ...previous, imageGeneration: { providers: profiles, currentProviderId: "a" } },
  });
  render();
  await act(async () => button("b")!.click());
  const key = container.querySelector<HTMLInputElement>('input[type="password"]')!;
  expect(key.value).toBe("key-b");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      key,
      "changed-b"
    );
    key.dispatchEvent(new Event("input", { bubbles: true }));
  });
  mocks.save.mockRejectedValueOnce(new Error("磁盘保存失败"));
  await act(async () => button("保存连接配置")!.click());
  expect(container.textContent).toContain("磁盘保存失败");
  expect(state().providers[1].config).toEqual(profiles[1].config);
  expect(key.value).toBe("changed-b");
  await act(async () => button("保存连接配置")!.click());
  expect(mocks.save).toHaveBeenLastCalledWith(
    "b",
    artifact.manifest.id,
    { baseUrl: "https://b.test/v1", apiKey: "changed-b" },
    "model-b"
  );
  expect(state().providers[0].config).toEqual(profiles[0].config);
  expect(state().currentProviderId).toBe("a");
});

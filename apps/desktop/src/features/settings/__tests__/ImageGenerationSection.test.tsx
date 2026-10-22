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
/** 配置行的展开按钮（文本以配置名开头） */
const row = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")].find(item =>
    item.textContent?.startsWith(name)
  );
const radio = (name: string) =>
  document.querySelector<HTMLInputElement>(`input[type="radio"][aria-label="使用「${name}」"]`)!;
const menuItem = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    item => item.textContent?.trim() === label
  );
async function deleteProvider(name: string) {
  if (row(name)!.getAttribute("aria-expanded") !== "true")
    await act(async () => row(name)!.click());
  await act(async () => button("删除配置")!.click());
  const confirm = [...document.querySelectorAll("button")]
    .filter(item => item.textContent?.trim() === "删除")
    .at(-1)!;
  await act(async () => confirm.click());
}

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

it("空状态添加首个配置：只列活动插件，自动设为使用中并展开插件表单", async () => {
  render();
  expect(container.textContent).toContain("添加第一个图片生成配置");
  await act(async () => button("插件账号")!.click());
  expect(state().providers).toHaveLength(1);
  expect(state().providers[0]).toMatchObject({
    name: "插件账号",
    pluginId: "test.images",
    config: {},
    modelId: "",
  });
  expect(state().currentProviderId).toBe(state().providers[0].id);
  expect(row("插件账号")!.getAttribute("aria-expanded")).toBe("true");
  expect(container.textContent).toContain("保存插件字段");
  expect(container.textContent).toContain("未选择模型");
  expect(container.textContent).not.toContain("API Key");
});

it("经菜单追加配置不改变使用中的配置", async () => {
  useSettingStore.setState({
    setting: {
      ...previous,
      imageGeneration: { providers: [account("a")], currentProviderId: "a" },
    },
  });
  render();
  await act(async () => button("添加配置")!.click());
  await act(async () => menuItem("插件账号")!.click());
  expect(state().providers.map(item => item.name)).toEqual(["a", "插件账号 2"]);
  expect(state().currentProviderId).toBe("a");
  expect(row("插件账号")!.getAttribute("aria-expanded")).toBe("true");
});

it("圆点切换使用中，行点击只展开不切换", async () => {
  useSettingStore.setState({
    setting: {
      ...previous,
      imageGeneration: { providers: [account("a"), account("b")], currentProviderId: "a" },
    },
  });
  render();
  await act(async () => row("b")!.click());
  expect(state().currentProviderId).toBe("a");
  expect(row("b")!.getAttribute("aria-expanded")).toBe("true");
  await act(async () => radio("b").click());
  expect(state().currentProviderId).toBe("b");
  expect(radio("b").checked).toBe(true);
  expect(radio("a").checked).toBe(false);
  await act(async () => row("a")!.click());
  await act(async () => button("使用此配置")!.click());
  expect(state().currentProviderId).toBe("a");
});

it("非当前配置表单保存按实例隔离，保存失败不改配置，停用保留配置", async () => {
  useSettingStore.setState({
    setting: {
      ...previous,
      imageGeneration: { providers: [account("a"), account("b")], currentProviderId: "a" },
    },
  });
  render();
  await act(async () => row("b")!.click());
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
  expect(container.textContent).toContain("插件未启用");
  expect(state().providers).toHaveLength(2);
});

it("删除使用中的配置改用下一个已选模型的配置，没有则留空", async () => {
  useSettingStore.setState({
    setting: {
      ...previous,
      imageGeneration: {
        providers: [account("a"), { ...account("b"), modelId: "" }, account("c")],
        currentProviderId: "a",
      },
    },
  });
  render();
  await deleteProvider("a");
  expect(state().providers.map(item => item.id)).toEqual(["b", "c"]);
  expect(state().currentProviderId).toBe("c");
  await deleteProvider("c");
  expect(state().providers.map(item => item.id)).toEqual(["b"]);
  expect(state().currentProviderId).toBe("");
});

const zip = process.env.TAU_IMAGES_PLUGIN_ZIP;
it.skipIf(!zip)("真实 OpenAI ZIP 的配置表单按账号实时保存，失败保留草稿和已提交配置", async () => {
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
  await act(async () => row("b")!.click());
  const key = container.querySelector<HTMLInputElement>('input[type="password"]')!;
  expect(key.value).toBe("key-b");
  const typeAndSettle = async (text: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(key, text);
      key.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(() => new Promise(resolve => setTimeout(resolve, 600)));
  };
  mocks.save.mockRejectedValueOnce(new Error("磁盘保存失败"));
  await typeAndSettle("changed-b");
  expect(container.textContent).toContain("磁盘保存失败");
  expect(state().providers[1].config).toEqual(profiles[1].config);
  expect(key.value).toBe("changed-b");
  await typeAndSettle("changed-b2");
  expect(container.textContent).not.toContain("磁盘保存失败");
  expect(mocks.save).toHaveBeenLastCalledWith(
    "b",
    artifact.manifest.id,
    { baseUrl: "https://b.test/v1", apiKey: "changed-b2" },
    "model-b"
  );
  expect(state().providers[0].config).toEqual(profiles[0].config);
  expect(state().currentProviderId).toBe("a");
});

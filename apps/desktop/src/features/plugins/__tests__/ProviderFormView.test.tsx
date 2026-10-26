import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  ProviderFieldError,
  type PluginContext,
  type PluginProviderSettingsDefinition,
  type PluginSettingsProps,
} from "@tau/plugins";
import { UiProvider } from "@tau/ui";
import useSettingStore, { EImageBed, ESync } from "@/stores/useSettingStore";
import type { RegisteredPluginSettings } from "@/app/plugins/runtime";
import { PluginSettingsView } from "../views/PluginSettingsView";

const mocks = vi.hoisted(() => ({
  saveSync: vi.fn(async () => undefined),
  saveUpload: vi.fn(async () => undefined),
  probe: vi.fn(async () => ({ version: 3 })),
}));
vi.mock("@/commands/plugin-local", () => ({
  savePluginSyncConfig: mocks.saveSync,
  savePluginUploadConfig: mocks.saveUpload,
}));
vi.mock("@/services/storage-providers", async importOriginal => ({
  ...(await importOriginal<typeof import("@/services/storage-providers")>()),
  probeRemoteDatabaseVersion: mocks.probe,
}));

const context = { pluginId: "test.s3", signal: new AbortController().signal } as PluginContext;
const definition = (target: "sync" | "upload"): PluginProviderSettingsDefinition => ({
  id: target,
  title: "S3",
  target,
  form: {
    groups: [
      { title: "账号", fields: [{ key: "secret", label: "密钥", type: "secret" }] },
      {
        title: "存储位置",
        fields: [
          { key: "bucket", label: "Bucket", type: "text", summary: true },
          { key: "prefix", label: "目录", type: "text", optional: true },
        ],
      },
    ],
    beforeSave: async values => ({ ...values, bucket: values.bucket.trim() }),
  },
});

let container: HTMLDivElement;
let root: Root;
const section = (definition: PluginProviderSettingsDefinition) =>
  ({
    key: `plugin:test.s3:${definition.id}`,
    definition,
    context,
    mountId: 1,
  }) as RegisteredPluginSettings;
const render = (
  target: "sync" | "upload",
  props: Partial<Pick<PluginSettingsProps, "ttsConfig">> = {},
  override?: PluginProviderSettingsDefinition
) =>
  act(() =>
    root.render(
      <UiProvider>
        <PluginSettingsView section={section(override ?? definition(target))} {...props} />
      </UiProvider>
    )
  );
const text = () => container.textContent ?? "";
const button = (label: string) =>
  [...container.querySelectorAll("button")].find(item => item.textContent?.trim() === label)!;
async function type(label: string, value: string) {
  const element = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  mocks.saveSync.mockClear();
  mocks.saveUpload.mockClear();
  mocks.probe.mockReset().mockResolvedValue({ version: 3 });
  useSettingStore.setState(state => ({
    setting: {
      ...state.setting,
      sync: { ...state.setting.sync, active: ESync.Plugin, plugin: { id: "", configurations: {} } },
      imageBed: {
        ...state.setting.imageBed,
        active: EImageBed.Local,
        plugin: { id: "", configurations: { "test.s3": { legacy: "keep", bucket: "old" } } },
      },
    },
  }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

it("必填为空时标在字段上，不保存", async () => {
  render("sync");
  expect(text()).toContain("可选");
  await act(async () => button("保存并测试").click());
  expect(text()).toContain("请填写密钥");
  expect(text()).toContain("请填写Bucket");
  expect(mocks.saveSync).not.toHaveBeenCalled();
});

it("同步：保存后测试连接，不改变当前选用", async () => {
  render("sync");
  await type("密钥", "s");
  await type("Bucket", " notes ");
  await act(async () => button("保存并测试").click());
  await vi.waitFor(() => expect(text()).toContain("云端已有数据库 v3"));
  expect(mocks.saveSync).toHaveBeenCalledWith("test.s3", {
    secret: "s",
    bucket: "notes",
    prefix: "",
  });
  expect(mocks.probe).toHaveBeenCalledWith("test.s3", { secret: "s", bucket: "notes", prefix: "" });
  const { sync } = useSettingStore.getState().setting;
  expect(sync.plugin?.id).toBe("");
  expect(sync.plugin?.configurations["test.s3"]).toEqual({
    secret: "s",
    bucket: "notes",
    prefix: "",
  });
  expect(button("设为同步服务").disabled).toBe(false);
});

it("同步：连接失败时说明配置已保存", async () => {
  mocks.probe.mockRejectedValueOnce(new Error("403 Forbidden"));
  render("sync");
  await type("密钥", "s");
  await type("Bucket", "notes");
  await act(async () => button("保存并测试").click());
  await vi.waitFor(() => expect(text()).toContain("配置已保存，但连接失败：403 Forbidden"));
});

it("上传：保留未声明的键，设为上传目标后显示使用中", async () => {
  render("upload");
  expect(container.querySelector<HTMLInputElement>('input[aria-label="Bucket"]')!.value).toBe(
    "old"
  );
  await type("密钥", "s");
  await act(async () => button("保存").click());
  await vi.waitFor(() => expect(text()).toContain("配置已保存"));
  expect(mocks.saveUpload).toHaveBeenCalledWith("test.s3", {
    legacy: "keep",
    secret: "s",
    bucket: "old",
    prefix: "",
  });
  await act(async () => button("设为上传目标").click());
  const { imageBed } = useSettingStore.getState().setting;
  expect(imageBed.active).toBe(EImageBed.Plugin);
  expect(imageBed.plugin?.id).toBe("test.s3");
  expect(text()).toContain("使用中");
});

it("TTS：配置交给账号实例保存，不写资源存储，也不显示选用卡", async () => {
  const save = vi.fn(async () => undefined);
  const tts: PluginProviderSettingsDefinition = {
    id: "tts",
    title: "MiniMax",
    target: "tts",
    models: [{ id: "speech-2.8-hd" }],
    form: {
      groups: [
        {
          title: "连接",
          fields: [
            { key: "apiKey", label: "API Key", type: "secret" },
            { key: "stream", label: "流式返回", type: "switch", default: true },
          ],
        },
      ],
      beforeSave: async values => {
        if (values.apiKey === "bad") throw new ProviderFieldError("apiKey", "API Key 无效");
        return values;
      },
    },
  };
  render("upload", { ttsConfig: { instanceId: "a1", value: { keep: 1 }, models: [], save } }, tts);
  expect(text()).not.toContain("设为上传目标");
  await type("API Key", "bad");
  await act(async () => button("保存").click());
  await vi.waitFor(() => expect(text()).toContain("API Key 无效"));
  expect(save).not.toHaveBeenCalled();
  await type("API Key", "good");
  await act(async () => button("保存").click());
  await vi.waitFor(() => expect(text()).toContain("配置已保存"));
  expect(save).toHaveBeenCalledWith({ keep: 1, apiKey: "good", stream: "true" }, [
    { id: "speech-2.8-hd" },
  ]);
  expect(mocks.saveUpload).not.toHaveBeenCalled();
});

it("TTS：从插件详情打开（无账号上下文）时只给跳转", () => {
  const tts: PluginProviderSettingsDefinition = {
    id: "tts",
    title: "MiniMax",
    target: "tts",
    form: { groups: [{ title: "连接", fields: [{ key: "k", label: "K", type: "secret" }] }] },
  };
  render("upload", {}, tts);
  expect(text()).toContain("在语音设置中配置");
  expect(container.querySelector("input")).toBeNull();
});

it("发布：嵌入抽屉时自动保存，开关控制缓存目录，服务选择同时写入标识与显示名", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const save = vi.fn(async () => undefined);
  const selectCacheDirectory = vi.fn(async () => ({ id: "c1", label: "~/blog-cache" }));
  const publishContext = {
    ...context,
    services: { git: { selectCacheDirectory } },
  } as unknown as PluginContext;
  const publish: PluginProviderSettingsDefinition = {
    id: "publish",
    title: "GitHub",
    target: "publish",
    form: {
      groups: [
        {
          title: "推送",
          fields: [
            { key: "useGitCli", label: "Git Push", type: "switch", default: true },
            {
              key: "cacheId",
              label: "缓存目录",
              type: "service-choice",
              service: "git.cacheDirectory",
              labelKey: "cacheLabel",
              placeholder: "应用缓存目录（默认）",
              visibleWhen: { key: "useGitCli", equals: "true" },
            },
          ],
        },
      ],
    },
  };
  await act(async () =>
    root.render(
      <UiProvider>
        <PluginSettingsView
          section={
            {
              key: "plugin:test.s3:publish",
              definition: publish,
              context: publishContext,
              mountId: 1,
            } as RegisteredPluginSettings
          }
          embedded
          publishConfig={{ value: { token: "keep" }, save }}
        />
      </UiProvider>
    )
  );
  expect(text()).toContain("应用缓存目录（默认）");
  expect(button("保存")).toBeUndefined();

  await act(async () => button("选择…").click());
  expect(text()).toContain("~/blog-cache");
  await act(async () => vi.advanceTimersByTimeAsync(700));
  expect(save).toHaveBeenLastCalledWith({
    token: "keep",
    useGitCli: "true",
    cacheId: "c1",
    cacheLabel: "~/blog-cache",
  });

  await act(async () => container.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
  expect(text()).not.toContain("缓存目录");
  vi.useRealTimers();
});

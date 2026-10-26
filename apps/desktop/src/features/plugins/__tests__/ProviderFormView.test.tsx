import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PluginContext, PluginProviderSettingsDefinition } from "@tau/plugins";
import { UiProvider } from "@tau/ui";
import useSettingStore, { EImageBed, ESync } from "@/stores/useSettingStore";
import { ProviderFormView } from "../components/ProviderFormView";

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
const render = (target: "sync" | "upload") =>
  act(() =>
    root.render(
      <UiProvider>
        <ProviderFormView definition={definition(target)} context={context} name="S3" />
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

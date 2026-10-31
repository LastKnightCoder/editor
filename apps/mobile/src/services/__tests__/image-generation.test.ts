import { Blob as NodeBlob } from "node:buffer";
import { webcrypto } from "node:crypto";
import { transferableAbortController } from "node:util";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { definePlugin, type ImageProviderDefinition, type ImageEditRequest } from "@tau/plugins";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { MobilePluginRuntime } from "../../app/plugins/runtime";
import { installMobileImageHost } from "../plugin-images";
import { getMobileSettingSnapshot, setMobileSettingSnapshot } from "../mobileSettingsBridge";
import { generateMobileImageResources } from "../image-generation";
import { uploadResource } from "../tauri";
import type { SettingCompat } from "../../types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../tauri", () => ({ uploadResource: vi.fn() }));

const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const image = () => ({ name: "image.png", mimeType: "image/png", content: bytes.slice() });
const setting = (): SettingCompat => ({
  database: { active: "data.db", databases: [] },
  sync: { active: "plugin" },
  imageBed: { active: "local", local: { path: "resources" }, enableCompression: false },
  imageGeneration: {
    currentProviderId: "account",
    providers: [
      {
        id: "account",
        name: "图片账号",
        pluginId: "test.images",
        modelId: "image-model",
        config: { apiKey: "secret" },
      },
    ],
  },
});
let runtime: MobilePluginRuntime;
let disconnect: () => void;
beforeEach(() => {
  const controller = transferableAbortController();
  vi.stubGlobal("AbortController", controller.constructor);
  vi.stubGlobal("AbortSignal", controller.signal.constructor);
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Blob", NodeBlob);
  runtime = new MobilePluginRuntime(
    createPluginEnvironmentStore({
      platform: "android",
      input: { coarsePointer: true, finePointer: false },
    }),
    createMemoryStorage(),
    "data.db",
    { push: vi.fn() },
    "0.2.16"
  );
  disconnect = installMobileImageHost(runtime);
  setMobileSettingSnapshot(setting());
  vi.mocked(uploadResource).mockResolvedValue("/app/.editor/resources/generated.png");
});
afterEach(async () => {
  disconnect();
  await runtime.dispose();
  setMobileSettingSnapshot(null);
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
async function enable(create: ImageProviderDefinition["create"]) {
  runtime.host.registerTrusted(
    definePlugin({
      id: "test.images",
      name: "图片",
      version: "1.0.0",
      create: () => ({
        activate(context) {
          context.images.register({ id: context.pluginId, name: "图片", create });
          context.settings.register({
            id: "connection",
            title: "图片",
            target: "images",
            models: [{ id: "image-model" }],
            form: {
              groups: [
                { title: "连接", fields: [{ key: "apiKey", label: "API Key", type: "secret" }] },
              ],
            },
          });
        },
      }),
    })
  );
  await runtime.host.enable("test.images");
}
const task = (extra = {}) => ({
  database: "data.db",
  prompt: "生成图片",
  signal: new AbortController().signal,
  ...extra,
});

it("真实宿主注册图片与设置，按账号快照生成并保存可复用资源地址", async () => {
  const create = vi.fn<ImageProviderDefinition["create"]>(config => {
    (config as { apiKey: string }).apiKey = "changed";
    return { generate: async () => [image()] };
  });
  await enable(create);
  const result = await generateMobileImageResources(
    task({ options: { background: "transparent" } })
  );
  expect(runtime.settings.get("test.images:connection")?.definition.target).toBe("images");
  expect(create).toHaveBeenCalledWith({ apiKey: "changed" }, "image-model");
  expect(getMobileSettingSnapshot()?.imageGeneration?.providers[0].config).toEqual({
    apiKey: "secret",
  });
  expect(uploadResource).toHaveBeenCalledWith(
    expect.objectContaining({
      database: "data.db",
      mimeType: "image/png",
      signal: expect.anything(),
    })
  );
  expect(result[0]).toMatchObject({
    url: "/app/.editor/resources/generated.png",
    mimeType: "image/png",
  });
  expect(JSON.stringify(result)).not.toContain("secret");
});

it("编辑支持 data URL、本机资源与原生网络下载，保留图片字节和请求参数", async () => {
  const edit = vi.fn(async (_request: ImageEditRequest, _signal: AbortSignal) => [image()]);
  await enable(() => ({ edit }));
  vi.mocked(invoke).mockResolvedValue(btoa(String.fromCharCode(...bytes)));
  runtime.fetch = vi.fn(
    async () => new Response(bytes, { headers: { "content-type": "image/png" } })
  );
  await generateMobileImageResources(
    task({
      imagePaths: [
        "data:image/png;base64," + btoa(String.fromCharCode(...bytes)),
        "resources/reference.png",
        "https://images.test/reference.png",
      ],
      options: { outputFormat: "webp" },
    })
  );
  expect(invoke).toHaveBeenCalledWith("read_image_resource", {
    database: "data.db",
    path: "resources/reference.png",
  });
  expect(edit.mock.calls[0][0]).toMatchObject({
    options: { outputFormat: "webp" },
  });
  expect(
    edit.mock.calls[0][0].images.map(item => ({
      mimeType: item.mimeType,
      content: [...item.content],
    }))
  ).toEqual([1, 2, 3].map(() => ({ mimeType: "image/png", content: [...bytes] })));
});

it("插件忽略取消时停止等待，不上传迟到结果；停用后移除提供方", async () => {
  let complete!: (value: ReturnType<typeof image>[]) => void;
  const generate = vi.fn(
    () =>
      new Promise<ReturnType<typeof image>[]>(resolve => {
        complete = resolve;
      })
  );
  await enable(() => ({ generate }));
  const pending = generateMobileImageResources(task());
  await vi.waitFor(() => expect(generate).toHaveBeenCalled());
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await runtime.host.disable("test.images");
  await rejected;
  complete([image()]);
  await Promise.resolve();
  expect(uploadResource).not.toHaveBeenCalled();
  expect(runtime.images.list()).toEqual([]);
});

it("调用者取消和宿主重建都会取消正在生成的图片", async () => {
  await enable(() => ({ generate: () => new Promise(() => undefined) }));
  const controller = new AbortController();
  const first = generateMobileImageResources(task({ signal: controller.signal }));
  controller.abort();
  await expect(first).rejects.toMatchObject({ name: "AbortError" });
  const second = generateMobileImageResources(task());
  disconnect();
  await expect(second).rejects.toMatchObject({ name: "AbortError" });
  expect(uploadResource).not.toHaveBeenCalled();
});

it("切库后的迟到结果不保存；不向历史泄漏提供方错误里的凭据", async () => {
  await enable(() => ({
    generate: async () => {
      setMobileSettingSnapshot({ ...setting(), database: { active: "other.db", databases: [] } });
      return [image()];
    },
  }));
  await expect(generateMobileImageResources(task())).rejects.toMatchObject({ name: "AbortError" });
  expect(uploadResource).not.toHaveBeenCalled();
  setMobileSettingSnapshot(setting());
  await runtime.host.disable("test.images");
  await runtime.host.enable("test.images");
  vi.spyOn(runtime.images, "execute").mockRejectedValue(new Error("Authorization: secret"));
  await expect(generateMobileImageResources(task())).rejects.toThrow("图片请求失败");
});

it("未配置、缺少编辑能力和无效图片在上传前失败", async () => {
  await enable(() => ({ generate: async () => [{ ...image(), content: new Uint8Array() }] }));
  await expect(generateMobileImageResources(task())).rejects.toThrow("图片请求失败");
  await expect(
    generateMobileImageResources(
      task({ imagePaths: ["data:image/png;base64," + btoa(String.fromCharCode(...bytes))] })
    )
  ).rejects.toThrow("不支持图片编辑");
  setMobileSettingSnapshot({ ...setting(), imageGeneration: undefined });
  await expect(generateMobileImageResources(task())).rejects.toThrow("选择并配置");
  expect(uploadResource).not.toHaveBeenCalled();
});

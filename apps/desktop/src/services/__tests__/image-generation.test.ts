import { afterEach, beforeEach, expect, it, vi } from "vitest";
import useSettingStore from "@/stores/useSettingStore";
const mocks = vi.hoisted(() => ({ open: vi.fn(), upload: vi.fn(), resolve: vi.fn() }));
vi.mock("../plugin-images", () => ({ openPluginImages: mocks.open }));
vi.mock("@/hooks/useUploadResource", () => ({ uploadResource: mocks.upload }));
vi.mock("@/utils/image-generation/shared", async importOriginal => ({
  ...(await importOriginal<object>()),
  resolveImageInputFile: mocks.resolve,
}));
import { generateImageResources } from "../image-generation";
import { createImageFile } from "@/utils/image-generation/shared";
const original = useSettingStore.getState().setting;
const config = {
  id: "a",
  name: "a",
  pluginId: "test.images",
  modelId: "m",
  config: { region: "a" },
};
const result = { name: "a.webp", mimeType: "image/webp", content: new Uint8Array([1]) };
let lifetime: AbortController;
let instance: {
  canGenerate: boolean;
  canEdit: boolean;
  signal: AbortSignal;
  generate: ReturnType<typeof vi.fn>;
  edit: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  vi.clearAllMocks();
  lifetime = new AbortController();
  instance = {
    canGenerate: true,
    canEdit: true,
    signal: lifetime.signal,
    generate: vi.fn(async () => [result]),
    edit: vi.fn(async () => [result]),
    dispose: vi.fn(),
  };
  mocks.open.mockResolvedValue(instance);
  mocks.upload.mockResolvedValue("https://cdn.test/final.webp");
  const reference = createImageFile(new Uint8Array([2]), "image/png", "ref");
  mocks.resolve.mockResolvedValue(reference);
  useSettingStore.setState({
    setting: { ...original, imageGeneration: { providers: [config], currentProviderId: "a" } },
  });
});
afterEach(() => useSettingStore.setState({ setting: original }));

it("无参考图生成，有参考图编辑，共用带信号的上传并保留 MIME", async () => {
  const generated = await generateImageResources({ prompt: "生成" });
  expect(instance.generate).toHaveBeenCalledWith({ prompt: "生成", options: undefined });
  expect(generated[0]).toMatchObject({
    mimeType: "image/webp",
    url: "https://cdn.test/final.webp",
  });
  expect(mocks.upload.mock.calls[0][1]).toBe(lifetime.signal);
  await generateImageResources({ prompt: "编辑", imagePaths: ["/tmp/ref.png"] });
  expect(instance.edit).toHaveBeenCalledWith(
    expect.objectContaining({
      images: [
        {
          name: expect.stringMatching(/^ref-/),
          mimeType: "image/png",
          content: new Uint8Array([2]),
        },
      ],
    })
  );
  expect(instance.dispose).toHaveBeenCalledTimes(2);
});

it("上传期间插件停用不返回迟到结果，失败仍关闭会话", async () => {
  mocks.upload.mockImplementation(async () => {
    lifetime.abort();
    return "https://cdn.test/late";
  });
  await expect(generateImageResources({ prompt: "生成" })).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(instance.dispose).toHaveBeenCalledTimes(1);
});

it("生成期间切库不上传或提交旧结果", async () => {
  instance.generate.mockImplementation(async () => {
    useSettingStore.setState({
      setting: {
        ...useSettingStore.getState().setting,
        database: { ...original.database, active: "another" },
      },
    });
    return [result];
  });
  await expect(generateImageResources({ prompt: "生成" })).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(instance.dispose).toHaveBeenCalledTimes(1);
});

import { beforeEach, expect, it, vi } from "vitest";
import { uploadResource } from "../useUploadResource";
import useSettingStore, { EImageBed } from "@/stores/useSettingStore";
const mocks = vi.hoisted(() => ({ local: vi.fn(), remote: vi.fn(), compress: vi.fn() }));
vi.mock("@/utils/resouce", () => ({ copyFileToLocal: mocks.local }));
vi.mock("@/commands/plugin-local", () => ({ uploadPluginResource: mocks.remote }));
vi.mock("@/commands/file", () => ({ compressImage: mocks.compress }));
const initial = structuredClone(useSettingStore.getState().setting);
const file = (name: string, type = "image/png") =>
  ({ name, type, arrayBuffer: async () => new Uint8Array([0, 255]).buffer }) as File;
beforeEach(() => {
  vi.clearAllMocks();
  useSettingStore.setState({ setting: structuredClone(initial) });
  mocks.local.mockResolvedValue("~/resources/a.png");
  mocks.remote.mockResolvedValue("https://images.test/a.png");
});
it("默认本地保存不调用插件，保留无扩展名文件", async () => {
  expect(useSettingStore.getState().setting.imageBed.active).toBe(EImageBed.Local);
  await expect(uploadResource(file("image"))).resolves.toBe("~/resources/a.png");
  expect(mocks.remote).not.toHaveBeenCalled();
  expect(mocks.local.mock.calls[0][1]).toMatch(/^image_[\w-]+$/);
});
it("选择插件固定配置与字节，失败不回退到本地", async () => {
  useSettingStore.setState({
    setting: {
      ...initial,
      imageBed: {
        active: EImageBed.Plugin,
        enableCompression: false,
        githubCdn: null,
        plugin: { id: "test.upload", configurations: { "test.upload": { path: "images" } } },
      },
    },
  });
  await uploadResource(file("a.png"));
  expect(mocks.remote).toHaveBeenCalledWith(
    expect.objectContaining({
      pluginId: "test.upload",
      config: { path: "images" },
      file: expect.objectContaining({ mimeType: "image/png", content: new Uint8Array([0, 255]) }),
    })
  );
  mocks.remote.mockRejectedValue(new Error("已停用"));
  await expect(uploadResource(file("a.png"))).rejects.toThrow("已停用");
  expect(mocks.local).not.toHaveBeenCalled();
});

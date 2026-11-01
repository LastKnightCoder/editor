import { beforeEach, expect, it, vi } from "vitest";
import { File as NodeFile } from "node:buffer";
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
    }),
    undefined
  );
  mocks.remote.mockRejectedValue(new Error("已停用"));
  await expect(uploadResource(file("a.png"))).rejects.toThrow("已停用");
  expect(mocks.local).not.toHaveBeenCalled();
});

it.each([EImageBed.Local, EImageBed.Plugin])(
  "压缩后的类型、字节与文件名交给所选存储：%s",
  async active => {
    vi.stubGlobal("File", NodeFile);
    const compressed = new Uint8Array([1, 2, 3]);
    mocks.compress.mockResolvedValue(compressed);
    useSettingStore.setState({
      setting: {
        ...initial,
        imageBed: {
          active,
          enableCompression: true,
          plugin: { id: "test.upload", configurations: { "test.upload": { path: "images" } } },
        },
      },
    });
    try {
      await uploadResource(file("a.png"));
      expect(mocks.compress).toHaveBeenCalledWith(new Uint8Array([0, 255]), "image/png");
      if (active === EImageBed.Local) {
        const [saved, name] = mocks.local.mock.calls[0];
        expect(saved.type).toBe("image/webp");
        expect(name).toMatch(/^a_[\w-]+\.webp$/);
        expect(new Uint8Array(await saved.arrayBuffer())).toEqual(compressed);
        expect(mocks.remote).not.toHaveBeenCalled();
      } else {
        const { file: saved } = mocks.remote.mock.calls[0][0];
        expect(saved.mimeType).toBe("image/webp");
        expect(saved.name).toMatch(/^a_[\w-]+\.webp$/);
        expect(saved.content).toEqual(compressed);
        expect(mocks.local).not.toHaveBeenCalled();
      }
    } finally {
      vi.unstubAllGlobals();
    }
  }
);

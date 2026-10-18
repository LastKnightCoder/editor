import { expect, it, vi } from "vitest";
import useSettingStore, { EImageBed } from "@/stores/useSettingStore";
import { uploadRemoteResource } from "../resource-upload";
const send = vi.hoisted(() => vi.fn());
vi.mock("@/commands/plugin-local", () => ({ uploadPluginResource: send }));
it("uploadRemote拒绝本地目标，转发当前配置、字节与取消信号", async () => {
  const original = useSettingStore.getState().setting;
  const file = { name: "sample.wav", mimeType: "audio/wav", content: new Uint8Array([0, 255]) };
  const signal = new AbortController().signal;
  try {
    useSettingStore.setState({
      setting: { ...original, imageBed: { ...original.imageBed, active: EImageBed.Local } },
    });
    expect(() => uploadRemoteResource(file, signal)).toThrow("公网地址");
    expect(send).not.toHaveBeenCalled();
    useSettingStore.setState({
      setting: {
        ...original,
        imageBed: {
          ...original.imageBed,
          active: EImageBed.Plugin,
          plugin: { id: "test.upload", configurations: { "test.upload": { prefix: "audio" } } },
        },
      },
    });
    send.mockResolvedValue("https://files.test/audio.wav");
    await expect(uploadRemoteResource(file, signal)).resolves.toBe("https://files.test/audio.wav");
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: "test.upload",
        config: { prefix: "audio" },
        file: expect.objectContaining({ content: file.content, mimeType: "audio/wav" }),
      }),
      signal
    );
    expect(send.mock.calls[0][0].file.name).toMatch(/^sample_.*\.wav$/);
  } finally {
    useSettingStore.setState({ setting: original });
  }
});

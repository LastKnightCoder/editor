import { expect, it } from "vitest";
import { definePlugin, type JsonValue } from "@tau/plugins";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { RendererUploadRegistry } from "../upload-registry";

it("停用立即结束在途等待，旧代迟到结果不交付", async () => {
  const registry = new RendererUploadRegistry();
  let finish!: (url: string) => void;
  let received: JsonValue;
  const host = new PluginHost({
    workspaceId: "test",
    storage: createMemoryStorage(),
    upload: registry,
  });
  host.registerTrusted(
    definePlugin({
      id: "test.upload",
      name: "上传",
      version: "1.0.0",
      create: () => ({
        activate(context) {
          context.upload.register({
            id: context.pluginId,
            name: "上传",
            upload: async (_file, config) => {
              received = config;
              return new Promise<string>(resolve => {
                finish = resolve;
              });
            },
          });
        },
      }),
    })
  );
  await host.enable("test.upload");
  const config = { directory: "old" };
  const pending = registry.upload(
    "test.upload",
    { name: "a", mimeType: "", content: new Uint8Array([1]) },
    config
  );
  await Promise.resolve();
  config.directory = "new";
  expect(received!).toEqual({ directory: "old" });
  const assertion = expect(pending).rejects.toThrow("停用");
  await host.disable("test.upload");
  await assertion;
  finish("https://test.invalid/a");
  await expect(
    registry.upload("test.upload", { name: "a", mimeType: "", content: new Uint8Array() }, {})
  ).rejects.toThrow("未启用");
  await host.dispose();
});

import { expect, it } from "vitest";
import { definePlugin, type UploadProviderDefinition } from "../index";
import { PluginHost, createMemoryStorage } from "../host";

it("上传提供方跟随激活生命周期，拒绝非HTTP地址及停用后的结果", async () => {
  let definition!: UploadProviderDefinition;
  let result = "file:///private/image.png";
  let finish: (() => void) | undefined;
  const host = new PluginHost({
    workspaceId: "test",
    storage: createMemoryStorage(),
    upload: {
      register: (_context, value) => {
        definition = value;
        return { dispose() {} };
      },
    },
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
            upload: async () => {
              if (result === "pending")
                await new Promise<void>(resolve => {
                  finish = resolve;
                });
              return result;
            },
          });
        },
      }),
    })
  );
  await host.enable("test.upload");
  const file = { name: "a.png", mimeType: "image/png", content: new Uint8Array([1]) };
  await expect(definition.upload(file, {})).rejects.toThrow("HTTP(S)");
  result = "https://images.test/a.png";
  await expect(definition.upload(file, {})).resolves.toBe(result);
  result = "pending";
  const pending = definition.upload(file, {});
  await host.disable("test.upload");
  result = "https://images.test/late.png";
  finish?.();
  await expect(pending).rejects.toThrow();
  await expect(definition.upload(file, {})).rejects.toThrow();
  await host.dispose();
});

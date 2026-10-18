import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { rendererUploadRegistry } from "../../src/app/plugins/upload-registry";
import { connectUploadRenderer } from "../../src/app/plugins/upload-bridge";

async function start() {
  const host = new PluginHost({
    workspaceId: "isolated-test",
    storage: createMemoryStorage(),
    upload: rendererUploadRegistry,
  });
  host.registerTrusted({
    id: "test.upload",
    name: "上传测试",
    version: "1.0.0",
    apiVersion: 1,
    create: () => ({
      activate(context) {
        context.upload.register({
          id: context.pluginId,
          name: "上传测试",
          upload: async (file, config) => {
            if (file.name === "pending") await new Promise(() => {});
            if (typeof window === "undefined") throw new Error("插件未在渲染进程执行");
            if (file.content[0] !== 0 || file.content[1] !== 255) throw new Error("二进制数据变化");
            if (
              !config ||
              typeof config !== "object" ||
              Array.isArray(config) ||
              config.path !== "images"
            )
              throw new Error("配置变化");
            return "https://resources.test/" + file.name;
          },
        });
      },
    }),
  });
  await host.enable("test.upload");
  const disconnect = connectUploadRenderer();
  Object.assign(window, { uploadTest: { disable: () => host.disable("test.upload"), disconnect } });
}
void start().catch(console.error);

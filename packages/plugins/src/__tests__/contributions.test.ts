import { expect, it } from "vitest";
import { definePlugin } from "../index";
import { createMemoryStorage, PluginHost } from "../host";

it("按插件统计实际注册的贡献，提前释放与停用后同步扣减", async () => {
  const host = new PluginHost({
    workspaceId: "work",
    storage: createMemoryStorage(),
    sync: { register: () => ({ dispose: () => undefined }) },
  });
  let releaseSecond!: () => void;
  host.registerTrusted({
    ...definePlugin({
      id: "example.sync",
      name: "示例",
      version: "1.0.0",
      create: () => ({
        activate(ctx) {
          ctx.commands.register({ id: "one", title: "一", run: () => null });
          const second = ctx.commands.register({ id: "two", title: "二", run: () => null });
          releaseSecond = () => void second.dispose();
          ctx.sync.register({ id: "example.sync", name: "远端", create: () => ({}) } as never);
        },
      }),
    }),
    skills: ["guide"],
  });
  expect(host.listContributions("example.sync")).toEqual({});
  await host.enable("example.sync");
  expect(host.listContributions("example.sync")).toEqual({ command: 2, sync: 1, skill: 1 });
  releaseSecond();
  expect(host.listContributions("example.sync")).toEqual({ command: 1, sync: 1, skill: 1 });
  await host.disable("example.sync");
  expect(host.listContributions("example.sync")).toEqual({});
  expect(host.listContributions("missing")).toEqual({});
});

import { expect, it, vi } from "vitest";
import { PluginContentStartup } from "../plugin-content-startup";
import type { DevelopmentPluginPackage } from "@tau/plugins/host";

it("多个窗口共享首次启动快照，启停与磁盘变化到新进程才生效", async () => {
  const read = vi.fn(
    async (id: string) =>
      ({ manifest: { id, editor: true }, code: "first" }) as DevelopmentPluginPackage
  );
  const startup = new PluginContentStartup(read);
  expect(await startup.uses("one")).toBe(false);
  const first = startup.get(["one"]);
  expect(startup.get(["two"])).toBe(first);
  expect((await first).artifacts[0].manifest.id).toBe("one");
  expect(await startup.uses("one")).toBe(true);
  expect((await startup.get([])).artifacts).toHaveLength(1);
  expect(read).toHaveBeenCalledTimes(1);
  expect((await new PluginContentStartup(read).get(["two"])).artifacts[0].manifest.id).toBe("two");
});

it("损坏包逐项报告，不阻止其他内容插件；非法请求不锁住快照", async () => {
  const startup = new PluginContentStartup(async id => {
    if (id === "bad") throw new Error("损坏");
    return { manifest: { id, editor: true }, code: "ok" } as DevelopmentPluginPackage;
  });
  await expect(startup.get(null as unknown as string[])).rejects.toThrow("列表");
  const result = await startup.get(["bad", "../outside", "good"]);
  expect(result.artifacts.map(item => item.manifest.id)).toEqual(["good"]);
  expect(result.errors.bad).toBe("损坏");
  expect(result.errors["../outside"]).toBeTruthy();
});

it("普通插件定义经检查后不进入静态快照，也不被当作已加载内容插件", async () => {
  const startup = new PluginContentStartup(async id =>
    id === "ordinary"
      ? undefined
      : ({ manifest: { id, formatVersion: 3 }, code: "static" } as never)
  );
  const result = await startup.get(["ordinary", "content"]);
  expect(result.artifacts.map(item => item.manifest.id)).toEqual(["content"]);
  expect(result.errors).toEqual({});
  expect(await startup.uses("ordinary")).toBe(false);
  expect(await startup.uses("content")).toBe(true);
});

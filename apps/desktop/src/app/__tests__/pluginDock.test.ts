import { afterEach, expect, it } from "vitest";
import { registerPluginDockGuard, type PluginDockTarget } from "../pluginDock";
import { useShellStore } from "../shellStore";

const target: PluginDockTarget = {
  title: "资料",
  pluginId: "sample",
  pageId: "sources",
  instanceId: "a",
  mountId: 1,
  params: {},
};
const shell = useShellStore.getState;
const active = () => true;
afterEach(() => {
  shell().releasePluginDock();
  shell().hideAssist();
});

it("守卫拒绝时保留原实例，同一实例仍能更新参数", async () => {
  await shell().openPluginDock(target, active);
  const release = registerPluginDockGuard(() => false);
  try {
    const updated = { ...target, params: { filter: "book" } };
    expect(await shell().openPluginDock(updated, active)).toBe(true);
    expect(await shell().openPluginDock({ ...target, instanceId: "b" }, active)).toBe(false);
    expect(await shell().showAssistOver("web")).toBe(false);
    expect(shell().pluginDock).toEqual(updated);
  } finally {
    release();
  }
});

it("切库使正在等待守卫的打开请求失效", async () => {
  await shell().openPluginDock(target, active);
  const approval = Promise.withResolvers<boolean>();
  const release = registerPluginDockGuard(() => approval.promise);
  try {
    const opening = shell().openPluginDock({ ...target, instanceId: "b" }, active);
    shell().releasePluginDock();
    approval.resolve(true);
    expect(await opening).toBe(false);
    expect(shell().assistView).toBeNull();
  } finally {
    release();
  }
});

it("网页盖住新一代插件时，旧代清理不会移除返回目标；新代注销只释放插件", async () => {
  await shell().openPluginDock({ ...target, mountId: 2 }, active);
  await shell().showAssistOver("web");
  shell().releasePluginDock(1);
  shell().closeAssist("web");
  expect(shell().pluginDock?.mountId).toBe(2);
  await shell().showAssistOver("web");
  shell().releasePluginDock(2);
  expect(shell().assistView).toBe("web");
  shell().closeAssist("web");
  expect(shell().assistView).toBeNull();
});

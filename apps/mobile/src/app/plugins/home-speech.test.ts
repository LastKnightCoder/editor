import { afterEach, expect, it, vi } from "vitest";
import { definePlugin, type PluginContext } from "@tau/plugins";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { setMobileSettingSnapshot } from "../../services/mobileSettingsBridge";
import type { SettingCompat } from "../../types";
import { MobilePluginRuntime } from "./runtime";

const runtime = () =>
  new MobilePluginRuntime(
    createPluginEnvironmentStore({
      platform: "ios",
      input: { coarsePointer: true, finePointer: false },
    }),
    createMemoryStorage(),
    "A.db",
    { push: vi.fn() },
    "0.2.16"
  );

async function activate(target: MobilePluginRuntime, permissions: string[] = []) {
  let context!: PluginContext;
  target.host.registerTrusted({
    ...definePlugin({
      id: "fixture.home",
      name: "首页",
      version: "1.0.0",
      create: () => ({
        activate(current) {
          context = current;
        },
      }),
    }),
    permissions: permissions as never,
  });
  await target.host.enable("fixture.home");
  return context;
}

afterEach(() => setMobileSettingSnapshot(null));

it("首页面板注册后出现在今天页，重复 id 被拒绝，插件停用后消失", async () => {
  const target = runtime();
  const context = await activate(target);
  const listener = vi.fn();
  target.subscribe(listener);
  context.home.registerPanel({
    id: "today",
    title: "减重",
    size: "compact",
    component: () => null,
  });
  expect([...target.homePanels.values()]).toMatchObject([
    { id: "fixture.home:today", definition: { title: "减重", size: "compact", action: null } },
  ]);
  expect(listener).toHaveBeenCalled();
  expect(() =>
    context.home.registerPanel({ id: "today", title: "又一个", component: () => null })
  ).toThrow("首页面板已注册");
  expect(target.contributions("fixture.home").homePanels).toBe(1);
  await target.host.disable("fixture.home");
  expect(target.homePanels.size).toBe(0);
  await target.dispose();
});

it("插件语音输入沿用应用的识别设置：插件账号未配置时给出原因且不录音", async () => {
  const target = runtime();
  const start = vi.fn();
  target.speech = {
    unavailableReason: () => "识别插件账号尚未配置",
    start,
  };
  const context = await activate(target, ["speech:input"]);
  expect(context.speech.unavailableReason()).toBe("识别插件账号尚未配置");
  await target.dispose();
});

it("插件语音输入的不可用原因与应用听写一致", async () => {
  const { speechUnavailableReason } = await import("./speech");
  setMobileSettingSnapshot({
    speechInput: {
      active: "plugin",
      language: "zh-CN",
      plugin: { id: "asr.x", configurations: {} },
    },
  } as unknown as SettingCompat);
  expect(speechUnavailableReason()).toBe("识别插件账号尚未配置");
  setMobileSettingSnapshot({
    speechInput: { active: "native", language: "zh-CN", plugin: { id: "", configurations: {} } },
  } as unknown as SettingCompat);
  expect(speechUnavailableReason()).toBeNull();
});

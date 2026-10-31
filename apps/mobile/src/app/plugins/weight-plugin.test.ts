/**
 * 用减重插件的实际构建产物（plugins/tau-plugin-weight/dist）验证移动宿主：
 * 校验并启用后注册功能入口与今天页卡片，不调用仅桌面的侧边栏。没有构建产物时跳过。
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transferableAbortController } from "node:util";
import { webcrypto } from "node:crypto";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { mobileSharedPluginModules } from "./shared-modules";
import { MobilePluginRuntime } from "./runtime";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const dist = path.join(root, "plugins/tau-plugin-weight/dist");
const zipPath = existsSync(dist)
  ? (() => {
      const version = JSON.parse(
        readFileSync(path.join(root, "plugins/tau-plugin-weight/manifest.json"), "utf8")
      ).version;
      const file = path.join(dist, `tau.weight-${version}.zip`);
      return existsSync(file) ? file : null;
    })()
  : null;

/** 本测试只验证装配：业务事件与插件记录给最小实现 */
function attachData(runtime: MobilePluginRuntime) {
  runtime.events = {
    adapter: { subscribe: () => ({ dispose: () => undefined }) },
    dispose: () => undefined,
  } as never;
  runtime.own = {
    records: {
      registerCollection: () => ({ dispose: () => undefined }),
      query: async () => ({ items: [] }),
    },
    ready: async () => undefined,
    dispose: () => undefined,
  } as never;
}

function artifact() {
  const read = (name: string) =>
    execFileSync("unzip", ["-p", zipPath!, `tau.weight/${name}`], {
      encoding: "utf8",
      maxBuffer: 8 << 20,
    });
  return {
    kind: "plugin" as const,
    manifest: JSON.parse(read("manifest.json")),
    code: read("main.js"),
    css: read("main.css"),
  };
}

beforeEach(() => {
  const controller = transferableAbortController();
  vi.stubGlobal("AbortController", controller.constructor);
  vi.stubGlobal("AbortSignal", controller.signal.constructor);
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

describe.skipIf(!zipPath)("减重插件在移动宿主上", () => {
  for (const platform of ["android", "ios"] as const)
    it(`${platform}：启用后有功能入口、今天页卡片与两个页面`, async () => {
      const runtime = new MobilePluginRuntime(
        createPluginEnvironmentStore({
          platform,
          input: { coarsePointer: true, finePointer: false },
        }),
        createMemoryStorage(),
        "A.db",
        { push: vi.fn() },
        "0.2.16"
      );
      attachData(runtime);
      try {
        await runtime.start(
          [{ id: "tau.weight", artifact: artifact(), enabled: true }],
          mobileSharedPluginModules
        );
        expect([...runtime.errors]).toEqual([]);
        expect(
          [...runtime.entries.values()].map(e => [e.definition.title, typeof e.definition.icon])
        ).toEqual([["减重", "object"]]);
        expect(
          [...runtime.homePanels.values()].map(p => [
            p.definition.title,
            p.definition.size,
            p.definition.action,
          ])
        ).toEqual([["减重", "compact", null]]);
        expect([...runtime.pages.keys()].sort()).toEqual(["tau.weight:trend", "tau.weight:weight"]);
      } finally {
        await runtime.dispose();
      }
    });

  it("低于声明的最低版本时拒绝启用", async () => {
    const runtime = new MobilePluginRuntime(
      createPluginEnvironmentStore({
        platform: "android",
        input: { coarsePointer: true, finePointer: false },
      }),
      createMemoryStorage(),
      "A.db",
      { push: vi.fn() },
      "0.2.15"
    );
    try {
      await runtime.start(
        [{ id: "tau.weight", artifact: artifact(), enabled: true }],
        mobileSharedPluginModules
      );
      expect(runtime.errors.get("tau.weight")).toBeTruthy();
      expect(runtime.entries.size).toBe(0);
    } finally {
      await runtime.dispose();
    }
  });
});

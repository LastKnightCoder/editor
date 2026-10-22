/**
 * 问题管理发布包的真实入口经桌面运行时启用：宿主按 manifest 校验激活期的每个注册与订阅，
 * 声明漏掉一项权限时启用即失败（迁移随之失败），这里在发布前拦住。
 */
import { pluginArtifact } from "../../../test-fixtures/plugin-packages";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryStorage } from "@tau/plugins/host";
import { DesktopPluginRuntime } from "@/app/plugins/runtime";
import { registerPluginPackage } from "@/app/plugins/package-loader";
import { sharedPluginModules } from "@/app/plugins/shared-modules";
import { createDesktopData } from "@/app/plugins/data";
import { createDesktopEvents } from "@/app/plugins/events";
import { createDesktopApp } from "@/app/plugins/app";
import { createDesktopEntities } from "@/app/plugins/entities";
import { createDesktopRecords } from "@/app/plugins/records";
import { createDesktopLinks } from "@/app/plugins/links";
import { createDesktopTransaction } from "@/app/plugins/transaction";

/** 空库：查询返回空页、计数为 0，新建的记录原样回写 */
const invoke = vi.hoisted(() =>
  vi.fn(async (channel: string, request?: Record<string, unknown>) => {
    if (channel.endsWith(":query")) return { items: [] };
    if (channel.endsWith(":count")) return 0;
    if (channel === "plugin-records:insert")
      return { ...request, revision: 1, createTime: 1, updateTime: 1 };
    return undefined;
  })
);
vi.mock("@/electron", () => ({
  invoke,
  isElectron: true,
  platform: "darwin",
  on: vi.fn(),
  off: vi.fn(),
}));

const mcpRegister = vi.fn(() => ({ dispose: () => undefined }));
const runtimes: DesktopPluginRuntime[] = [];
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.dispose();
});

describe("问题管理插件", () => {
  it("发布包能在桌面运行时启用，问题页已注册", async () => {
    const runtime = new DesktopPluginRuntime({
      workspaceId: "w",
      storage: createMemoryStorage(),
      navigator: { push: vi.fn() },
      plugins: [],
      data: createDesktopData("data.db"),
      events: createDesktopEvents("data.db"),
      app: createDesktopApp("data.db"),
      entities: createDesktopEntities("data.db"),
      records: createDesktopRecords("data.db"),
      links: createDesktopLinks("data.db"),
      transaction: createDesktopTransaction("data.db"),
      mcp: { register: mcpRegister },
    });
    runtimes.push(runtime);
    registerPluginPackage(
      runtime.host,
      pluginArtifact("tau.questions"),
      async () => sharedPluginModules
    );
    await runtime.host.enable("tau.questions");
    expect(runtime.host.getState("tau.questions")).toBe("active");
    expect(runtime.getPage("tau.questions", "questions")).toBeTruthy();
    expect(mcpRegister).toHaveBeenCalledTimes(1);
  });
});

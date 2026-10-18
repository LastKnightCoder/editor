import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import {
  PluginActivationManager,
  builtinPluginStateKey,
} from "../../src/app/plugins/activation-manager";
import { themePlugin } from "../../src/features/plugins/__tests__/fixtures/themePlugin";
import { initThemeRuntime } from "@tau/themes/react";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function verify(phase: string) {
  const stopTheme = initThemeRuntime();
  const host = new PluginHost({ workspaceId: phase, storage: createMemoryStorage() });
  host.registerTrusted(themePlugin);
  const manager = new PluginActivationManager(
    host,
    [themePlugin.id],
    localStorage,
    () => undefined
  );
  const key = builtinPluginStateKey(themePlugin.id);
  try {
    await manager.restore();
    assert(!manager.error(themePlugin.id), "恢复失败");
    if (phase === "enable") {
      assert(host.getState(themePlugin.id) === "disabled", "首次应默认停用");
      await manager.enable(themePlugin.id);
      assert(host.listCommands().length === 2, "启用后命令不完整");
      await host.executeCommand("core.theme:cycle-appearance");
    } else if (phase === "restore-and-disable") {
      assert(host.getState(themePlugin.id) === "active", "新进程未自动恢复启用");
      assert(host.listCommands().length === 2, "恢复命令重复或缺失");
      await host.executeCommand("core.theme:cycle-appearance");
      await manager.disable(themePlugin.id);
    } else if (phase === "remain-disabled") {
      assert(host.getState(themePlugin.id) === "disabled", "主动停用后不应自动启用");
      assert(host.listCommands().length === 0, "停用插件仍有命令");
    } else throw new Error("未知验证阶段");
  } finally {
    manager.cancel();
    await host.dispose();
    stopTheme();
  }
  const saved = localStorage.getItem(key);
  assert(saved === (phase === "enable" ? "true" : "false"), "清理改写了启用意图");
  return { phase, saved, commandsAfterCleanup: host.listCommands().length };
}

Object.assign(globalThis, { verifyBuiltinPersistence: verify });

import { useState } from "react";
import type { DesktopPluginRuntime } from "@/app/plugins/runtime";
import { cancelLocalPluginUpdate, restoreLocalPlugin } from "@/commands/plugin-local";
import type { InstalledPlugin } from "./model";

/** 单个插件的管理操作：按来源交给对应管理器，忙态与错误按插件就地展示。 */
export function usePluginControl(runtime: DesktopPluginRuntime, plugin: InstalledPlugin) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = plugin.info.id;
  const state = plugin.info.state;
  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallback);
    } finally {
      setBusy(false);
    }
  };
  const manager = runtime.local?.owns(id) ? runtime.local : runtime.host;
  const managing = busy || Boolean(runtime.local?.busy());
  const transitioning = state === "activating" || state === "deactivating";
  const refreshLocal = async () => {
    await runtime.local?.refresh();
  };
  return {
    busy: managing,
    error,
    canToggle:
      !plugin.packageKind &&
      !managing &&
      !transitioning &&
      !(state === "restart-required" && !plugin.enabled),
    toggle: () =>
      run(() => (plugin.enabled ? manager.disable(id) : manager.enable(id)), "操作失败"),
    uninstall: (purgeData: boolean) =>
      run(async () => runtime.local?.uninstall(id, purgeData), "卸载失败"),
    restorePrevious: () =>
      run(async () => {
        await restoreLocalPlugin(id);
        await refreshLocal();
      }, "恢复失败"),
    cancelUpdate: () =>
      run(async () => {
        await cancelLocalPluginUpdate(id);
        await refreshLocal();
      }, "取消失败"),
  };
}

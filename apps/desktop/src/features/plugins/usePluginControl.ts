import { usePluginI18n, type PluginMessageKey } from "./i18n";
import { useState } from "react";
import type { DesktopPluginRuntime } from "@/app/plugins/runtime";
import { cancelLocalPluginUpdate, restoreLocalPlugin } from "@/commands/plugin-local";
import type { InstalledPlugin } from "./model";

/** 单个插件的管理操作：按来源交给对应管理器，忙态与错误按插件就地展示。 */
export function usePluginControl(runtime: DesktopPluginRuntime, plugin: InstalledPlugin) {
  const { t } = usePluginI18n();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ cause: unknown; key: PluginMessageKey } | null>(null);
  const id = plugin.info.id;
  const state = plugin.info.state;
  const run = async (action: () => Promise<unknown>, fallback: PluginMessageKey) => {
    setBusy(true);
    setFailure(null);
    try {
      await action();
      return true;
    } catch (cause) {
      setFailure({ cause, key: fallback });
      return false;
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
    error: failure ? (failure.cause instanceof Error ? failure.cause.message : t(failure.key)) : "",
    canToggle:
      !plugin.packageKind &&
      !managing &&
      !transitioning &&
      !(state === "restart-required" && !plugin.enabled),
    toggle: () =>
      run(() => (plugin.enabled ? manager.disable(id) : manager.enable(id)), "common.actionFailed"),
    uninstall: (purgeData: boolean) =>
      run(async () => runtime.local?.uninstall(id, purgeData), "common.uninstallFailed"),
    restorePrevious: () =>
      run(async () => {
        await restoreLocalPlugin(id);
        await refreshLocal();
      }, "common.restoreFailed"),
    cancelUpdate: () =>
      run(async () => {
        await cancelLocalPluginUpdate(id);
        await refreshLocal();
      }, "common.cancelFailed"),
  };
}

import { pluginTranslator, usePluginI18n, pluginError } from "./i18n";
import { useState } from "react";
import { comparePluginVersions } from "@tau/plugins/package";
import { describeCenterPermissions } from "@tau/plugins/center";
import { InstallSheet, type InstallSheetState } from "./components/InstallSheet";
import { releasePermissions } from "./components/centerDisplay";
import { installClosedReason } from "./components/storeActions";
import {
  useMobileCenterInstall,
  useMobileCenterResolution,
  useMobileCenterRelease,
} from "./data/center-queries";
const t = pluginTranslator.t;

/** 选版 → 确认 → 下载/校验 → 待生效；挂载即打开，由调用方在 onClose 后卸载。下载中关闭面板不影响任务。 */
export function CenterInstallSheet({
  pluginId,
  name,
  installedVersion,
  installedPermissions = [],
  onClose,
}: {
  pluginId: string;
  name: string;
  installedVersion: string | null;
  installedPermissions?: readonly string[];
  onClose: () => void;
}) {
  usePluginI18n();
  const install = useMobileCenterInstall();
  const { config, query } = useMobileCenterResolution(pluginId);
  const task = install.task(pluginId);
  const taskRelease = useMobileCenterRelease(task?.releaseId ?? null);
  const [doneVersion, setDoneVersion] = useState<string | null>(null);
  const release = query.data?.release ?? null;
  const mode = installedVersion ? "update" : "install";
  const taskVersion =
    taskRelease.data?.version ??
    (task && task.releaseId === release?.releaseId ? release.version : undefined);

  let state: InstallSheetState;
  if (task?.status === "pending")
    state = {
      kind: "installing",
      phase: task.phase === "checking" || task.phase === "queued" ? task.phase : "downloading",
      version: taskVersion,
    };
  else if (task?.status === "error")
    state = {
      kind: "failed",
      version: taskVersion ?? "",
      message: pluginError(task.error),
    };
  else if (doneVersion) state = { kind: "done", version: doneVersion };
  else if (config.isError)
    state = { kind: "unavailable", reasons: [], message: String(config.error) };
  else if (config.data && !config.data.host)
    state = { kind: "unavailable", reasons: [], message: t("center.mobileCannotInstall") };
  else if (query.isError)
    state = { kind: "unavailable", reasons: [], message: String(query.error) };
  else if (!query.data) state = { kind: "resolving" };
  else if (!release) state = { kind: "unavailable", reasons: query.data.compatibility.reasons };
  else if (!config.data?.installationEnabled)
    state = { kind: "unavailable", reasons: [], message: installClosedReason() };
  else if (installedVersion && comparePluginVersions(release.version, installedVersion) <= 0)
    state = {
      kind: "unavailable",
      reasons: [],
      message: t("center.noHigher", { version: installedVersion }),
    };
  else
    state = {
      kind: "confirm",
      version: release.version,
      size: release.size,
      permissions: releasePermissions(release),
      newPermissions: installedVersion
        ? describeCenterPermissions(releasePermissions(release), installedPermissions)
            .filter(permission => permission.newlyRequested)
            .map(permission => permission.permission)
        : [],
    };

  const start = () => {
    if (!release) return;
    const version = release.version;
    // 失败与取消都落在应用级任务上，由上面的状态投影呈现
    install
      .install(pluginId, release.releaseId)
      .then(() => setDoneVersion(version))
      .catch(() => undefined);
  };

  return (
    <InstallSheet
      open
      mode={mode}
      name={name}
      state={state}
      onConfirm={start}
      onCancelInstall={() => void install.cancel(pluginId).catch(() => undefined)}
      onClose={onClose}
    />
  );
}

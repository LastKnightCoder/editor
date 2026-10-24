import { useState } from "react";
import { comparePluginVersions } from "@tau/plugins/package";
import { describeCenterPermissions } from "@tau/plugins/center";
import { InstallSheet, type InstallSheetState } from "./components/InstallSheet";
import { releasePermissions } from "./components/centerDisplay";
import { INSTALL_CLOSED_REASON } from "./components/storeActions";
import {
  useMobileCenterInstall,
  useMobileCenterResolution,
  useMobileCenterRelease,
} from "./data/center-queries";

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
      message: task.error instanceof Error ? task.error.message : String(task.error),
    };
  else if (doneVersion) state = { kind: "done", version: doneVersion };
  else if (config.isError)
    state = { kind: "unavailable", reasons: [], message: String(config.error) };
  else if (config.data && !config.data.host)
    state = { kind: "unavailable", reasons: [], message: "当前平台不能安装移动插件" };
  else if (query.isError)
    state = { kind: "unavailable", reasons: [], message: String(query.error) };
  else if (!query.data) state = { kind: "resolving" };
  else if (!release) state = { kind: "unavailable", reasons: query.data.compatibility.reasons };
  else if (!config.data?.installationEnabled)
    state = { kind: "unavailable", reasons: [], message: INSTALL_CLOSED_REASON };
  else if (installedVersion && comparePluginVersions(release.version, installedVersion) <= 0)
    state = {
      kind: "unavailable",
      reasons: [],
      message: `已安装 v${installedVersion}，没有更高的可用版本`,
    };
  else
    state = {
      kind: "confirm",
      version: release.version,
      size: release.size,
      permissions: describeCenterPermissions(releasePermissions(release), installedPermissions).map(
        permission =>
          `${installedVersion && permission.newlyRequested ? "新增：" : ""}${permission.label}`
      ),
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

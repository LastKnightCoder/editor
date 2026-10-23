import { useRef, useState } from "react";
import { comparePluginVersions } from "@tau/plugins/package";
import { describeCenterPermissions } from "@tau/plugins/center";
import { InstallSheet, type InstallSheetState } from "./components/InstallSheet";
import { INSTALL_CLOSED_REASON } from "./components/storeActions";
import {
  useMobileCenterInstall,
  useMobileCenterResolution,
  useMobileCenterRelease,
} from "./data/center-queries";

type InstallController = ReturnType<typeof useMobileCenterInstall>;

/** 选版 → 确认 → 下载/校验 → 待生效；挂载即打开，由调用方在 onClose 后卸载。 */
export function CenterInstallSheet({
  pluginId,
  name,
  installedVersion,
  installedPermissions = [],
  install,
  onClose,
}: {
  pluginId: string;
  name: string;
  installedVersion: string | null;
  installedPermissions?: readonly string[];
  /** 所有页面订阅同一应用级安装任务。 */
  install: InstallController;
  onClose: () => void;
}) {
  const { config, query } = useMobileCenterResolution(pluginId);
  const task = install.task?.pluginId === pluginId ? install.task : null;
  const taskRelease = useMobileCenterRelease(task?.releaseId ?? null);
  const [attempt, setAttempt] = useState<
    { version: string; result: "running" | "done" } | { version: string; error: string } | null
  >(null);
  const cancelled = useRef(false);
  const release = query.data?.release ?? null;
  const mode = installedVersion ? "update" : "install";
  const activeVersion = attempt?.version ?? taskRelease.data?.version;

  let state: InstallSheetState;
  if (task?.status === "pending")
    state = {
      kind: "installing",
      phase: install.phase === "checking" ? "checking" : "downloading",
      version: activeVersion,
    };
  else if (attempt && "error" in attempt)
    state = { kind: "failed", version: attempt.version, message: attempt.error };
  else if (attempt?.result === "done") state = { kind: "done", version: attempt.version };
  else if (attempt && (install.phase === "downloading" || install.phase === "checking"))
    state = { kind: "installing", phase: install.phase, version: attempt.version };
  else if (attempt) state = { kind: "installing", phase: "downloading", version: attempt.version };
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
      permissions: describeCenterPermissions(
        "permissions" in release.content.manifest
          ? (release.content.manifest.permissions ?? [])
          : [],
        installedPermissions
      ).map(
        permission =>
          `${installedVersion && permission.newlyRequested ? "新增：" : ""}${permission.label}`
      ),
    };

  const start = () => {
    const target = release ?? null;
    if (!target) return;
    cancelled.current = false;
    setAttempt({ version: target.version, result: "running" });
    install
      .install(pluginId, target.releaseId)
      .then(() => setAttempt({ version: target.version, result: "done" }))
      .catch((error: unknown) =>
        // 用户主动取消回到确认步骤，不当作失败
        setAttempt(
          cancelled.current
            ? null
            : {
                version: target.version,
                error: error instanceof Error ? error.message : String(error),
              }
        )
      );
  };

  return (
    <InstallSheet
      open
      mode={mode}
      name={name}
      state={state}
      onConfirm={start}
      onCancelInstall={() => {
        cancelled.current = true;
        void install
          .cancel()
          .catch(error => setAttempt({ version: activeVersion ?? "", error: String(error) }));
      }}
      onClose={onClose}
    />
  );
}

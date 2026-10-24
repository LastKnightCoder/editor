import { comparePluginVersions } from "@tau/plugins/package";
import type { CenterInstallTask } from "../../../app/plugins/center-install";
import type { StoreTaskPhase } from "./StoreActionButton";

export const INSTALL_CLOSED_REASON = "当前版本的 Tau 暂未开放插件安装";

/** 商店主动作的展示投影；是否允许与目标版本由逻辑层按已装版本和兼容结果给出。 */
export type StorePrimaryAction =
  | { kind: "install" | "update"; version: string; allowed: boolean; reason?: string }
  | { kind: "installed"; version: string }
  /** 已下载、等待插件会话重载后生效；version 为 null 表示清单不知道待生效版本号。 */
  | { kind: "pending"; version: string | null }
  | { kind: "unavailable" };

/** 本机清单里与商店判定相关的字段；首装待生效时 version 为 null、pending 为 true。 */
export interface InstalledSnapshot {
  version: string | null;
  pending?: boolean;
  pendingVersion?: string | null;
}

/**
 * 商店主动作的展示投影：可安装版本取自选版结果，已装版本取自本机清单；
 * 有待生效包时一律显示待生效（含尚无当前版本的首装），只有候选版本高于已装版本才提示更新。
 * 是否真正允许安装由原生安装流程再次核验。
 */
export function storePrimaryAction(input: {
  compatibleVersion: string | null;
  installed: InstalledSnapshot | null;
  installationEnabled: boolean;
}): StorePrimaryAction {
  const { compatibleVersion, installed, installationEnabled } = input;
  if (installed?.pending) return { kind: "pending", version: installed.pendingVersion ?? null };
  const installedVersion = installed?.version ?? null;
  if (
    installedVersion &&
    (!compatibleVersion || comparePluginVersions(compatibleVersion, installedVersion) <= 0)
  )
    return { kind: "installed", version: installedVersion };
  if (!compatibleVersion) return { kind: "unavailable" };
  return {
    kind: installedVersion ? "update" : "install",
    version: compatibleVersion,
    allowed: installationEnabled,
    ...(installationEnabled ? {} : { reason: INSTALL_CLOSED_REASON }),
  };
}

/** 应用级安装任务落到某个插件上的阶段：排队/下载/校验中、失败可重试，其余为 null。 */
export function storeTaskPhase(
  task: Pick<CenterInstallTask, "status" | "phase"> | null
): StoreTaskPhase {
  if (!task) return null;
  if (task.status === "pending")
    return task.phase === "checking"
      ? "checking"
      : task.phase === "queued"
        ? "queued"
        : "downloading";
  return task.status === "error" ? "failed" : null;
}

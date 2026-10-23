import { comparePluginVersions } from "@tau/plugins/package";
import type { StorePrimaryAction } from "./StoreEntryCard";

export const INSTALL_CLOSED_REASON = "当前版本的 Tau 暂未开放插件安装";

/**
 * 商店主动作的展示投影：可安装版本取自选版结果，已装版本取自本机清单；
 * 只有候选版本高于已装版本才提示更新。是否真正允许安装由原生安装流程再次核验。
 */
export function storePrimaryAction(input: {
  compatibleVersion: string | null;
  installedVersion: string | null;
  installationEnabled: boolean;
}): StorePrimaryAction {
  const { compatibleVersion, installedVersion, installationEnabled } = input;
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

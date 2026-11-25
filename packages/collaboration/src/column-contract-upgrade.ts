import type { DataContract } from "@tau/db-schema/content-contracts";
import { sharedValueEquals } from "./shared-values";

/** 分栏升级只放宽收纳能力，不允许改变正文、资源、类型或字段绑定。 */
export function canUpgradeColumnContract(
  from: DataContract | undefined,
  to: DataContract | undefined
): boolean {
  if (
    !from ||
    !to ||
    from.domain !== "whiteboard-element" ||
    to.domain !== "whiteboard-element" ||
    from.owner !== "host.whiteboard" ||
    to.owner !== from.owner ||
    from.type !== "column" ||
    to.type !== from.type ||
    from.dataVersion !== 1 ||
    to.dataVersion !== 2 ||
    from.structure.container !== "layout" ||
    from.structure.canBeContained !== false ||
    to.structure.canBeContained !== true
  )
    return false;
  return sharedValueEquals(
    { ...from, dataVersion: 2, structure: { ...from.structure, canBeContained: true } },
    to
  );
}

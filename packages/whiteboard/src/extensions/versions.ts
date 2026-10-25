import { assertDataVersions } from "@tau/db-schema/data-versions";
import { normalizeWhiteboardContract } from "@tau/db-schema/content-contracts";
import type { WhiteboardElementDefinition } from "./api";
export function assertWhiteboardElementVersions(element: WhiteboardElementDefinition): void {
  if (
    element.dataVersion !== undefined &&
    (element.schemaVersion !== undefined || element.migrate !== undefined)
  )
    throw new Error("新契约不能混用 schemaVersion/migrate");
  assertDataVersions(element, value => {
    if (value.schemaVersion !== undefined || value.migrate !== undefined)
      throw new Error("历史定义不能混用旧版本字段");
    return normalizeWhiteboardContract("validation", {
      type: value.type,
      dataVersion: value.dataVersion!,
      collaboration: value.collaboration,
      resources: value.resources,
      structure: {
        canBeContained: value.containment?.canBeContained,
        joins: value.containment?.joins,
      },
    });
  });
}

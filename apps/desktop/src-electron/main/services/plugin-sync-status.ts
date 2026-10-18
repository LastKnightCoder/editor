import { createHash } from "node:crypto";

export function pluginSyncStatusFile(pluginId: string, config: unknown) {
  return (
    "plugin-" +
    createHash("sha256")
      .update(
        JSON.stringify([pluginId, config], (_key, value) =>
          value && typeof value === "object" && !Array.isArray(value)
            ? Object.fromEntries(
                Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
              )
            : value
        )
      )
      .digest("hex")
      .slice(0, 24) +
    ".json"
  );
}

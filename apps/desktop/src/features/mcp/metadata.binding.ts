import { desktopI18n } from "@/app/i18n/runtime";
import { mcpMetadataMessages, type McpMetadataKey } from "./metadata.messages";
export const mcpMetadataT = desktopI18n.get(mcpMetadataMessages).t;
export function providerMetadataText(
  id: string,
  field: "name" | "description",
  fallback: string
): string {
  const key = `server.${id}.${field}`;
  return Object.hasOwn(mcpMetadataMessages.resources["zh-CN"], key)
    ? mcpMetadataT(key as McpMetadataKey)
    : fallback;
}

export function metadataSearchText(keys: readonly McpMetadataKey[], fallback = ""): string {
  return [
    fallback,
    ...Object.values(mcpMetadataMessages.resources).flatMap(resource =>
      keys.map(key => resource[key])
    ),
  ].join("\n");
}
export function providerMetadataSearchText(id: string, name: string, description: string): string {
  const keys = [`server.${id}.name`, `server.${id}.description`].filter(key =>
    Object.hasOwn(mcpMetadataMessages.resources["zh-CN"], key)
  ) as McpMetadataKey[];
  return metadataSearchText(keys, `${name}\n${description}`);
}

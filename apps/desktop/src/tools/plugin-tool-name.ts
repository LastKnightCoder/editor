export async function getPluginToolName(
  pluginId: string,
  mcpId: string,
  toolName: string
): Promise<string> {
  const source = `plugin:${pluginId}:${mcpId}`;
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify([source, toolName]))
  );
  const hash = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join(
    ""
  );
  const suffix = toolName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 39);
  return `plugin_${hash.slice(0, 16)}_${suffix}`;
}

export async function getPluginToolId(
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

export async function getPluginToolName(
  pluginId: string,
  mcpId: string,
  toolName: string
): Promise<string> {
  const parts = mcpId === pluginId.split(".").at(-1) ? [pluginId] : [pluginId, mcpId];
  const namespace = parts.map(part => part.replace(/\./g, "_")).join("__");
  const name = `${namespace}__${toolName.replace(/_/g, "-")}`;
  // 常规名称使用可逆的分隔符映射；其余输入另加摘要，避免清洗与截断后碰撞。
  const readableId = /^[a-zA-Z0-9]+(?:[.-][a-zA-Z0-9]+)*$/;
  if (
    readableId.test(pluginId) &&
    readableId.test(mcpId) &&
    /^[a-zA-Z0-9]+(?:_[a-zA-Z0-9]+)*$/.test(toolName) &&
    name.length <= 64
  )
    return name;

  const id = await getPluginToolId(pluginId, mcpId, toolName);
  const source = namespace.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 18);
  const suffix = toolName.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 25);
  return `${source}__${suffix}___${id.slice(7, 23)}`;
}

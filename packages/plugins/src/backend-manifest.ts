export const PLUGIN_SYSTEM_ACCESS = ["filesystem", "network", "process"] as const;
export type PluginSystemAccess = (typeof PLUGIN_SYSTEM_ACCESS)[number];

export interface PluginBackendManifest {
  tools?: readonly { id: string; command: string; args?: readonly string[] }[];
  entry: string;
  runtime: "node";
  apiVersion: 1;
  scope: "application" | "workspace";
  activation: "on-demand" | "app-ready" | "workspace-ready";
  lifetime: "idle" | "persistent";
  reason: string;
  /** 系统用途披露，不表示操作系统级权限限制。 */
  systemAccess: readonly PluginSystemAccess[];
}

export function validateBackendManifest(value: unknown): PluginBackendManifest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("后台声明必须是对象");
  const item = value as Record<string, unknown>;
  if (
    typeof item.entry !== "string" ||
    !/^[\w./-]+\.js$/.test(item.entry) ||
    item.entry.split("/").some(part => !part || part === "." || part === "..")
  )
    throw new Error("后台入口必须是包内 JS 文件");
  if (item.runtime !== "node" || item.apiVersion !== 1)
    throw new Error("后台运行时或协议版本不兼容");
  if (item.scope !== "application" && item.scope !== "workspace") throw new Error("后台作用域无效");
  if (
    item.activation !== "on-demand" &&
    item.activation !== "app-ready" &&
    item.activation !== "workspace-ready"
  )
    throw new Error("后台激活时机无效");
  if (
    item.activation !== "on-demand" &&
    item.activation !== (item.scope === "application" ? "app-ready" : "workspace-ready")
  )
    throw new Error("后台激活时机与作用域不匹配");
  if (item.lifetime !== "idle" && item.lifetime !== "persistent")
    throw new Error("后台生命周期无效");
  if (typeof item.reason !== "string" || !item.reason.trim()) throw new Error("后台用途不能为空");
  if (
    !Array.isArray(item.systemAccess) ||
    item.systemAccess.some(value => !PLUGIN_SYSTEM_ACCESS.includes(value))
  )
    throw new Error("后台系统用途分类无效");
  let tools: PluginBackendManifest["tools"];
  if (item.tools !== undefined) {
    if (!Array.isArray(item.tools) || !item.systemAccess.includes("process"))
      throw new Error("外部工具须声明 process 用途");
    const ids = new Set<string>();
    tools = Object.freeze(
      item.tools.map((tool: unknown) => {
        if (!tool || typeof tool !== "object" || Array.isArray(tool))
          throw new Error("外部工具声明无效");
        const value = tool as Record<string, unknown>;
        if (
          typeof value.id !== "string" ||
          !/^[a-z][\w.-]*$/.test(value.id) ||
          ids.has(value.id) ||
          typeof value.command !== "string" ||
          !value.command.trim() ||
          value.command.includes("\0")
        )
          throw new Error("外部工具身份或命令无效");
        ids.add(value.id);
        if (
          value.args !== undefined &&
          (!Array.isArray(value.args) ||
            value.args.some(arg => typeof arg !== "string" || arg.includes("\0")))
        )
          throw new Error("外部工具参数无效");
        return Object.freeze({
          id: value.id,
          command: value.command,
          ...(value.args ? { args: Object.freeze([...(value.args as string[])]) } : {}),
        });
      })
    );
  }
  return Object.freeze({
    ...(tools ? { tools } : {}),
    entry: item.entry,
    runtime: "node",
    apiVersion: 1,
    scope: item.scope,
    activation: item.activation,
    lifetime: item.lifetime,
    reason: item.reason.trim(),
    systemAccess: Object.freeze([...new Set(item.systemAccess)]) as readonly PluginSystemAccess[],
  });
}

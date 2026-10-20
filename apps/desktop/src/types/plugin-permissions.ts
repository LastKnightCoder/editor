/** 插件授权 IPC 契约，主进程与渲染端共用。 */

/** 持久决定：始终允许，或连续拒绝后的已阻止 */
export type PluginPermissionGrant = "granted" | "blocked";

/** 插件 ID → 权限 → 持久决定 */
export type PluginPermissionSnapshot = Record<string, Record<string, PluginPermissionGrant>>;

export type PluginUsageKind = "read" | "write" | "delete";

/** 最近若干天的调用次数，供插件详情页展示 */
export interface PluginPermissionUsage {
  days: number;
  read: number;
  write: number;
  delete: number;
}

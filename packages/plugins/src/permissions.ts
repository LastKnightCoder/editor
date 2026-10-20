/**
 * 业务数据权限：manifest 的 permissions 声明插件可申请的上限，首次调用对应接口时由宿主
 * 弹窗询问用户。read 读取，write 新建与修改（含正文），delete 删除（可在插件详情页恢复）。
 * 插件与应用运行在同一环境，权限约束的是 SDK 接口，不是安全隔离。
 */
export const PLUGIN_PERMISSIONS = [
  "cards:read",
  "cards:write",
  "cards:delete",
  "articles:read",
  "articles:write",
  "articles:delete",
  "documents:read",
  "documents:write",
  "todos:read",
  "todos:write",
  "todos:delete",
  "calendar:read",
  "calendar:write",
  "calendar:delete",
] as const;

export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

const permissionIds = new Set<string>(PLUGIN_PERMISSIONS);

export const isPluginPermission = (value: unknown): value is PluginPermission =>
  typeof value === "string" && permissionIds.has(value);

/** granted：可直接调用；prompt：调用时会询问用户；denied：本次运行已拒绝或已被阻止 */
export type PluginPermissionState = "granted" | "prompt" | "denied";

/**
 * undeclared：manifest 未声明；denied：用户拒绝；blocked：用户已阻止，需到插件详情页解除；
 * unavailable：应用不在前台无法询问，请求已记入插件详情页等待用户处理。
 */
export type PluginPermissionDenial = "undeclared" | "denied" | "blocked" | "unavailable";

// 不用参数属性：本文件经 package.ts 被 Node 以仅剥离类型的方式直接加载
export class PluginPermissionError extends Error {
  override readonly name = "PluginPermissionError";
  readonly permission: PluginPermission;
  readonly reason: PluginPermissionDenial;
  constructor(permission: PluginPermission, reason: PluginPermissionDenial) {
    super(
      reason === "undeclared"
        ? `插件未声明权限：${permission}`
        : reason === "unavailable"
          ? `需要用户授权：${permission}`
          : `用户未授权：${permission}`
    );
    this.permission = permission;
    this.reason = reason;
  }
}

export interface PluginPermissions {
  query(permission: PluginPermission): Promise<PluginPermissionState>;
  /** 一次询问多项；全部获准时返回 true。已获准的不再询问。 */
  request(permissions: readonly PluginPermission[]): Promise<boolean>;
}

/** 读取 manifest.permissions；strict 用于门户上传，客户端静默丢弃未知权限。 */
export function readPermissionsField(
  item: Record<string, unknown>,
  strict: boolean
): { permissions?: readonly PluginPermission[] } {
  const fail = (message: string) => {
    if (strict) throw new Error(message);
  };
  if (item.permissions === undefined) return {};
  if (!Array.isArray(item.permissions)) {
    fail("permissions 必须是数组");
    return {};
  }
  const permissions: PluginPermission[] = [];
  for (const value of item.permissions) {
    if (!isPluginPermission(value)) fail(`未知插件权限：${String(value)}`);
    else if (!permissions.includes(value)) permissions.push(value);
  }
  return permissions.length ? { permissions: Object.freeze(permissions) } : {};
}

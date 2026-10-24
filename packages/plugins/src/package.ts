export { assertLocalId } from "./ids.ts";
import { comparePluginVersions } from "./version.ts";
import type { PluginCategory } from "./categories.ts";
import type { PluginPermission } from "./permissions.ts";
import { validateBackendManifest, type PluginBackendManifest } from "./backend-manifest.ts";
import { readPluginMetadata, readPluginFilePath, readPluginFiles } from "./package-fields.ts";
export {
  validateBackendManifest,
  PLUGIN_SYSTEM_ACCESS,
  type PluginBackendManifest,
  type PluginSystemAccess,
} from "./backend-manifest.ts";

export { comparePluginVersions } from "./version.ts";
export { PLUGIN_CATEGORIES, isPluginCategory, type PluginCategory } from "./categories.ts";
export { PLUGIN_PERMISSIONS, isPluginPermission, type PluginPermission } from "./permissions.ts";
export { PLUGIN_AI_CAPABILITIES, isPluginAICapability } from "./ai.ts";

export const PLUGIN_SHARED_MODULES = [
  "@tau/plugins",
  "@tau/plugins/whiteboard",
  "@tau/plugins/sync",
  "@tau/ui",
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
] as const;

export interface PluginManifest {
  formatVersion: 1 | 2;
  id: string;
  name: string;
  version: string;
  minAppVersion?: string;
  apiVersion: 1;
  platform: "desktop";
  format: "cjs";
  main: string;
  backend?: PluginBackendManifest;
  styles?: string;
  /** 静态编辑器贡献在窗口启动时装配，启停需重启。 */
  editor?: true;
  whiteboard?: true;
  /** 插件中心分类，作者自填，不与实际注册对账。 */
  categories?: readonly PluginCategory[];
  /** 仅参与搜索匹配。 */
  keywords?: readonly string[];
  /** 可申请的业务数据权限上限；实际授权由用户在调用时决定。 */
  permissions?: readonly PluginPermission[];
  /** 包内 `skills/<id>/` 目录，随插件启停。 */
  skills?: readonly string[];
  integrity: Record<string, string>;
}

/** 宿主内部传输的已读取产物，不属于作者运行时 API。 */
export interface DevelopmentPluginPackage {
  manifest: PluginManifest;
  code: string;
  css?: string;
}

/** 按实际使用的包字段解析身份、权限、入口和摘要。 */
export function validatePluginManifest(value: unknown): PluginManifest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("插件清单必须是对象");
  const item = value as Record<string, unknown>;
  if (
    (item.formatVersion !== 1 && item.formatVersion !== 2) ||
    item.apiVersion !== 1 ||
    item.platform !== "desktop" ||
    item.format !== "cjs"
  )
    throw new Error("插件包格式、API 版本或平台不兼容");
  const metadata = readPluginMetadata(item);
  const main = readPluginFilePath(item.main, ".js");
  const backend = item.backend === undefined ? undefined : validateBackendManifest(item.backend);
  if ((item.formatVersion === 2) !== Boolean(backend))
    throw new Error("后台声明必须使用包格式 2，普通插件使用格式 1");
  if (backend?.entry === main) throw new Error("后台入口不能与渲染入口相同");
  if (backend && typeof item.minAppVersion !== "string")
    throw new Error("后台插件必须声明最低客户端版本");
  if (item.minAppVersion !== undefined) {
    if (typeof item.minAppVersion !== "string") throw new Error("最低客户端版本无效");
    comparePluginVersions(item.minAppVersion, item.minAppVersion);
  }
  const styles = item.styles === undefined ? undefined : readPluginFilePath(item.styles, ".css");
  const files = readPluginFiles(item, [
    main,
    ...(styles ? [styles] : []),
    ...(backend ? [backend.entry] : []),
  ]);
  return Object.freeze({
    formatVersion: item.formatVersion,
    ...metadata,
    ...(typeof item.minAppVersion === "string" ? { minAppVersion: item.minAppVersion } : {}),
    apiVersion: 1,
    platform: "desktop",
    format: "cjs",
    main,
    ...(backend ? { backend } : {}),
    ...(item.editor === true ? { editor: true as const } : {}),
    ...(item.whiteboard === true ? { whiteboard: true as const } : {}),
    ...files,
    ...(styles === undefined ? {} : { styles }),
  });
}

/** 静态内容贡献在启动时固定，启停与更新需要重启。 */
export const isContentPlugin = (manifest: Pick<PluginManifest, "editor" | "whiteboard">) =>
  manifest.editor === true || manifest.whiteboard === true;

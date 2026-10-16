import { assertLocalId } from "./ids";
import { comparePluginVersions } from "./version";

export { comparePluginVersions } from "./version";

export const PLUGIN_SHARED_MODULES = [
  "@tau/plugins",
  "@tau/ui",
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
] as const;

export interface PluginManifest {
  formatVersion: 1;
  id: string;
  name: string;
  version: string;
  minAppVersion?: string;
  apiVersion: 1;
  platform: "desktop";
  format: "cjs";
  main: string;
  styles?: string;
  integrity: Record<string, string>;
}

/** 宿主内部传输的已读取产物，不属于作者运行时 API。 */
export interface DevelopmentPluginPackage {
  manifest: PluginManifest;
  code: string;
  css?: string;
}

export function validatePluginManifest(value: unknown): PluginManifest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("插件清单必须是对象");
  const item = value as Record<string, unknown>;
  if (
    item.formatVersion !== 1 ||
    item.apiVersion !== 1 ||
    item.platform !== "desktop" ||
    item.format !== "cjs"
  )
    throw new Error("插件包格式、API 版本或平台不兼容");
  if (typeof item.id !== "string") throw new Error("插件 ID 无效");
  assertLocalId(item.id);
  if (
    typeof item.name !== "string" ||
    !item.name.trim() ||
    typeof item.version !== "string" ||
    !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(item.version)
  )
    throw new Error("插件名称或版本无效");
  const file = (input: unknown, extension: string) => {
    if (
      typeof input !== "string" ||
      !/^[\w./-]+$/.test(input) ||
      input.split("/").some(part => !part || part === "." || part === "..") ||
      !input.endsWith(extension)
    )
      throw new Error("插件入口或样式路径无效");
    return input;
  };
  const main = file(item.main, ".js");
  if (item.minAppVersion !== undefined) {
    if (typeof item.minAppVersion !== "string") throw new Error("最低客户端版本无效");
    comparePluginVersions(item.minAppVersion, item.minAppVersion);
  }
  const styles = item.styles === undefined ? undefined : file(item.styles, ".css");
  const integrity: Record<string, string> = {};
  for (const name of [main, ...(styles ? [styles] : [])]) {
    const hash =
      item.integrity && typeof item.integrity === "object"
        ? (item.integrity as Record<string, unknown>)[name]
        : undefined;
    if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))
      throw new Error("插件产物缺少有效的完整性摘要");
    integrity[name] = hash;
  }
  return Object.freeze({
    formatVersion: 1,
    id: item.id,
    name: item.name,
    version: item.version,
    ...(typeof item.minAppVersion === "string" ? { minAppVersion: item.minAppVersion } : {}),
    apiVersion: 1,
    platform: "desktop",
    format: "cjs",
    main,
    integrity: Object.freeze(integrity),
    ...(styles === undefined ? {} : { styles }),
  });
}

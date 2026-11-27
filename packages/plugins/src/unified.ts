import {
  validatePluginManifest,
  type LegacyPluginManifest,
  type PluginManifest,
} from "./package.ts";
import {
  assertMobilePermissions,
  validatePortablePluginManifest,
  type PortablePluginManifest,
} from "./portable.ts";
import { validateBackendManifest } from "./backend-manifest.ts";
import { readPluginMetadata, readPluginFilePath, readPluginFiles } from "./package-fields.ts";
import { readPackageTargets, type PackageTargets } from "./package-targets.ts";
import { comparePluginVersions } from "./version.ts";
import {
  validateSkillPackageManifest,
  validateDistributionManifest,
  isTemplateManifest,
  type LegacyTemplateManifest,
  type LegacyPortableSkillPackageManifest,
} from "./template.ts";

export const PACKAGE_FORMAT_MIN_VERSIONS = {
  desktop: "0.66.3",
  android: "0.5.1",
  ios: "0.5.1",
} as const;

interface UnifiedPackageHeader {
  readonly formatVersion: 4;
  readonly platform: "portable";
  readonly targets: PackageTargets;
  readonly minAppVersion?: never;
  readonly description?: string;
}

interface UnifiedPluginBase
  extends
    Omit<
      LegacyPluginManifest,
      "formatVersion" | "platform" | "minAppVersion" | "backend" | "editor" | "whiteboard"
    >,
    UnifiedPackageHeader {
  readonly kind: "plugin";
  readonly editor?: never;
  readonly whiteboard?: never;
}

export interface UnifiedWebPluginManifest extends UnifiedPluginBase {
  readonly profile: "web-v1";
  readonly backend?: never;
}

export interface UnifiedDesktopPluginManifest extends UnifiedPluginBase {
  readonly profile: "desktop-v1";
  readonly backend: NonNullable<LegacyPluginManifest["backend"]>;
}

export type UnifiedPluginManifest = UnifiedWebPluginManifest | UnifiedDesktopPluginManifest;
export interface UnifiedSkillPackageManifest
  extends
    Omit<
      LegacyPortableSkillPackageManifest,
      "formatVersion" | "platform" | "targets" | "minAppVersion"
    >,
    UnifiedPackageHeader {
  readonly kind: "skills";
}
export interface UnifiedTemplateManifest
  extends
    Omit<LegacyTemplateManifest, "formatVersion" | "platform" | "minAppVersion">,
    UnifiedPackageHeader {
  readonly kind: "template";
}
export type UnifiedPackageManifest =
  | UnifiedPluginManifest
  | UnifiedSkillPackageManifest
  | UnifiedTemplateManifest;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("包清单必须是对象");
  return value as Record<string, unknown>;
}

function readUnifiedHeader(item: Record<string, unknown>) {
  if (item.formatVersion !== 4 || item.apiVersion !== 1 || item.platform !== "portable")
    throw new Error("包格式或 API 版本不兼容");
  const targets = readPackageTargets(item.targets);
  for (const platform of ["desktop", "android", "ios"] as const) {
    const target = targets[platform];
    if (
      target &&
      comparePluginVersions(target.minAppVersion, PACKAGE_FORMAT_MIN_VERSIONS[platform]) < 0
    )
      throw new Error(
        `格式 4 在 ${platform} 要求最低客户端版本 ${PACKAGE_FORMAT_MIN_VERSIONS[platform]}`
      );
  }
  return {
    formatVersion: 4 as const,
    platform: "portable" as const,
    targets,
    ...(typeof item.description === "string" ? { description: item.description } : {}),
  };
}

export function validateUnifiedPluginManifest(value: unknown): UnifiedPluginManifest {
  const item = record(value);
  const header = readUnifiedHeader(item);
  if (item.kind !== "plugin" || item.format !== "cjs")
    throw new Error("应用插件类型或入口格式不兼容");
  if (item.profile !== "web-v1" && item.profile !== "desktop-v1")
    throw new Error("插件运行配置不兼容");
  const metadata = readPluginMetadata(item);
  const main = readPluginFilePath(item.main, ".js");
  const styles = item.styles === undefined ? undefined : readPluginFilePath(item.styles, ".css");
  const backend = item.backend === undefined ? undefined : validateBackendManifest(item.backend);
  if (item.profile === "web-v1" && backend) throw new Error("Web 运行配置不能包含本机后台");
  if (
    item.profile === "desktop-v1" &&
    (!backend || !header.targets.desktop || header.targets.android || header.targets.ios)
  )
    throw new Error("本机后台必须声明桌面目标，不能声明移动目标");
  if (backend?.entry === main) throw new Error("后台入口不能与渲染入口相同");
  const files = readPluginFiles(item, [
    main,
    ...(styles ? [styles] : []),
    ...(backend ? [backend.entry] : []),
  ]);
  if (
    Object.keys(item.integrity as Record<string, unknown>).some(
      file => !Object.hasOwn(files.integrity, file)
    )
  )
    throw new Error("插件包包含未声明文件");
  const common = {
    ...metadata,
    ...header,
    apiVersion: 1 as const,
    kind: "plugin" as const,
    format: "cjs" as const,
    main,
    ...(styles ? { styles } : {}),
    ...files,
  };
  if (backend) return Object.freeze({ ...common, profile: "desktop-v1" as const, backend });
  return Object.freeze({ ...common, profile: "web-v1" as const });
}

/** 已发布格式的字节与摘要保持原样，只在读取边界共用字段校验。 */
export function validateUnifiedPackageManifest(value: unknown): UnifiedPackageManifest {
  const item = record(value);
  const header = readUnifiedHeader(item);
  if (item.kind === "plugin") return validateUnifiedPluginManifest(item);
  if (item.kind === "skills") {
    const parsed = validateSkillPackageManifest({
      ...item,
      formatVersion: 1,
      platform: "portable",
    });
    if (parsed.platform !== "portable") throw new Error("Skill 包缺少目标平台");
    return Object.freeze({ ...parsed, ...header, kind: "skills" as const });
  }
  if (item.kind === "template") {
    if (!header.targets.desktop || header.targets.android || header.targets.ios)
      throw new Error("模板仅支持桌面目标");
    const parsed = validateDistributionManifest({
      ...item,
      formatVersion: 1,
      platform: "desktop",
      minAppVersion: header.targets.desktop.minAppVersion,
    });
    if (!isTemplateManifest(parsed)) throw new Error("模板清单无效");
    const {
      id,
      name,
      version,
      apiVersion,
      template,
      integrity,
      categories,
      keywords,
      i18n,
      locales,
    } = parsed;
    return Object.freeze({
      id,
      name,
      version,
      apiVersion,
      ...header,
      kind: "template" as const,
      template,
      integrity,
      ...(categories ? { categories } : {}),
      ...(keywords ? { keywords } : {}),
      ...(i18n ? { i18n } : {}),
      ...(locales ? { locales } : {}),
    });
  }
  throw new Error("包类型无效");
}

export function buildUnifiedPluginManifest(
  value: unknown,
  output: {
    main: string;
    styles?: string;
    integrity: Readonly<Record<string, string>>;
    skills?: readonly string[];
  }
): UnifiedPluginManifest {
  const item = record(value);
  if (item.kind !== undefined && item.kind !== "plugin") throw new Error("代码入口与包类型不匹配");
  const manifest = validateUnifiedPluginManifest({
    ...item,
    ...output,
    formatVersion: 4,
    platform: "portable",
    apiVersion: 1,
    kind: "plugin",
    format: "cjs",
    profile: item.backend ? "desktop-v1" : "web-v1",
    targets: authorTargets(item),
  });
  assertMobilePermissions(manifest);
  return manifest;
}

function authorTargets(item: Record<string, unknown>): PackageTargets {
  const targets = readPackageTargets(
    item.targets ??
      (typeof item.minAppVersion === "string"
        ? { desktop: { minAppVersion: item.minAppVersion } }
        : undefined)
  );
  return Object.fromEntries(
    Object.entries(targets).map(([platform, target]) => [
      platform,
      {
        minAppVersion:
          comparePluginVersions(
            target.minAppVersion,
            PACKAGE_FORMAT_MIN_VERSIONS[platform as keyof typeof PACKAGE_FORMAT_MIN_VERSIONS]
          ) < 0
            ? PACKAGE_FORMAT_MIN_VERSIONS[platform as keyof typeof PACKAGE_FORMAT_MIN_VERSIONS]
            : target.minAppVersion,
      },
    ])
  );
}

export function buildUnifiedPackageManifest(
  value: unknown,
  output: {
    main?: string;
    styles?: string;
    integrity: Readonly<Record<string, string>>;
    skills?: readonly string[];
  }
): UnifiedPackageManifest {
  const item = record(value);
  if (output.main) return buildUnifiedPluginManifest(item, { ...output, main: output.main });
  return validateUnifiedPackageManifest({
    ...item,
    ...output,
    formatVersion: 4,
    platform: "portable",
    apiVersion: 1,
    kind: item.kind ?? (item.template ? "template" : "skills"),
    targets: authorTargets(item),
  });
}

export function packageTargets(manifest: {
  platform: "desktop" | "portable";
  targets?: PackageTargets;
  minAppVersion?: string;
}): PackageTargets {
  return manifest.platform === "portable"
    ? (manifest.targets ?? {})
    : { desktop: { minAppVersion: manifest.minAppVersion ?? "0.0.0" } };
}

export function isWebPluginManifest(
  manifest: PluginManifest | PortablePluginManifest
): manifest is PortablePluginManifest {
  return "profile" in manifest && manifest.profile === "web-v1";
}

export function readApplicationPluginManifest(
  value: unknown
): PluginManifest | PortablePluginManifest {
  const item = record(value);
  if (item.formatVersion === 4) return validateUnifiedPluginManifest(item);
  if (item.formatVersion === 3) return validatePortablePluginManifest(item);
  return validatePluginManifest(item);
}

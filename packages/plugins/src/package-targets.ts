import { comparePluginVersions } from "./version.ts";

export const PACKAGE_PLATFORMS = ["desktop", "android", "ios"] as const;
export type PackagePlatform = (typeof PACKAGE_PLATFORMS)[number];
export interface PackageTarget {
  readonly minAppVersion: string;
}
export type PackageTargets = Readonly<Partial<Record<PackagePlatform, PackageTarget>>>;

export function readPackageTargets(value: unknown): PackageTargets {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("目标平台必须是对象");
  const targets: Partial<Record<PackagePlatform, PackageTarget>> = {};
  for (const platform of PACKAGE_PLATFORMS) {
    if (!Object.hasOwn(value, platform)) continue;
    const target = (value as Record<string, unknown>)[platform];
    if (
      !target ||
      typeof target !== "object" ||
      Array.isArray(target) ||
      typeof (target as Record<string, unknown>).minAppVersion !== "string"
    )
      throw new Error("平台缺少最低客户端版本");
    const minimum = (target as Record<string, unknown>).minAppVersion as string;
    comparePluginVersions(minimum, minimum);
    targets[platform] = Object.freeze({ minAppVersion: minimum });
  }
  if (!Object.keys(targets).length) throw new Error("需要至少一个支持的目标平台");
  return Object.freeze(targets);
}

export function assertPackageTargetCompatibility(
  targets: PackageTargets,
  host: { platform: PackagePlatform; appVersion: string }
): PackageTarget {
  comparePluginVersions(host.appVersion, host.appVersion);
  const target = targets[host.platform];
  if (!target) throw new Error("包不支持当前平台");
  if (comparePluginVersions(host.appVersion, target.minAppVersion) < 0)
    throw new Error("客户端版本低于包要求");
  return target;
}

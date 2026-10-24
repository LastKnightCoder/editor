import type { CenterPlatform, CenterReason, CenterTargets } from "@tau/plugins/center";
import { PORTABLE_PLATFORMS, type PortablePlatform } from "@tau/plugins/portable";

export { PORTABLE_PLATFORMS };
export type { PortablePlatform };
/** 商店平台筛选值；all 表示不按平台过滤。 */
export type PlatformFilterValue = CenterPlatform;

export const PLATFORM_LABELS: Record<PortablePlatform, string> = {
  desktop: "桌面",
  android: "Android",
  ios: "iOS",
};

/** 结构化原因的完整文案，附带所需版本或缺失能力。 */
export function reasonLabel(reason: CenterReason): string {
  switch (reason.code) {
    case "FORMAT_UNSUPPORTED":
      return `客户端不支持包格式 ${reason.formatVersion}`;
    case "API_UNSUPPORTED":
      return `客户端不支持插件接口版本 ${reason.apiVersion}`;
    case "PROFILE_UNSUPPORTED":
      return `客户端未接入运行配置 ${reason.profile}`;
    case "PLATFORM_UNSUPPORTED":
      return `该版本未声明${PLATFORM_LABELS[reason.platform]}`;
    case "APP_VERSION_TOO_LOW":
      return `需要 Tau ${reason.minAppVersion} 或更高版本`;
    case "DISTRIBUTION_UNAVAILABLE":
      return "该平台的插件分发尚未开放";
    case "REVOKED":
      return "该版本已撤回";
    case "PLUGIN_DISABLED":
      return "插件已被停止公开";
    case "NO_RELEASE":
      return "没有已发布的版本";
  }
}

/** 按固定顺序列出声明的平台。 */
export function declaredPlatforms(targets: CenterTargets): PortablePlatform[] {
  return PORTABLE_PLATFORMS.filter(platform => targets[platform]);
}

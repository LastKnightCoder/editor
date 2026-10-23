import type { PluginCapability } from "@tau/plugins/portable";
import type { CenterPlatform, CenterReason, CenterTargets } from "@tau/plugins/center";
import {
  PORTABLE_PLATFORMS,
  type PluginElementSupport,
  type PortablePlatform,
} from "@tau/plugins/portable";
import type { TagColor } from "@tau/ui";

export { PORTABLE_PLATFORMS };
export type { PortablePlatform };
/** 商店平台筛选值；all 表示不按平台过滤。 */
export type PlatformFilterValue = CenterPlatform;

export const PLATFORM_LABELS: Record<PortablePlatform, string> = {
  desktop: "桌面",
  android: "Android",
  ios: "iOS",
};

export const ELEMENT_SUPPORT: Record<PluginElementSupport, { label: string; color: TagColor }> = {
  edit: { label: "可编辑", color: "green" },
  render: { label: "仅展示", color: "blue" },
  none: { label: "不支持", color: "gray" },
};

/** 未登记的新能力按原名展示，保证前向读取时不丢信息。 */
const CAPABILITY_LABELS: Record<PluginCapability, string> = {
  commands: "命令",
  storage: "私有存储",
  pages: "页面",
  navigation: "导航入口",
  settings: "设置页",
  dialogs: "对话框",
  editor: "正文节点",
  editorCodecs: "正文编解码",
  sourceEditor: "源码编辑",
  runtimeStyles: "动态样式",
  media: "媒体与资源",
};

export function capabilityLabel(capability: string): string {
  return CAPABILITY_LABELS[capability as PluginCapability] ?? capability;
}

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
    case "CAPABILITY_MISSING":
      return `客户端缺少必需能力：${reason.capabilities.map(capabilityLabel).join("、")}`;
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

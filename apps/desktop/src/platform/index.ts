/**
 * 平台能力装配层：按运行环境选择 Electron 或 Web 实现。
 *
 * 业务层统一从 `@/platform` 导入 platform 实例与派生常量（isMac 等），
 * 不再直接依赖 `@/electron` 的 isElectron/platform 字符串判断环境。
 */
import { invoke, on, off, platform as platformString } from "@/electron";
import { createElectronPlatform, webPlatform, type Platform, type PlatformOs } from "@tau/platform";

// preload 暴露的 platform 即 process.platform（darwin/win32/linux），"web" 表示浏览器
const KNOWN_OS = ["darwin", "win32", "linux"];
const electronOs: PlatformOs = KNOWN_OS.includes(platformString)
  ? (platformString as PlatformOs)
  : "unknown";

export const platform: Platform =
  platformString !== "web" ? createElectronPlatform({ invoke, on, off }, electronOs) : webPlatform;

export const isMac = platform.os === "darwin";
export const isWinOrLinux = platform.kind === "electron" && !isMac;

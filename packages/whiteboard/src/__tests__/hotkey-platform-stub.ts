import type { HotkeyPlatform } from "../utils/hotkeyFormat";

/**
 * 测试注入平台：覆写 navigator.platform（jsdom 的 userAgentData 缺省不存在，
 * 需要覆盖 userAgentData 行为时由 userAgentDataPlatform 单独注入）。
 */
const originalPlatform = navigator.platform;
const hadUserAgentData = "userAgentData" in navigator;

type MutableNavigator = Navigator & { userAgentData?: { platform?: string } };

export function stubHotkeyPlatform(platform: HotkeyPlatform, userAgentDataPlatform?: string): void {
  Object.defineProperty(navigator, "platform", {
    value: platform === "mac" ? "MacIntel" : "Win32",
    configurable: true,
  });
  delete (navigator as MutableNavigator).userAgentData;
  if (userAgentDataPlatform !== undefined) {
    Object.defineProperty(navigator, "userAgentData", {
      value: { platform: userAgentDataPlatform },
      configurable: true,
    });
  }
}

export function restoreHotkeyPlatform(): void {
  Object.defineProperty(navigator, "platform", { value: originalPlatform, configurable: true });
  if (!hadUserAgentData) delete (navigator as MutableNavigator).userAgentData;
}

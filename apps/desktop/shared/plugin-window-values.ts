import type { PluginWindowOptions, PluginWindowParams } from "@tau/plugins";
import { assertLocalId, normalizePageParams } from "@tau/plugins/host";
import type { DesktopPluginPackage } from "./plugin-package";

export async function pluginWindowPackageKey({ manifest }: DesktopPluginPackage): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(manifest));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function windowStateName(value: string): string {
  assertLocalId(value);
  if (value.startsWith("system.")) throw new Error("system. 是宿主保留名称");
  return value;
}

export function readWindowParams(input: unknown): PluginWindowParams {
  const params = normalizePageParams(input);
  if (JSON.stringify(params).length > 32_768) throw new Error("窗口参数过大");
  return params;
}

export function readWindowOptions(input: PluginWindowOptions): PluginWindowOptions {
  const { kind, theme } = input;
  if (theme !== undefined && theme !== "system" && theme !== "dark")
    throw new Error("窗口明暗模式无效");
  if (kind === "fullscreen") return { kind, theme };
  if (kind !== "normal" && kind !== "compact") throw new Error("窗口形态无效");
  const { width, height } = input;
  if (![width, height].every(size => Number.isSafeInteger(size) && size > 0))
    throw new Error("窗口尺寸无效");
  if (kind === "normal") return { kind, width, height, theme };
  if (input.alwaysOnTop !== undefined && typeof input.alwaysOnTop !== "boolean")
    throw new Error("窗口置顶选项无效");
  return { kind, width, height, theme, alwaysOnTop: input.alwaysOnTop };
}

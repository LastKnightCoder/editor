import { compareHotkey, parseHotkey, type HotKey } from "is-hotkey";

/**
 * 快捷键仲裁的解析与匹配：
 * - 字符串键按 is-hotkey 的 byKey 语义匹配（event.key，别名与大小写由库归一）；
 * - 键码形态（内部，不对外公开）按 event.code 匹配，用于 shift+数字这类
 *   在不同键盘布局下 event.key 不稳定（!、@…）的组合。
 */

/** 内部键码形态：仅内置扩展经 InternalContributions.hotkeyCodes 使用 */
export interface HotkeyCodeSpec {
  code: string;
  shift: boolean;
}

export type HotkeyMatcher = (event: KeyboardEvent) => boolean;

/** 装配后的快捷键条目：match 为预编译匹配器，order 为全局仲裁序（tau 扩展在前） */
export interface HotkeyEntry {
  /** 声明的键（字符串键原样；键码形如 "Digit1+shift"） */
  key: string;
  command: string;
  extensionId: string;
  order: number;
  match: HotkeyMatcher;
}

/** 构造匹配器；键串无法解析（is-hotkey 抛错）或键码形态不合法时返回 null */
export function createHotkeyMatcher(key: string | HotkeyCodeSpec): HotkeyMatcher | null {
  if (typeof key === "string") {
    let parsed: HotKey;
    try {
      parsed = parseHotkey(key, { byKey: true });
    } catch {
      return null;
    }
    return event => compareHotkey(parsed, event);
  }
  if (typeof key?.code !== "string" || typeof key.shift !== "boolean") return null;
  return event =>
    event.code === key.code &&
    event.shiftKey === key.shift &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey;
}

/** 单个键名的归一（is-hotkey toKeyName 语义）：小写化并替换别名（esc→escape、del→delete…）；不认识返回 null */
export function normalizeKeyName(token: string): string | null {
  try {
    return parseHotkey(token, { byKey: true }).key ?? null;
  } catch {
    return null;
  }
}

/**
 * 键串的规范签名：主修饰键（mod/ctrl/cmd/meta）合并为同一档，alt/shift 独立，
 * 别名与大小写由 is-hotkey 归一（esc→escape、cmd→meta、Mod+K→k…）。
 * 无法解析返回 undefined。
 */
export function hotkeySignature(key: string): string | undefined {
  try {
    const parsed = parseHotkey(key, { byKey: true });
    const primary = parsed.ctrlKey !== false || parsed.metaKey !== false;
    return `${parsed.key ?? ""}|${parsed.altKey !== false}|${parsed.shiftKey !== false}|${primary}`;
  } catch {
    return undefined;
  }
}

/** 宿主应用保留键：命令面板（mod+k/p）、停靠栏（mod+j）、前进后退（alt+方向）、浮层退场（escape） */
const RESERVED_HOTKEY_SIGNATURES = new Set(
  ["mod+k", "mod+p", "mod+j", "alt+left", "alt+right", "escape"]
    .map(hotkeySignature)
    .filter((signature): signature is string => signature !== undefined)
);

/** 是否命中保留键（含各平台等价写法；无法解析的键串不在此判定，由调用方另行拒绝） */
export function isReservedHotkey(key: string): boolean {
  const signature = hotkeySignature(key);
  return signature !== undefined && RESERVED_HOTKEY_SIGNATURES.has(signature);
}

import { normalizeKeyName } from "../extensions/hotkeys";

export type HotkeyPlatform = "mac" | "other";

/**
 * 快捷键的展示格式化：键串（is-hotkey 语义）或内部键码形态（"Digit1+shift"）
 * 转为平台惯例文字。修饰键分词在本模块完成——is-hotkey 的 parseHotkey 对 mod
 * 的归一随加载环境漂移、且会丢掉 "mod+=" 的主键，不能直接用整体解析结果；
 * 主键的别名归一复用 hotkeys.ts 的 normalizeKeyName。
 */

/** 内部键码通道的主键（event.code 形态，shift+数字等布局漂移组合专用） */
const CODE_MAIN = /^(?:Digit[0-9]|Key[A-Z]|Arrow(?:Left|Right|Up|Down))$/;

interface HotkeyParts {
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  /** 归一后的主键（"z"、"escape"、"="…）；"" 表示 is-hotkey 按 "+" 分割时丢失的主键（"mod+="） */
  main: string;
  /** 键码形态主键（"Digit1"…），与 main 互斥 */
  code: string | null;
}

function parseHotkeyParts(key: string): HotkeyParts {
  const parts: HotkeyParts = {
    mod: false,
    ctrl: false,
    meta: false,
    alt: false,
    shift: false,
    main: "",
    code: null,
  };
  for (const token of key.replace("++", "+add").split("+")) {
    const name = token.toLowerCase();
    if (name === "mod") parts.mod = true;
    else if (name === "ctrl" || name === "control") parts.ctrl = true;
    else if (
      name === "cmd" ||
      name === "command" ||
      name === "meta" ||
      name === "win" ||
      name === "windows"
    )
      parts.meta = true;
    else if (name === "alt" || name === "opt" || name === "option") parts.alt = true;
    else if (name === "shift") parts.shift = true;
    else if (CODE_MAIN.test(token)) parts.code = token;
    else parts.main = normalizeKeyName(token) ?? name;
  }
  return parts;
}

/** "=" 与 "plus" 都显示 "+"（用户按的是加号键位）；"-" 用 U+2212 与状态栏既有文字一致 */
const MAIN_KEYS: Record<HotkeyPlatform, Record<string, string>> = {
  mac: {
    delete: "⌫",
    backspace: "⌫",
    enter: "↵",
    escape: "Esc",
    arrowleft: "←",
    arrowup: "↑",
    arrowright: "→",
    arrowdown: "↓",
    " ": "Space",
    "=": "+",
    "+": "+",
    plus: "+",
    "-": "−",
  },
  other: {
    delete: "Delete",
    backspace: "Backspace",
    enter: "Enter",
    escape: "Esc",
    arrowleft: "Left",
    arrowup: "Up",
    arrowright: "Right",
    arrowdown: "Down",
    " ": "Space",
    "=": "+",
    "+": "+",
    plus: "+",
    "-": "−",
  },
};

function codeMainLabel(code: string, platform: HotkeyPlatform): string {
  if (platform === "mac") {
    if (code === "ArrowLeft") return "←";
    if (code === "ArrowUp") return "↑";
    if (code === "ArrowRight") return "→";
    if (code === "ArrowDown") return "↓";
  } else if (code.startsWith("Arrow")) {
    return code.slice("Arrow".length);
  }
  if (code.startsWith("Digit")) return code.slice("Digit".length);
  return code.startsWith("Key") ? code.slice("Key".length) : code;
}

function mainLabel(parts: HotkeyParts, platform: HotkeyPlatform): string {
  if (parts.code) return codeMainLabel(parts.code, platform);
  if (parts.main === "") return "+";
  const known = MAIN_KEYS[platform][parts.main];
  if (known !== undefined) return known;
  // 单字符键大写（z→Z、1→1）；未知多字符键名首字母大写
  return parts.main.length === 1
    ? parts.main.toUpperCase()
    : parts.main[0].toUpperCase() + parts.main.slice(1);
}

/** 键串转展示文字：mac 修饰键符号按 ⌃⌥⇧⌘ 顺序紧贴主键，其它平台按 Ctrl+Alt+Shift 顺序加号相连 */
export function formatHotkey(key: string, platform: HotkeyPlatform): string {
  const parts = parseHotkeyParts(key);
  const main = mainLabel(parts, platform);
  if (platform === "mac") {
    const symbols = (
      [
        [parts.ctrl, "⌃"],
        [parts.alt, "⌥"],
        [parts.shift, "⇧"],
        [parts.mod || parts.meta, "⌘"],
      ] as const
    )
      .filter(([active]) => active)
      .map(([, symbol]) => symbol);
    return symbols.join("") + main;
  }
  const labels = (
    [
      [parts.ctrl || parts.mod, "Ctrl"],
      [parts.alt, "Alt"],
      [parts.shift, "Shift"],
      [parts.meta, "Meta"],
    ] as const
  )
    .filter(([active]) => active)
    .map(([, label]) => label);
  return [...labels, main].join("+");
}

/** 包内平台检测（不依赖 @tau/platform）：userAgentData 缺失的旧环境退回 navigator.platform */
export function detectHotkeyPlatform(): HotkeyPlatform {
  if (typeof navigator === "undefined") return "other";
  const userAgentPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData?.platform;
  const platform = userAgentPlatform ?? navigator.platform;
  return typeof platform === "string" && /mac/i.test(platform) ? "mac" : "other";
}

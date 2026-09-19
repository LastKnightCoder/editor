/**
 * 数值守卫 —— NumberInput 的纯函数层（合法态判定 / 粘贴清洗 / 归一化）。
 *
 * 设计口径（mockups/input/ 方案 A，2026-09-19）：数值输入走 beforeinput 事前拦截，
 * 非法内容根本进不来；此处提供拦截用的纯判定与清洗，供组件与单测共用。
 */

/** 合法值与合法中间态："5."、".5"、"-"、"-." 都放行（打字过程），blur 再归一化 */
export function isValidNumberDraft(text: string): boolean {
  return /^-?\d*\.?\d*$/.test(text);
}

/** 粘贴清洗：剥掉货币符 / 千分位 / 空格等杂质（"¥1,200" → "1200"） */
export function sanitizePastedDigits(text: string): string {
  return text.replace(/[^\d.-]/g, "");
}

/** 中间态归一化："5." → "5"、".5" → "0.5"、去多余前导零；空串返回 null */
export function normalizeNumberDraft(text: string): number | null {
  const raw = text.trim();
  if (raw === "" || raw === "-" || raw === "." || raw === "-.") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

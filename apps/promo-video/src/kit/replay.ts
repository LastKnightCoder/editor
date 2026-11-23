/**
 * 按键回放共用的类型与节奏（教程片、功能片都用）。纯 TS：音效导出脚本在 Node 里直接读，不要引用 React 或 remotion。
 */

/** 一枚键帽：at 帧出现；trigger 是触发键（染强调色）；slow 在触发前停得更久 */
export type KeyCap = { at: number; label: string; trigger: boolean; slow: boolean };
/** 一条音效：t 帧；kind 与 scripts/sfx/sfx.py 的音色一一对应 */
export type Sfx = { t: number; kind: "key" | "space" | "enter" | "form" | "click" | "pop" | "shutter" };
/** 一次点按：at 帧按下，hit 是画面里被点元素的 data-hit */
export type Click = { at: number; hit: string };
export type Timed<T> = { at: number; value: T };

const CJK = /[\p{Script=Han}，。、：；！？「」『』（）《》——…]/u;

/** 确定性的小抖动，让打字不像机器 */
export const jitter = (n: number) => 0.8 + 0.4 * (Math.sin(n * 12.9898) * 43758.5453 - Math.floor(Math.sin(n * 12.9898) * 43758.5453));

/** 输入单元：中文按 2～3 字一组上屏，其余逐字 */
export function units(text: string) {
  const out: { text: string; ime: boolean }[] = [];
  const chars = [...text];
  for (let i = 0; i < chars.length;) {
    if (CJK.test(chars[i])) {
      const size = 2 + (i % 2);
      let j = i;
      while (j < chars.length && j - i < size && CJK.test(chars[j])) j++;
      out.push({ text: chars.slice(i, j).join(""), ime: true });
      i = j;
    } else {
      out.push({ text: chars[i], ime: false });
      i++;
    }
  }
  return out;
}

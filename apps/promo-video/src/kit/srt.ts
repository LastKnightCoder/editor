/** 一条字幕；时间用秒，便于同一份数据导出 SRT */
export type Cue = { from: number; to: number; text: string };

/** Cue 列表 → SRT 文本 */
export function toSrt(cues: Cue[]) {
  const stamp = (s: number) => {
    const ms = Math.round(s * 1000);
    const pad = (n: number, w = 2) => String(n).padStart(w, "0");
    return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
  };
  return cues.map((c, i) => `${i + 1}\n${stamp(c.from)} --> ${stamp(c.to)}\n${c.text}\n`).join("\n");
}

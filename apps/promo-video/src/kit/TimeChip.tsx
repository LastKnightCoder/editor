import { useCurrentFrame } from "remotion";
import { ease, envelope, mixColor, progress } from "../brand/motion";
import { fonts, palette } from "../brand/tokens";

/**
 * 时刻标签：画面左上「07:30 · 清晨」，数字滚动切换。
 * marks 为各时刻出现的帧；night 决定字色。
 */
export function TimeChip({ marks, night, until = Infinity }: { marks: { at: number; time: string; label: string }[]; night: number; until?: number }) {
  const frame = useCurrentFrame();
  const index = marks.findLastIndex(m => frame >= m.at);
  if (index < 0) return null;
  const mark = marks[index];
  const next = marks[index + 1];
  const t = progress(frame, mark.at, 30);
  const visible = envelope(frame, marks[0].at, until, 30, 30);
  const leaving = next ? progress(frame, next.at - 14, 14, ease.in) : 0;
  const color = mixColor(palette.day.ink, palette.night.ink, night);
  return (
    <div
      style={{
        position: "absolute",
        left: 72,
        top: 60,
        display: "flex",
        alignItems: "baseline",
        gap: 14,
        padding: "10px 22px 12px",
        borderRadius: 999,
        background: mixColor("rgba(255, 253, 248, 0.72)", "rgba(10, 16, 38, 0.6)", night),
        // 不用 backdrop-filter：并行渲染时偶尔整层丢帧（交接文档坑 24）
        boxShadow: night > 0.5 ? "0 0 0 1px rgba(230,196,127,0.18)" : "0 0 0 1px rgba(22,34,49,0.06), 0 10px 30px -12px rgba(22,34,49,0.3)",
        opacity: visible,
        color,
      }}
    >
      <span
        style={{
          display: "inline-block",
          fontFamily: fonts.label,
          fontSize: 32,
          fontWeight: 500,
          letterSpacing: "0.02em",
          opacity: t * (1 - leaving),
          transform: `translateY(${(1 - t) * 18 - leaving * 18}px)`,
          filter: t < 1 || leaving > 0 ? `blur(${(1 - t) * 6 + leaving * 6}px)` : undefined,
        }}
      >
        {mark.time}
      </span>
      <span
        style={{
          fontFamily: fonts.display,
          fontSize: 20,
          letterSpacing: "0.3em",
          opacity: 0.72 * t * (1 - leaving),
        }}
      >
        {mark.label}
      </span>
    </div>
  );
}

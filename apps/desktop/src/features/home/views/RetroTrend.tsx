/**
 * 写作趋势面积图 —— SVG 手绘（零图表库）：日字数面积 + 7 日均线 + hover 竖线 tooltip。
 * 曲线用 Catmull-Rom 样条转三次贝塞尔（过每个数据点、无折角）。
 */

import { useMemo, useState } from "react";
import { Tooltip } from "@tau/ui";
import type { TrendDay } from "../types";

const W = 1000;
const H = 190;
const PAD = 6;
const TOP = 14;
const MA_WINDOW = 7;

type Pt = readonly [number, number];

/** Catmull-Rom → cubic bezier：过点平滑（端点用相邻点补位） */
function smoothPath(pts: readonly Pt[]): string {
  if (pts.length < 2) return "";
  if (pts.length === 2)
    return `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)} L ${pts[1][0].toFixed(1)} ${pts[1][1].toFixed(1)}`;
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

export function RetroTrend({ trend }: { trend: TrendDay[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (trend.length < 2) return null;
    const max = Math.max(...trend.map(d => d.words), 1);
    const x = (i: number) => PAD + (i / (trend.length - 1)) * (W - PAD * 2);
    const y = (v: number) => H - 16 - (v / max) * (H - 16 - TOP);
    const pts = trend.map((d, i) => [x(i), y(d.words)] as const);
    const line = smoothPath(pts);
    const area = `${line} L ${x(trend.length - 1).toFixed(1)} ${H - 4} L ${x(0).toFixed(1)} ${H - 4} Z`;
    const ma = pts.map((_, i) => {
      const seg = trend.slice(Math.max(0, i - (MA_WINDOW - 1)), i + 1);
      return [pts[i][0], y(seg.reduce((s, d) => s + d.words, 0) / seg.length)] as const;
    });
    const maLine = smoothPath(ma);
    const peakIdx = trend.reduce((m, d, i) => (d.words > trend[m].words ? i : m), 0);
    return { x, pts, line, area, maLine, peakIdx };
  }, [trend]);

  if (!geo) return null;
  const step = Math.max(1, Math.round(trend.length / 6));
  const hovered = hover !== null ? trend[hover] : null;

  return (
    <div>
      <div
        className="relative"
        onMouseLeave={() => setHover(null)}
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
          setHover(Math.min(trend.length - 1, Math.round(ratio * (trend.length - 1))));
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label="写作趋势"
        >
          <defs>
            <linearGradient id="stats-trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--tau-accent)" stopOpacity="0.25" />
              <stop offset="1" stopColor="var(--tau-accent)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={geo.area} fill="url(#stats-trend-fill)" />
          <path
            d={geo.line}
            fill="none"
            stroke="var(--tau-accent)"
            strokeWidth="1.8"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={geo.maLine}
            fill="none"
            stroke="var(--tau-tag-2)"
            strokeWidth="2"
            strokeLinejoin="round"
            opacity="0.9"
            vectorEffect="non-scaling-stroke"
          />
          {hover !== null && (
            <line
              x1={geo.pts[hover][0]}
              x2={geo.pts[hover][0]}
              y1={TOP - 8}
              y2={H - 4}
              stroke="var(--tau-ink-3)"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.6"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {/* 悬浮锚：常驻的零尺寸点跟随当前数据格；Tooltip 受控 open，
            引擎的 rAF 跟随让 tooltip 随鼠标逐格平滑移动（数据点贴顶时自动 flip 到下方） */}
        <Tooltip
          open={hover !== null}
          placement="top"
          content={
            hovered ? (
              <>
                <b className="text-[12.5px] tabular-nums">
                  {hovered.words.toLocaleString("zh-CN")}
                </b>{" "}
                字
                <br />
                <span className="opacity-70">
                  {hovered.date} · 新建 {hovered.cardsCreated + hovered.articlesCreated}
                </span>
              </>
            ) : null
          }
        >
          <span
            className="pointer-events-none absolute size-0"
            style={
              hover !== null
                ? {
                    left: `${(geo.pts[hover][0] / W) * 100}%`,
                    top: `${(geo.pts[hover][1] / H) * 100}%`,
                  }
                : undefined
            }
          />
        </Tooltip>
      </div>
      <div className="text-ink-3 mt-1.5 flex justify-between px-px text-[10.5px]">
        {trend.map((d, i) =>
          i % step === 0 || i === trend.length - 1 ? (
            <span key={d.date}>{d.date.slice(5)}</span>
          ) : null
        )}
      </div>
      <div className="text-ink-2 mt-2 flex items-center gap-3.5 text-[11px]">
        <span className="inline-flex items-center gap-1.5">
          <i className="bg-accent h-[3px] w-3.5 rounded-sm" />
          日字数
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="bg-tag-2 h-[3px] w-3.5 rounded-sm" />7 日均线
        </span>
        {trend[geo.peakIdx].words > 0 && (
          <span className="text-ink-3 ml-auto tabular-nums">
            峰值 {trend[geo.peakIdx].date.slice(5)} ·{" "}
            {trend[geo.peakIdx].words.toLocaleString("zh-CN")} 字
          </span>
        )}
      </div>
    </div>
  );
}

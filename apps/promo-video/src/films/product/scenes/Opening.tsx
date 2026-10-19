/**
 * 开场：散落的光点（一条条笔记）先连成网，再汇聚织成渐变字标 Tau，落定后出定位；
 * 随后 Deep Work 文章窗口在 3D 中立起，镜头俯冲到窗口，由写作段（WriteChapter）在同一机位接住。
 */
import { useMemo } from "react";
import { AbsoluteFill, random, useCurrentFrame } from "remotion";
import { ease, mix, mixColor, progress } from "../../../brand/motion";
import { fonts } from "../../../brand/tokens";
import { RevealText } from "../../../kit/RevealText";
import { StageFill, useStage } from "../../../kit/Stage";
import { useTextPoints, type GlyphText } from "../../../kit/textPoints";
import { ArticleWindow } from "./WriteChapter";
import { BRAND } from "../copy";
import { f, P } from "../timeline";

const GLYPH: GlyphText = { text: "Tau", font: '"Noto Serif SC Variable", serif', size: 330, width: 900, height: 380, baseline: 300 };
/** 字标框在画面中的左上角 */
const ORIGIN = { x: 960 - GLYPH.width / 2, y: 150 };
const COUNT = 520;

type Dot = { sx: number; sy: number; tx: number; ty: number; r: number; delay: number; phase: number };

export function nearestPairs(points: { x: number; y: number }[], k: number, maxDist: number) {
  const pairs: [number, number][] = [];
  const seen = new Set<string>();
  points.forEach((p, i) => {
    points
      .map((q, j) => ({ j, d: Math.hypot(p.x - q.x, p.y - q.y) }))
      .filter(o => o.j !== i && o.d < maxDist)
      .sort((a, b) => a.d - b.d)
      .slice(0, k)
      .forEach(({ j }) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (!seen.has(key)) {
          seen.add(key);
          pairs.push([i, j]);
        }
      });
  });
  return pairs;
}

export function Opening() {
  const frame = useCurrentFrame();
  const stage = useStage();
  const targets = useTextPoints(GLYPH, COUNT, 5);
  const O = P.opening;

  const dots = useMemo<Dot[] | null>(() => {
    if (!targets) return null;
    return targets.map((t, i) => {
      const angle = random(`a${i}`) * Math.PI * 2;
      const radius = 260 + random(`d${i}`) ** 0.7 * 780;
      return {
        sx: 960 + Math.cos(angle) * radius * 1.25,
        sy: 470 + Math.sin(angle) * radius * 0.62,
        tx: ORIGIN.x + t.x,
        ty: ORIGIN.y + t.y,
        r: 1.6 + random(`r${i}`) * 2.6,
        delay: random(`l${i}`) * 0.35,
        phase: random(`p${i}`) * Math.PI * 2,
      };
    });
  }, [targets]);
  const scatterLinks = useMemo(
    () =>
      dots
        ? nearestPairs(
            dots.map(d => ({ x: d.sx, y: d.sy })),
            2,
            150
          )
        : [],
    [dots]
  );
  const glyphLinks = useMemo(
    () =>
      dots
        ? nearestPairs(
            dots.map(d => ({ x: d.tx, y: d.ty })),
            2,
            22
          )
        : [],
    [dots]
  );
  if (!dots) return null;

  const appear = progress(frame, f(O.scatter), 10);
  // 汇聚用 1.5 小节，留半小节给「光点字标」定格，再与实体字标交叉淡化
  const convergeSpan = f((O.wordmark - O.converge) * 0.75);
  const solid = progress(frame, f(O.wordmark), 50, ease.inOut);
  const rise = progress(frame, f(O.rise), f(O.dive - O.rise) + 30, ease.out);
  const dive = progress(frame, f(O.dive), f(O.end - O.dive), ease.in);
  const t = frame / 60;

  const pos = dots.map(d => {
    const c = progress(frame, f(O.converge) + d.delay * convergeSpan * 0.6, convergeSpan * 0.7, ease.inOut);
    const driftX = Math.sin(t * 1.4 + d.phase) * 18 * (1 - c);
    const driftY = Math.cos(t * 1.2 + d.phase) * 12 * (1 - c);
    return { x: mix(d.sx, d.tx, c) + driftX, y: mix(d.sy, d.ty, c) + driftY, c };
  });
  const color = (x: number) => mixColor(stage.brand[0], stage.brand[1], (x - ORIGIN.x) / GLYPH.width);

  // 字标整体：落定后随窗口升起上移缩小，俯冲时放大淡出
  const markLift = rise;
  const settle = 1.06 - 0.06 * progress(frame, f(O.converge), f(O.wordmark - O.converge) + 30, ease.out);
  const markScale = settle * mix(1, 0.42, markLift) * (1 + dive * 2.5);
  const markY = mix(0, -215, markLift);

  return (
    <AbsoluteFill>
      <StageFill />
      <AbsoluteFill style={{ transform: `translateY(${markY}px) scale(${markScale})`, transformOrigin: "960px 340px", opacity: 1 - dive }}>
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
          <defs>
            <linearGradient id="tau-brand" x1={ORIGIN.x + 120} x2={ORIGIN.x + GLYPH.width - 120} y1="0" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={stage.brand[0]} />
              <stop offset="100%" stopColor={stage.brand[1]} />
            </linearGradient>
            <filter id="dot-glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>
          <g opacity={appear * (1 - solid * 0.92)}>
            {scatterLinks.map(([a, b], i) => (
              <line
                key={`s${i}`}
                x1={pos[a].x}
                y1={pos[a].y}
                x2={pos[b].x}
                y2={pos[b].y}
                stroke={color(pos[a].x)}
                strokeOpacity={0.35 * Math.max(0, 1 - progress(frame, f(O.converge), 24))}
                strokeWidth={1}
              />
            ))}
            {glyphLinks.map(([a, b], i) => (
              <line key={`g${i}`} x1={pos[a].x} y1={pos[a].y} x2={pos[b].x} y2={pos[b].y} stroke={color(pos[a].x)} strokeOpacity={0.5 * Math.max(0, pos[a].c * pos[b].c - 0.5) * 2} strokeWidth={1.2} />
            ))}
            <g filter="url(#dot-glow)" opacity={0.6}>
              {pos.map((p, i) => (
                <circle key={`h${i}`} cx={p.x} cy={p.y} r={dots[i].r * 1.8} fill={color(p.x)} />
              ))}
            </g>
            {pos.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={dots[i].r * (1 - 0.35 * p.c)} fill={color(p.x)} />
            ))}
          </g>
          <text x={960} y={ORIGIN.y + GLYPH.baseline} textAnchor="middle" fontFamily={GLYPH.font} fontSize={GLYPH.size} fill="url(#tau-brand)" opacity={solid}>
            {GLYPH.text}
          </text>
        </svg>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 560,
            textAlign: "center",
            fontFamily: fonts.display,
            fontWeight: 600,
            fontSize: 54,
            letterSpacing: "0.18em",
            color: stage.ink,
            opacity: 1 - progress(rise, 0, 0.35),
          }}
        >
          <RevealText text={BRAND.line} startAt={f(O.tagline)} stagger={3} />
        </div>
      </AbsoluteFill>

      {rise > 0 && (
        <AbsoluteFill style={{ perspective: 2200, display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "flex-start" }}>
          <div
            style={{
              marginTop: mix(1100, 300, rise) + dive * -40,
              transform: `scale(${mix(0.62, 0.74, rise) * (1 + dive * 0.9)}) rotateX(${mix(48, 6, rise) * (1 - dive)}deg)`,
              transformOrigin: "50% 0%",
              opacity: Math.min(1, rise * 2.5),
            }}
          >
            <div style={{ borderRadius: 14, boxShadow: "0 60px 140px -40px rgba(20,40,80,0.45)" }}>
              <ArticleWindow />
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}

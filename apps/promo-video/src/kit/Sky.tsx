import { AbsoluteFill, random, useCurrentFrame } from "remotion";
import { mixColor } from "../brand/motion";
import { palette } from "../brand/tokens";

const STARS = Array.from({ length: 220 }, (_, i) => ({
  x: random(`sx${i}`) * 100,
  y: random(`sy${i}`) * 100,
  r: 0.6 + random(`sr${i}`) ** 3 * 2.2,
  phase: random(`sp${i}`) * Math.PI * 2,
  speed: 0.6 + random(`sv${i}`) * 1.4,
}));

/** 昼 → 暮 → 夜的天幕：night 0 为白昼纸面，0.5 为暮色，1 为星空 */
export function Sky({ night }: { night: number }) {
  const frame = useCurrentFrame();
  const toDusk = Math.min(1, night * 2);
  const toNight = Math.max(0, night * 2 - 1);
  const top = mixColor(mixColor(palette.day.sky[0], palette.dusk.sky[0], toDusk), palette.night.sky[0], toNight);
  const bottom = mixColor(mixColor(palette.day.sky[1], palette.dusk.sky[1], toDusk), palette.night.sky[1], toNight);
  const starOpacity = Math.max(0, (night - 0.55) / 0.45);
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${top} 0%, ${bottom} 100%)` }}>
      {starOpacity > 0 && (
        <svg width="100%" height="100%" style={{ position: "absolute", opacity: starOpacity }}>
          {STARS.map((s, i) => (
            <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} fill={palette.night.star} opacity={0.35 + 0.65 * (0.5 + 0.5 * Math.sin(frame * 0.03 * s.speed + s.phase))} />
          ))}
        </svg>
      )}
      <Grain opacity={0.06 * (1 - night) + 0.03} />
    </AbsoluteFill>
  );
}

/** 静态纸纹颗粒，压掉大面积纯色渐变的色带 */
export function Grain({ opacity }: { opacity: number }) {
  return (
    <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity, mixBlendMode: "multiply" }}>
      <filter id="tau-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix values="0 0 0 0 0.3  0 0 0 0 0.28  0 0 0 0 0.25  0 0 0 1.4 -0.2" />
      </filter>
      <rect width="100%" height="100%" filter="url(#tau-grain)" />
    </svg>
  );
}

import type { CSSProperties } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ease, progress } from "../brand/motion";
import { fonts } from "../brand/tokens";
import { StageFill, useStage } from "./Stage";

type ManifestoProps = {
  text: string;
  sub?: string;
  at: number;
  out: number;
  /** 染强调色的字下标区间 [from, to) */
  accent?: [number, number];
  size?: number;
};

/** 宣言大字：字从遮罩下方升起（逐字错开），退场时整行上移、模糊淡出 */
export function ManifestoText({ text, sub, at, out, accent, size = 132 }: ManifestoProps) {
  const frame = useCurrentFrame();
  const stage = useStage();
  const exit = progress(frame, out - 16, 16, ease.in);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        transform: `translateY(${-exit * 40}px)`,
        opacity: 1 - exit,
        filter: exit > 0 ? `blur(${exit * 10}px)` : undefined,
      }}
    >
      <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: size, letterSpacing: "0.04em", color: stage.ink, lineHeight: 1.2 }}>
        {[...text].map((char, i) => {
          const t = progress(frame, at + 3 + i * 2.2, 26, ease.out);
          const style: CSSProperties = {
            display: "inline-block",
            transform: `translateY(${(1 - t) * 0.55}em)`,
            opacity: t,
            color: accent && i >= accent[0] && i < accent[1] ? stage.brand[0] : undefined,
          };
          return (
            <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top", paddingBottom: "0.08em" }}>
              <span style={style}>{char}</span>
            </span>
          );
        })}
      </div>
      {sub && (
        <div
          style={{
            marginTop: 34,
            fontFamily: fonts.caption,
            fontSize: 30,
            letterSpacing: "0.24em",
            color: stage.ink2,
            opacity: progress(frame, at + 22, 24),
            transform: `translateY(${(1 - progress(frame, at + 22, 24)) * 12}px)`,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

/** 整屏宣言：纯色舞台底 + 大字，只用在需要整屏停住的重拍上 */
export function Manifesto(props: ManifestoProps) {
  const frame = useCurrentFrame();
  if (frame < props.at || frame >= props.out) return null;
  return (
    <AbsoluteFill style={{ opacity: Math.min(progress(frame, props.at, 18) * 2, 1) }}>
      <StageFill />
      <ManifestoText {...props} />
    </AbsoluteFill>
  );
}

/** 叠在画面上的宣言的退场 / 入场包络（0→1→0），背后画面按它虚化 */
export function manifestoVeil(frame: number, at: number, out: number) {
  return progress(frame, at - 4, 18, ease.out) * (1 - progress(frame, out - 18, 18, ease.inOut));
}

/** 背后画面虚化的半径（px）：认得出是软件窗口，读不出里面的字 */
export const VEIL_BLUR = 9;

/**
 * 叠在画面上的宣言：背后的画面由调用方按 manifestoVeil 虚化（filter: blur(VEIL_BLUR × veil)），
 * 这里只画字后的白雾和大字。
 */
export function ManifestoOverlay(props: ManifestoProps) {
  const frame = useCurrentFrame();
  if (frame < props.at - 4 || frame >= props.out) return null;
  const veil = manifestoVeil(frame, props.at, props.out);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: veil, background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(248,249,251,0.7), rgba(248,249,251,0.28))" }} />
      <ManifestoText {...props} />
    </AbsoluteFill>
  );
}

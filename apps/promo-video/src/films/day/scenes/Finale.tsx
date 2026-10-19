/** 收尾：星图向中心收拢成一点，绽开为图标，接 slogan / 卖点 / 网址 */
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ease, progress } from "../../../brand/motion";
import { fonts, palette } from "../../../brand/tokens";
import { RevealText } from "../../../kit/RevealText";
import { TauMark } from "../../../kit/TauMark";
import { MapCanvas } from "../../../app-kit/parts/MapCanvas";
import { SLOGAN, TAGLINE, URL } from "../copy";
import { f, T } from "../timeline";
import { STAR_LAYER } from "./StarScene";

const MARK_Y = 430;

export function Finale() {
  const frame = useCurrentFrame();
  const starsIn = progress(frame, f(T.map.exit[0]) + 10, f(1.0));
  const converge = progress(frame, f(T.finale.converge[0]), f(T.finale.converge[1] - T.finale.converge[0]), ease.in);
  const bloomAt = f(T.finale.bloom);
  const bloom = progress(frame, bloomAt, 56, ease.out);
  const ripple = progress(frame, bloomAt, 90, ease.out);
  const point = progress(frame, bloomAt - 30, 24) * (1 - bloom);
  const fadeOut = progress(frame, f(T.finale.fadeOut[0]), f(T.finale.fadeOut[1] - T.finale.fadeOut[0]), ease.inOut);
  const lineIn = (at: number) => progress(frame, f(at), 40);

  return (
    <AbsoluteFill>
      {converge < 1 && (
        <div
          style={{
            position: "absolute",
            left: STAR_LAYER.left,
            top: STAR_LAYER.top,
            opacity: starsIn * (1 - progress(converge, 0.7, 0.3)) * 0.9,
            transformOrigin: `${960 - STAR_LAYER.left}px ${MARK_Y - STAR_LAYER.top}px`,
            transform: `scale(${1 - converge * 0.985}) rotate(${converge * 18}deg)`,
          }}
        >
          <MapCanvas variant="star" width={STAR_LAYER.width} height={STAR_LAYER.height} labels={1 - converge * 3} />
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: 960 - 8 * point,
          top: MARK_Y - 8 * point,
          width: 16 * point,
          height: 16 * point,
          borderRadius: "50%",
          background: palette.night.star,
          boxShadow: `0 0 ${40 * point}px ${16 * point}px rgba(230,196,127,0.5)`,
        }}
      />
      {ripple > 0 && ripple < 1 && (
        <div
          style={{
            position: "absolute",
            left: 960,
            top: MARK_Y,
            width: 60 + ripple * 640,
            height: 60 + ripple * 640,
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            border: `1.5px solid ${palette.night.gold}`,
            opacity: (1 - ripple) * 0.55,
          }}
        />
      )}
      {bloom > 0 && (
        <div
          style={{
            position: "absolute",
            left: 960,
            top: MARK_Y,
            transform: `translate(-50%, -50%) scale(${0.05 + bloom * 0.95})`,
            opacity: Math.min(1, bloom * 3),
          }}
        >
          <TauMark size={168} glow={bloom} />
        </div>
      )}
      <div
        style={{ position: "absolute", top: 590, left: 0, right: 0, textAlign: "center", fontFamily: fonts.display, fontWeight: 600, fontSize: 66, letterSpacing: "0.06em", color: palette.night.ink }}
      >
        <RevealText text={SLOGAN} startAt={f(T.finale.slogan)} stagger={4} />
      </div>
      <div
        style={{
          position: "absolute",
          top: 712,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: fonts.caption,
          fontSize: 24,
          letterSpacing: "0.32em",
          color: palette.night.ink2,
          opacity: lineIn(T.finale.tagline),
          transform: `translateY(${(1 - lineIn(T.finale.tagline)) * 10}px)`,
        }}
      >
        {TAGLINE}
      </div>
      <div
        style={{
          position: "absolute",
          top: 800,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: fonts.label,
          fontSize: 30,
          letterSpacing: "0.12em",
          color: palette.night.gold,
          opacity: lineIn(T.finale.url),
          transform: `translateY(${(1 - lineIn(T.finale.url)) * 10}px)`,
        }}
      >
        {URL}
      </div>
      <AbsoluteFill style={{ background: "#000", opacity: fadeOut }} />
    </AbsoluteFill>
  );
}

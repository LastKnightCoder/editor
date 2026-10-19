/**
 * 夜：知识星图。旧的知识先如星辰般浮现，白天各窗口收拢成的光点飞入，成为今天新长出的节点；
 * 随后描出「呼应」弧线，接上两年前的旧卡片。
 */
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ease, mix, progress } from "../../../brand/motion";
import { palette } from "../../../brand/tokens";
import { cameraAt, type Shot } from "../../../kit/Camera";
import { MapCanvas } from "../../../app-kit/parts/MapCanvas";
import { MAP_NODES, OLD_CARD_ID, TODAY_IDS } from "../../../mock/map";
import { f, T } from "../timeline";
import { collapsePoints } from "./DayWorld";

/** 星图层在 1920×1080 画面中的布局：1700×956 居中 */
export const STAR_LAYER = { width: 1700, height: 956, left: 110, top: 62, k: 1700 / 1600 };

const FOCUS = {
  x: STAR_LAYER.left + ((MAP_NODES[TODAY_IDS.card].x + MAP_NODES[OLD_CARD_ID].x) / 2) * STAR_LAYER.k,
  y: STAR_LAYER.top + ((MAP_NODES[TODAY_IDS.card].y + MAP_NODES[OLD_CARD_ID].y) / 2) * STAR_LAYER.k,
};

export const STAR_SHOTS: Shot[] = [
  { at: f(T.stars.start), x: 960, y: 540, zoom: 0.9 },
  { at: f(T.stars.push[0]), x: 960, y: 540, zoom: 1.0, ease: ease.soft },
  { at: f(T.stars.push[1]), x: FOCUS.x, y: FOCUS.y, zoom: 1.55 },
  { at: f(T.stars.toWindow[0]), x: FOCUS.x, y: FOCUS.y, zoom: 1.64, ease: ease.soft },
  { at: f(T.stars.toWindow[1]), x: 960, y: 540, zoom: 1.0 },
];

const DOT_TARGET: Record<string, number> = {
  today: TODAY_IDS.flashcard,
  pdf: TODAY_IDS.highlight,
  pomodoro: TODAY_IDS.card,
  card: TODAY_IDS.card,
  schedule: TODAY_IDS.article,
  review: TODAY_IDS.flashcard,
  todos: TODAY_IDS.article,
};

export function starGrowth(frame: number) {
  const old = 0.88 * progress(frame, f(T.stars.grow[0]), f(T.stars.grow[1] - T.stars.grow[0]), ease.out);
  const fresh = 0.88 + 0.12 * progress(frame, f(T.stars.today[0]), f(T.stars.today[1] - T.stars.today[0]), ease.inOut);
  return frame < f(T.stars.today[0]) ? old : Math.max(old, fresh);
}

export function StarScene() {
  const frame = useCurrentFrame();
  const cam = cameraAt(frame, STAR_SHOTS);
  const toScreen = (lx: number, ly: number) => ({ x: 960 + (lx - cam.x) * cam.zoom, y: 540 + (ly - cam.y) * cam.zoom });
  const fadeIn = progress(frame, f(T.stars.start), f(1.2));
  const fadeOut = progress(frame, f(T.stars.toWindow[0]) + 12, f(1.2), ease.inOut);
  const insight = progress(frame, f(T.stars.insight[0]), f(T.stars.insight[1] - T.stars.insight[0]), ease.inOut);
  const titleIn = progress(frame, f(T.stars.insight[1]) - 20, 30);

  return (
    <AbsoluteFill style={{ opacity: fadeIn * (1 - fadeOut) }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: "0 0",
          transform: `translate(960px, 540px) scale(${cam.zoom}) translate(${-cam.x}px, ${-cam.y}px)`,
        }}
      >
        <div style={{ position: "absolute", left: STAR_LAYER.left, top: STAR_LAYER.top }}>
          <MapCanvas
            variant="star"
            width={STAR_LAYER.width}
            height={STAR_LAYER.height}
            growth={starGrowth(frame)}
            labels={progress(frame, f(T.stars.labels[0]), f(T.stars.labels[1] - T.stars.labels[0]))}
            todayGlow={progress(frame, f(T.stars.today[1]), 30)}
            insight={insight}
            focus={{ ids: [TODAY_IDS.card, OLD_CARD_ID, ...Object.values(TODAY_IDS)], amount: 0.55 * progress(frame, f(T.stars.push[0]), f(2)) }}
            titles={[
              { id: TODAY_IDS.card, opacity: titleIn },
              { id: OLD_CARD_ID, opacity: titleIn, above: true },
            ]}
          />
        </div>
      </div>
      {collapsePoints().map((point, i) => {
        const target = MAP_NODES[DOT_TARGET[point.id]];
        const arrive = f(T.stars.today[0]) + i * 4;
        if (frame < point.at - 20 || frame > arrive + 24) return null;
        const t = progress(frame, point.at, arrive - point.at, ease.inOut);
        const end = toScreen(STAR_LAYER.left + target.x * STAR_LAYER.k, STAR_LAYER.top + target.y * STAR_LAYER.k);
        const lift = Math.sin(Math.PI * t) * -120;
        const x = mix(point.x, end.x, t);
        const y = mix(point.y, end.y, t) + lift;
        const grow = progress(frame, point.at - 20, 20);
        const fade = 1 - progress(frame, arrive, 24);
        return (
          <div
            key={point.id}
            style={{
              position: "absolute",
              left: x - 6,
              top: y - 6,
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: palette.night.star,
              opacity: grow * fade,
              boxShadow: `0 0 18px 6px rgba(230, 196, 127, 0.55), 0 0 60px 18px rgba(230, 196, 127, 0.2)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}

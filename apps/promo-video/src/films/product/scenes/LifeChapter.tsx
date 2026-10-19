/**
 * 一个想法的一生（曲内第 30–40 小节）：六个窗口摆在同一个椭圆上，一根金线按顺序把它们连起来，镜头沿线飞——
 * 输入（浏览器插件划线）→ 消化（Notebook 收进摘录、提问）→ 输出（划线成了卡片里的引用）→ 复习（闪卡）→
 * 总览（知识地图）→ 分享（发布成博客），最后拉远，金线从「分享」绕回「输入」，六个窗口围成闭环。
 * 开头接住白板段停在书单数据库上的镜头：这里在同一世界里放一份数据库窗口，从它飞向浏览器。
 */
import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ease, mix, progress } from "../../../brand/motion";
import { fonts } from "../../../brand/tokens";
import { ManifestoOverlay, manifestoVeil, VEIL_BLUR } from "../../../kit/Manifesto";
import { ModuleTag } from "../../../kit/ModuleTag";
import { Place, World, type CameraState, type Shot } from "../../../kit/Camera";
import { useStage } from "../../../kit/Stage";
import { AppWindow } from "../../../app-kit/AppWindow";
import { BrowserPage } from "../../../app-kit/pages/BrowserPage";
import { CardPage } from "../../../app-kit/pages/CardPage";
import { DatabasePage } from "../../../app-kit/pages/DatabasePage";
import { KnowledgeMapPage, MAP_CANVAS_RECT, MapCaption } from "../../../app-kit/pages/KnowledgeMapPage";
import { fitView, MapView } from "../../../app-kit/parts/MapView";
import { NotebookPage } from "../../../app-kit/pages/NotebookPage";
import { PublishPage } from "../../../app-kit/pages/PublishPage";
import { ReviewPage } from "../../../app-kit/pages/ReviewPage";
import { CardCrumb } from "../../../app-kit/parts/Crumbs";
import { bodyLength, schedule } from "../../../app-kit/doc/script";
import { LOOP_CARD, LOOP_REVIEW } from "../../../mock/deepwork";
import { DEEP_IDS, DEEP_STATS } from "../../../mock/deepmap";
import { MANIFESTOS, STEPS } from "../copy";
import { at, P } from "../timeline";

/** 闭环椭圆：六个窗口中心在 -150°、-90°、-30°、30°、90°、150° 上，顺时针 */
const RING = { rx: 2600, ry: 1500 };
const ANGLES = [-150, -90, -30, 30, 90, 150];
const rad = (deg: number) => (deg * Math.PI) / 180;
const onRing = (deg: number) => ({ x: RING.rx * Math.cos(rad(deg)), y: RING.ry * Math.sin(rad(deg)) });
export const SPOTS = ANGLES.map(onRing);
/** 书单数据库窗口：在「输入」左上方，镜头从它起飞 */
const DB = { x: SPOTS[0].x - 2100, y: SPOTS[0].y - 700 };

/** 椭圆按弧长取点：从 -150° 起顺时针一圈，table[k] 是第 k 个采样点的累计弧长占比 */
const SAMPLES = 720;
const RING_TABLE = (() => {
  const lengths = [0];
  let prev = onRing(ANGLES[0]);
  for (let k = 1; k <= SAMPLES; k++) {
    const p = onRing(ANGLES[0] + (360 * k) / SAMPLES);
    lengths.push(lengths[k - 1] + Math.hypot(p.x - prev.x, p.y - prev.y));
    prev = p;
  }
  return lengths.map(l => l / lengths[SAMPLES]);
})();
/** 第 i 个窗口在弧长上的位置（第 6 个即回到起点 = 1） */
const STOP = [...ANGLES.map(a => RING_TABLE[Math.round(((a - ANGLES[0]) / 360) * SAMPLES)]), 1];
function pointAt(fraction: number) {
  const k = RING_TABLE.findIndex(v => v >= fraction);
  return onRing(ANGLES[0] + (360 * Math.max(0, k)) / SAMPLES);
}
const RING_PATH = `M ${SPOTS[0].x} ${SPOTS[0].y} ${[...SPOTS.slice(1), SPOTS[0]].map(p => `A ${RING.rx} ${RING.ry} 0 0 1 ${p.x} ${p.y}`).join(" ")}`;

/** 「总览」一步在地图上亮起的节点：这次新写的卡片 */
const MAP_FOCUS = DEEP_IDS["先改环境，再谈专注"];

/** 拉远成闭环时的镜头（AI 段从这里接手） */
export const LOOP_VIEW = { x: 0, y: -40, zoom: 0.25 };

/** 金线与沿线走的光点（世界坐标，线宽按屏幕像素不随缩放变） */
export function Thread({ drawn, camera }: { drawn: number; camera: CameraState }) {
  const stage = useStage();
  const gold = stage.brand[1];
  const dot = pointAt(drawn);
  const r = 7 / camera.zoom;
  return (
    <svg className="absolute top-0 left-0 overflow-visible" width={1} height={1}>
      <path d={RING_PATH} fill="none" stroke={gold} strokeOpacity={0.28} strokeWidth={12} vectorEffect="non-scaling-stroke" pathLength={1} strokeDasharray={`${drawn} 1`} strokeLinecap="round" />
      <path d={RING_PATH} fill="none" stroke={gold} strokeWidth={3} vectorEffect="non-scaling-stroke" pathLength={1} strokeDasharray={`${drawn} 1`} strokeLinecap="round" />
      {drawn > 0 && drawn < 1 && (
        <>
          <circle cx={dot.x} cy={dot.y} r={r * 2.6} fill={gold} opacity={0.25} />
          <circle cx={dot.x} cy={dot.y} r={r} fill={gold} />
        </>
      )}
    </svg>
  );
}

/** 窗口上方的步骤名（拉远成闭环时才显出来） */
export function StepLabel({ index, name, x, y, opacity }: { index: number; name: string; x: number; y: number; opacity: number }) {
  const stage = useStage();
  if (opacity <= 0) return null;
  return (
    <Place x={x} y={y - 450 - 120} style={{ opacity, whiteSpace: "nowrap" }}>
      <span style={{ fontFamily: fonts.label, fontSize: 64, color: stage.brand[1], marginRight: 28, letterSpacing: "0.08em" }}>{String(index + 1).padStart(2, "0")}</span>
      <span style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 104, color: stage.ink, letterSpacing: "0.06em" }}>{name}</span>
    </Place>
  );
}

/** 六个窗口在 frame 时刻的界面（AI 段在圈中心演示时，用这一段结束时的状态） */
export function lifeWindows(frame: number): ReactNode[] {
  const S = P.life.steps;
  // 各窗口的界面状态
  const browser = {
    select: progress(frame, at(S[0].select), at(S[0].select + 1) - at(S[0].select), ease.inOut),
    toolbar: progress(frame, at(S[0].select + 1) - 2, 8),
    marked: frame >= at(S[0].mark),
    listed: progress(frame, at(S[0].mark) + 8, 14),
  };
  const notebook = {
    added: progress(frame, at(S[1].added), 14),
    ask: progress(frame, at(S[1].ask), 10),
    answer: progress(frame, at(S[1].answer), at(S[1].answer + 2.5) - at(S[1].answer), t => t),
  };
  const cardTimed = schedule(LOOP_CARD.blocks, 0, [-100000, -100000, at(S[2].type)]);
  const para = cardTimed[2];
  const cardWords = [...LOOP_CARD.blocks].slice(0, 2).reduce((n, b) => n + bodyLength(b), 0) + Math.round(bodyLength(para.block) * progress(frame, para.bodyAt, para.end - para.bodyAt, t => t));
  const reviewFlip = progress(frame, at(S[3].flip), 14);
  const mapGlow = progress(frame, at(S[4].glow), 16);
  const publish = {
    checked: frame >= at(S[5].check),
    pressed: frame >= at(S[5].press) && frame < at(S[5].press) + 10,
    progress: frame >= at(S[5].press) + 6 ? progress(frame, at(S[5].press) + 6, at(S[5].done) - at(S[5].press) - 6, t => t) : undefined,
    done: frame >= at(S[5].done),
  };

  return [
    <BrowserPage key="browser" state={browser} />,
    <AppWindow key="notebook" active="vibe-learning" crumb="专注与深度工作">
      <NotebookPage state={notebook} />
    </AppWindow>,
    <AppWindow key="card" active="cards" crumb={<CardCrumb title="先改环境，再谈专注" />}>
      <CardPage timed={cardTimed} frame={frame} words={cardWords} links={frame >= at(S[2].links) ? LOOP_CARD.links : LOOP_CARD.links - 1} tags={LOOP_CARD.tags} created={LOOP_CARD.created} />
    </AppWindow>,
    <AppWindow key="review" active="review">
      <ReviewPage flipped={reviewFlip} pressed={frame >= at(S[3].press) ? 3 : undefined} card={LOOP_REVIEW} />
    </AppWindow>,
    <AppWindow key="map" active="knowledge-map" mapActive crumb="知识地图">
      <KnowledgeMapPage
        stats={DEEP_STATS}
        caption={<MapCaption text={`${DEEP_STATS.total} 条笔记 · 始于 ${DEEP_STATS.since}`} state="idle" />}
        canvasSlot={
          <MapView
            width={MAP_CANVAS_RECT.width}
            height={MAP_CANVAS_RECT.height}
            view={fitView(MAP_CANVAS_RECT.width, MAP_CANVAS_RECT.height)}
            current={mapGlow > 0.3 ? [MAP_FOCUS] : []}
            focus={{ id: MAP_FOCUS, amount: mapGlow }}
            hoverLabel={{ id: MAP_FOCUS, opacity: mapGlow }}
          />
        }
      />
    </AppWindow>,
    <AppWindow key="publish" active="publish">
      <PublishPage state={publish} />
    </AppWindow>,
  ];
}

export function LifeChapter() {
  const frame = useCurrentFrame();
  const L = P.life;
  const S = L.steps;

  // 金线：第 i 段在镜头从窗口 i 飞向 i+1 时画出，最后一段在拉远时把圈闭上
  const flights = S.map((step, i) => ({ from: at(step.leave), to: at(i < S.length - 1 ? S[i + 1].arrive : L.loop[1]) }));
  let drawn = 0;
  flights.forEach((fl, i) => {
    if (frame >= fl.from) drawn = mix(STOP[i], STOP[i + 1], progress(frame, fl.from, fl.to - fl.from, ease.inOut));
  });

  // 镜头：从数据库起飞 → 每到一个窗口先看全貌再推近动作处 → 沿线飞向下一个 → 拉远成闭环
  const shots: Shot[] = [{ at: at(L.start), x: DB.x + 111, y: DB.y + 17, zoom: 1.14 }];
  S.forEach((step, i) => {
    const spot = SPOTS[i];
    shots.push({ at: at(step.arrive), x: spot.x, y: spot.y, zoom: 1.02, ease: ease.inOut, dip: 0.42 });
    shots.push({ at: at(step.leave), x: spot.x + step.focus[0], y: spot.y + step.focus[1], zoom: step.zoom, ease: ease.soft });
  });

  shots.push({ at: at(L.loop[1]), ...LOOP_VIEW, ease: ease.inOut });
  shots.push({ at: at(L.end), ...LOOP_VIEW, zoom: 0.26, ease: ease.soft });

  const veil = manifestoVeil(frame, at(L.manifesto[0]), at(L.manifesto[1]));
  const dbFade = 1 - progress(frame, at(L.start) + 20, 30);

  const windows = lifeWindows(frame);

  return (
    <>
      <AbsoluteFill style={{ filter: veil > 0.01 ? `blur(${VEIL_BLUR * veil}px)` : undefined }}>
        <World shots={shots}>
          {camera => (
            <>
              <Thread drawn={drawn} camera={camera} />
              {dbFade > 0 && (
                <Place x={DB.x} y={DB.y} style={{ opacity: dbFade }}>
                  <AppWindow active="databases" crumb={<span className="text-tau-meta text-ink-2 px-1.5 py-0.5">书单</span>}>
                    <DatabasePage view="calendar" />
                  </AppWindow>
                </Place>
              )}
              {windows.map((win, i) => (
                <Place key={i} x={SPOTS[i].x} y={SPOTS[i].y}>
                  {win}
                </Place>
              ))}
              {/* 镜头拉远到半倍以下才显出步骤名，贴近窗口时不压在窗口上 */}
              {frame >= at(L.loop[0]) &&
                STEPS.map((step, i) => <StepLabel key={step.name} index={i} name={step.name} x={SPOTS[i].x} y={SPOTS[i].y} opacity={Math.min(1, Math.max(0, (0.5 - camera.zoom) / 0.18))} />)}
            </>
          )}
        </World>
      </AbsoluteFill>
      {STEPS.map((step, i) => (
        <ModuleTag key={step.name} index={String(i + 1).padStart(2, "0")} module={step.name} feature={step.feature} at={i === 0 ? at(L.manifesto[1]) : at(S[i].arrive) - 6} out={at(S[i].leave) + 4} />
      ))}
      <ManifestoOverlay text={MANIFESTOS.life.text} sub={MANIFESTOS.life.sub} accent={MANIFESTOS.life.accent} at={at(L.manifesto[0])} out={at(L.manifesto[1])} size={118} />
    </>
  );
}

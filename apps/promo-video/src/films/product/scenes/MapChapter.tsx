/**
 * 拉远 → 知识地图（曲内第 48–66 小节）：
 * 接住 AI 段结尾刚插入的内链，点开跳到卡片「先改环境，再谈专注」→ 续写一句，敲 [[ 连上「注意力残留」→
 * 卡片窗口收拢成地图上的一个节点，新连线从它伸出 → 镜头沿线拉远，标签按真实的三级缩放由卡片标题换成子主题、大主题，
 * 地图窗口在外围浮现 → 点说明行开始回放，地图清空，镜头推进满屏白纸压宣言（第 56 小节空拍）→
 * 第 58 小节镜头拉回、地图按创建顺序长出来 → 点「AI 洞见」，跨主题的呼应弧线画出，选一处连接。
 *
 * 世界坐标：地图窗口居中于原点、原尺寸；画布里的地图用 MapView 叠在画布位置上。卡片窗口按 CARD_SCALE 缩小后放在
 * 「先改环境」节点上，镜头推得很近时它看起来就是正常大小的窗口——拉远时卡片在原地收拢成那个节点。
 */
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ease, mix, progress } from "../../../brand/motion";
import { ManifestoOverlay } from "../../../kit/Manifesto";
import { ModuleTag } from "../../../kit/ModuleTag";
import { cameraAt, Place, World, type CameraState, type Shot } from "../../../kit/Camera";
import { VIDEO } from "../../../brand/tokens";
import { useAppTheme } from "../../../app-kit/theme";
import { AppWindow, WINDOW } from "../../../app-kit/AppWindow";
import { CardPage } from "../../../app-kit/pages/CardPage";
import { KnowledgeMapPage, MAP_CANVAS_RECT, MAP_REPORT_WIDTH, MapCaption } from "../../../app-kit/pages/KnowledgeMapPage";
import { CardCrumb } from "../../../app-kit/parts/Crumbs";
import { arcApex, fitView, mapProjector, MapView } from "../../../app-kit/parts/MapView";
import { MapInsightPopover, MapReportBody } from "../../../app-kit/parts/MapInsights";
import { MentionPanel, type MentionItem } from "../../../app-kit/parts/MentionPanel";
import { Toast } from "../../../app-kit/parts/Toast";
import { bodyLength, schedule } from "../../../app-kit/doc/script";
import { caretOn, typed } from "../../../kit/typing";
import { DEEP_INSIGHTS, DEEP_NODES, DEEP_STATS, monthLabel, NEW_LINK } from "../../../mock/deepmap";
import { LOOP_CARD, MAP_CHAPTER } from "../../../mock/deepwork";
import { MANIFESTOS, MAP_TAGS } from "../copy";
import { at, beatFrames, P } from "../timeline";
import { AI_END_SHOT, AI_TARGET, aiWindow } from "./AiChapter";
import { clickAt, Cursor, type CursorStop } from "../../../kit/Cursor";

/** 地图窗口在镜头 1 倍时看全的缩放 */
const Z_FIT = 1.12;
/** 拉远起点：软件里相当于把地图放大到 LENS_START 倍（语义缩放 ≈ 3.5，显卡片标题） */
const LENS_START = 3.8;
const CANVAS = MAP_CANVAS_RECT;
/** 画布左上角的世界坐标 */
const ORIGIN = { x: -WINDOW.width / 2 + CANVAS.left, y: -WINDOW.height / 2 + CANVAS.top };
const CANVAS_CENTER = { x: ORIGIN.x + CANVAS.width / 2, y: ORIGIN.y + CANVAS.height / 2 };

const fitFor = (width: number) => fitView(width, CANVAS.height);
const FIT = fitFor(CANVAS.width);

const [ENV, RES] = NEW_LINK;
const nodeWorld = (id: number) => {
  const [cx, cy] = mapProjector(FIT, CANVAS.width, CANVAS.height)(DEEP_NODES[id].x, DEEP_NODES[id].y);
  return { x: ORIGIN.x + cx, y: ORIGIN.y + cy };
};
const ENV_AT = nodeWorld(ENV);
const RES_AT = nodeWorld(RES);

/** 卡片窗口在世界里的缩放：镜头推到 LENS_START 倍时，它在画面上约 1.04 倍 */
const CARD_SCALE = 1.04 / (LENS_START * Z_FIT);
/** 卡片窗口局部坐标的机位 → 世界机位 */
const local = (x: number, y: number, zoom: number) => ({ x: ENV_AT.x + x * CARD_SCALE, y: ENV_AT.y + y * CARD_SCALE, zoom: zoom / CARD_SCALE });

/** 地图窗口里的点按位置（窗口坐标，Measure-map* 实测）；选中的呼应弧线顶点由 arcApex 算出 */
const TARGET = {
  caption: { x: 300, y: 856 },
  insightsButton: { x: 1348, y: 90 },
  connect: { x: 613, y: 809 },
};
const REPORT_CANVAS_WIDTH = CANVAS.width - MAP_REPORT_WIDTH;
const ARC_APEX = arcApex(DEEP_INSIGHTS.arcs[1], fitFor(REPORT_CANVAS_WIDTH), REPORT_CANVAS_WIDTH, CANVAS.height);

const RECENT: MentionItem[] = [
  { kind: "article", title: "专注不是意志力问题", excerpt: "上午十点，你刚进入状态，手机亮了一下。" },
  { kind: "article", title: "Deep Work：在喧嚣里保持专注", excerpt: "我们总以为专注是一种意志力。" },
  { kind: "card", title: "通知的代价", excerpt: "每一次提醒，都是一次被打断。" },
];
const BASE_WORDS = LOOP_CARD.blocks.reduce((n, b) => n + bodyLength(b), 0);
const CARD_TIMED = schedule(LOOP_CARD.blocks, -100000);

const logMix = (a: number, b: number, t: number) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t);
const bezier = (p0: { x: number; y: number }, c: { x: number; y: number }, p1: { x: number; y: number }, t: number) => ({
  x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * c.x + t * t * p1.x,
  y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * c.y + t * t * p1.y,
});

/** 洞见选中那处的气泡位置（画布像素，左上角），按真实的 bottom-start 锚在弧线顶点下方，放不下时收回画布内 */
export function popoverSpot(width: number) {
  const apex = arcApex(DEEP_INSIGHTS.arcs[1], fitFor(width), width, CANVAS.height);
  return { left: Math.min(apex.x, width - 372), top: Math.min(apex.y + 10, CANVAS.height - 300) };
}

export function MapChapter() {
  const frame = useCurrentFrame();
  const appTheme = useAppTheme();
  const M = P.map;
  const T = M.typing;
  const I = M.insights;

  // —— 镜头
  const shots: Shot[] = [
    { at: at(M.start), ...local(AI_END_SHOT.x, AI_END_SHOT.y, AI_END_SHOT.zoom) },
    // 点内链时机位不动，跳到卡片后再 2 拍推到正在写的那一行
    { at: at(M.click + 0.25), ...local(AI_END_SHOT.x, AI_END_SHOT.y, AI_END_SHOT.zoom * 1.01), ease: ease.soft },
    { at: at(T.start + 0.5), ...local(40, -70, 1.45), ease: ease.inOut },
    { at: at(T.rest + 2), ...local(60, -90, 1.46), ease: ease.soft },
    { at: at(M.morph[0]), ...local(0, 0, 1.04), ease: ease.inOut },
    { at: at(M.morph[1]), x: ENV_AT.x, y: ENV_AT.y, zoom: LENS_START * Z_FIT * 0.94, ease: ease.soft },
  ];
  const pullFrom = shots[shots.length - 1];
  const pull = (fr: number): CameraState => {
    const t = ease.inOut(Math.min(1, Math.max(0, (fr - pullFrom.at) / (at(M.pull.fit) - pullFrom.at))));
    // 沿新连线的方向先滑向「注意力残留」，再回到窗口中心
    const control = { x: RES_AT.x + (RES_AT.x - ENV_AT.x) * 0.6, y: RES_AT.y + (RES_AT.y - ENV_AT.y) * 0.6 };
    return { ...bezier(ENV_AT, control, { x: 0, y: 0 }, t), zoom: logMix(pullFrom.zoom, Z_FIT, t) };
  };
  for (let fr = pullFrom.at + 2; fr < at(M.pull.fit); fr += 2) shots.push({ at: fr, ...pull(fr), ease: t => t });
  const width = CANVAS.width - MAP_REPORT_WIDTH * progress(frame, at(I.click + 0.25), 30, ease.inOut);
  const spot = popoverSpot(CANVAS.width - MAP_REPORT_WIDTH);
  const popoverCenter = { x: ORIGIN.x + spot.left + 180, y: ORIGIN.y + spot.top + 120 };
  shots.push(
    { at: at(M.pull.fit), x: 0, y: 0, zoom: Z_FIT, ease: t => t },
    { at: at(M.play), x: 0, y: 0, zoom: Z_FIT * 1.02, ease: ease.soft },
    { at: at(M.manifesto[0] + 0.5), ...CANVAS_CENTER, zoom: 1.95, ease: ease.inOut },
    { at: at(M.manifesto[1]), ...CANVAS_CENTER, zoom: 2.02, ease: ease.soft },
    { at: at(M.manifesto[1] + 4), x: 0, y: 0, zoom: Z_FIT, ease: ease.out },
    { at: at(I.push), x: 0, y: 0, zoom: Z_FIT * 1.03, ease: ease.soft },
    { at: at(I.select), x: mix(0, popoverCenter.x, 0.75), y: mix(0, popoverCenter.y, 0.75), zoom: 1.42, ease: ease.inOut },
    { at: at(I.back), x: mix(0, popoverCenter.x, 0.8), y: mix(0, popoverCenter.y, 0.8), zoom: 1.46, ease: ease.soft },
    { at: at(I.back + 3), x: 0, y: 0, zoom: Z_FIT, ease: ease.inOut },
    { at: at(M.end), x: 0, y: 0, zoom: Z_FIT * 1.02, ease: ease.soft }
  );
  const camera = cameraAt(frame, shots);

  // —— 光标：卡片窗口里接住 AI 段移到内链的光标、点下去后淡出；地图窗口里点说明行、「AI 洞见」、选中弧线、「连接」
  const beatLen = beatFrames(M.start);
  const moveTo = (to: { x: number; y: number }, n: number, lead = 0.9) => clickAt(to, at(n), lead * beatLen);
  const cardCursor: CursorStop[] = [{ at: at(P.ai.compose.link), ...AI_TARGET.link }, ...moveTo(AI_TARGET.inlineLink, M.click)];
  const arcTarget = { x: CANVAS.left + ARC_APEX.x, y: CANVAS.top + ARC_APEX.y };
  const mapCursor: CursorStop[] = [
    { at: at(M.chrome[1]), x: 760, y: 560 },
    { at: at(M.hover), ...TARGET.caption },
    { at: at(M.play), ...TARGET.caption, click: true },
    { at: at(M.manifesto[1] + 3), x: 1180, y: 300 },
    ...moveTo(TARGET.insightsButton, I.click),
    ...moveTo(arcTarget, I.select),
    ...moveTo(TARGET.connect, I.connect),
  ];
  // 窗口浮现以前，镜头推近等于软件里放大地图（字号、半径不跟着变大）；浮现以后就是把窗口本身推近
  const lens = frame < at(M.pull.fit) ? Math.max(1, camera.zoom / Z_FIT) : 1;

  // —— 卡片窗口：换页 → 续写 → [[ → 收拢成节点
  const swapped = frame >= at(M.swap);
  const narrow = progress(frame, at(M.swap), at(M.start + 2) - at(M.swap), ease.inOut);
  const cardSize = { width: mix(1760, WINDOW.width, narrow), height: mix(990, WINDOW.height, narrow) };
  const shrink = progress(frame, at(M.morph[0]), at(M.morph[1]) - at(M.morph[0]), ease.inOut);
  const cardScale = CARD_SCALE * logMix(1, 0.035, shrink);
  const cardOpacity = 1 - progress(frame, at(M.morph[0] + 1.3), at(M.morph[1]) - at(M.morph[0] + 1.3), ease.in);

  const S = MAP_CHAPTER.sentence;
  const before = typed(S.before, frame, at(T.start), 4);
  const bracket = typed("[[", frame, at(T.bracket), 4);
  const query = typed(MAP_CHAPTER.query, frame, at(T.query), 5);
  const linked = frame >= at(T.enter);
  const rest = typed(S.after, frame, at(T.rest), 3);
  const panel = progress(frame, at(T.bracket) + 8, 6) * (1 - progress(frame, at(T.enter), 6));
  const panelItems = query.count > 0 ? [...MAP_CHAPTER.mentions] : RECENT;
  const typing = frame >= at(T.start) - 4;
  const words = BASE_WORDS + before.count + (linked ? [...S.link].length + rest.count : bracket.count + query.count);

  const tail = typing && (
    <p className="relative mb-[1.25em]">
      {before.text}
      {!linked && bracket.count > 0 && <span>{bracket.text + query.text}</span>}
      {linked && (
        <span className="text-accent-text underline decoration-[color:color-mix(in_srgb,var(--tau-accent)_38%,transparent)] decoration-dotted decoration-[1.5px] underline-offset-[3px]">{S.link}</span>
      )}
      {linked && rest.text}
      {caretOn(frame, !rest.done && frame < at(T.rest) + 200) && <i className="bg-ink-1 ml-px inline-block h-[1.1em] w-[2px] translate-y-[0.18em]" />}
      {panel > 0 && (
        <span className="relative inline-block h-[1em] w-0">
          <span className="absolute top-[1.7em] -left-[2.5em] z-10" style={{ opacity: panel, transform: `translateY(${(1 - panel) * 4}px) scale(${0.98 + 0.02 * panel})` }}>
            <MentionPanel query={query.text} items={panelItems} />
          </span>
        </span>
      )}
    </p>
  );

  const cardWindow = swapped ? (
    <AppWindow active="cards" size={cardSize} crumb={<CardCrumb title="先改环境，再谈专注" />}>
      <CardPage timed={CARD_TIMED} frame={frame} words={words} links={frame >= at(T.enter) + 6 ? LOOP_CARD.links + 1 : LOOP_CARD.links} tags={LOOP_CARD.tags} created={LOOP_CARD.created} tail={tail} />
    </AppWindow>
  ) : (
    aiWindow(at(P.ai.end) - 1, frame >= at(M.click) - 4)
  );

  // —— 地图
  const mapIn = progress(frame, at(M.morph[0]) + 4, 24);
  const playing = frame >= at(M.play);
  const vanish = playing ? progress(frame, at(M.play), 8) : 0;
  const growth = progress(frame, at(M.growth[0]), at(M.growth[1]) - at(M.growth[0]), t => t);
  const POP = 0.02;
  const reveal = playing && vanish >= 1 ? (n: (typeof DEEP_NODES)[number]) => (growth - n.born * (1 - POP)) / POP : undefined;
  const shownNodes = reveal ? DEEP_NODES.filter(n => reveal(n) > 0) : DEEP_NODES;
  const latest = shownNodes.reduce((m, n) => Math.max(m, n.month), 0);
  const captionText = playing && growth < 1 ? `${monthLabel(latest)} · ${shownNodes.length} 条` : `${DEEP_STATS.total} 条笔记 · 始于 ${DEEP_STATS.since}`;
  const captionState = playing && growth < 1 ? "playing" : frame >= at(M.hover) && frame < at(M.play) ? "hover" : "idle";
  const emphasis = progress(frame, at(M.morph[0] + 1), 14) * (1 - progress(frame, at(M.pull.title) - 6, at(M.pull.sub) - at(M.pull.title), ease.inOut));
  const chrome = progress(frame, at(M.chrome[0]), at(M.chrome[1]) - at(M.chrome[0]), ease.inOut);

  // —— 洞见
  const button = frame < at(I.click + 0.25) ? "off" : frame < at(I.result) ? "reading" : "on";
  const reading = frame >= at(I.click + 0.25) && frame < at(I.result);
  const select = progress(frame, at(I.select), 12) * (1 - progress(frame, at(I.connect) + 4, 12));
  const linkedArc = frame >= at(I.connect) + 2;
  const arcs = DEEP_INSIGHTS.arcs.map((arc, i) => ({ ...arc, draw: progress(frame, at(I.result) + 15 + i * 19, 42, ease.inOut), linked: i === 1 && linkedArc }));
  const popover = progress(frame, at(I.popover), 10) * (1 - progress(frame, at(I.connect) + 2, 8));
  const sweepX = ((frame - at(I.click + 0.25)) / (2.2 * 60)) % 1;

  const view = fitFor(width);
  const visible = {
    left: camera.x - VIDEO.width / 2 / camera.zoom - ORIGIN.x,
    right: camera.x + VIDEO.width / 2 / camera.zoom - ORIGIN.x,
    top: camera.y - VIDEO.height / 2 / camera.zoom - ORIGIN.y,
    bottom: camera.y + VIDEO.height / 2 / camera.zoom - ORIGIN.y,
  };

  return (
    <>
      <AbsoluteFill>
        <World shots={[{ at: 0, ...camera }]}>
          <>
            {chrome > 0 && (
              <Place x={0} y={0} style={{ opacity: chrome }}>
                <AppWindow active="knowledge-map" mapActive crumb="知识地图">
                  <KnowledgeMapPage
                    stats={DEEP_STATS}
                    report={progress(frame, at(I.click + 0.25), 30, ease.inOut)}
                    insightButton={button}
                    insightPressed={frame >= at(I.click) - 6 && frame < at(I.click + 0.25)}
                    reportBody={<MapReportBody content={MAP_CHAPTER.report} reading={reading} appear={progress(frame, at(I.result), 30)} />}
                    canvasSlot={<div />}
                    caption={<MapCaption text={captionText} state={captionState} />}
                  />
                </AppWindow>
              </Place>
            )}
            {mapIn > 0 && (
              <div
                data-theme={appTheme}
                data-mode="light"
                className="absolute overflow-hidden"
                style={{ left: ORIGIN.x, top: ORIGIN.y, width, height: CANVAS.height, opacity: mapIn * (playing && vanish < 1 ? 1 - vanish : 1) }}
              >
                <MapView
                  width={width}
                  height={CANVAS.height}
                  view={view}
                  lens={lens}
                  visible={visible}
                  reveal={reveal}
                  current={playing ? [] : [ENV]}
                  focus={{ id: ENV, amount: emphasis }}
                  growing={[{ a: ENV, b: RES, t: progress(frame, at(M.grow[0]), at(M.grow[1]) - at(M.grow[0]), ease.inOut) }]}
                  insight={frame >= at(I.result) ? { arcs, selected: { index: 1, amount: select }, pin: { ...DEEP_INSIGHTS.pin, appear: progress(frame, at(I.result) + 40, 20) } } : undefined}
                  chips={[DEEP_INSIGHTS.arcs[1].a, DEEP_INSIGHTS.arcs[1].b].map(id => ({ id, opacity: select }))}
                >
                  {reading && (
                    <div className="absolute inset-0 overflow-hidden">
                      <div
                        className="absolute inset-y-0 w-40 bg-[linear-gradient(90deg,transparent,var(--tau-accent-soft)_45%,var(--tau-accent-soft)_55%,transparent)]"
                        style={{ left: -160 + (width + 160) * sweepX }}
                      />
                    </div>
                  )}
                  {popover > 0 && (
                    <div className="absolute" style={{ left: spot.left, top: spot.top, opacity: popover, transform: `translateY(${(1 - popover) * 4}px) scale(${0.98 + 0.02 * popover})` }}>
                      <MapInsightPopover {...MAP_CHAPTER.popover} pressed={frame >= at(I.connect) - 6 && frame < at(I.connect) + 4} />
                    </div>
                  )}
                </MapView>
              </div>
            )}
            {chrome > 0 && (
              <Place x={0} y={0}>
                <div data-theme={appTheme} data-mode="light" className="relative" style={{ width: WINDOW.width, height: WINDOW.height }}>
                  <Toast message={MAP_CHAPTER.toast} appear={progress(frame, at(I.connect) + 4, 12) * (1 - progress(frame, at(M.end) - 14, 12))} />
                  <Cursor path={mapCursor} visibleFrom={at(M.chrome[1])} visibleTo={at(M.play) + 10} />
                  <Cursor path={mapCursor} visibleFrom={at(M.manifesto[1] + 3)} visibleTo={at(I.connect) + 40} />
                </div>
              </Place>
            )}
            {cardOpacity > 0 && (
              <Place x={ENV_AT.x} y={ENV_AT.y} style={{ opacity: cardOpacity, transform: `translate(-50%, -50%) scale(${cardScale})` }}>
                <div className="relative">
                  {cardWindow}
                  <Cursor path={cardCursor} visibleFrom={at(M.start) - 12} visibleTo={at(M.swap) + 6} />
                </div>
              </Place>
            )}
          </>
        </World>
      </AbsoluteFill>
      <ModuleTag module={MAP_TAGS[0].module} feature={MAP_TAGS[0].feature} at={at(M.start + 2.5)} out={at(M.morph[0])} />
      <ModuleTag module={MAP_TAGS[1].module} feature={MAP_TAGS[1].feature} at={at(M.grow[1])} out={at(M.play)} />
      <ModuleTag module={MAP_TAGS[2].module} feature={MAP_TAGS[2].feature} at={at(M.manifesto[1]) + 12} out={at(I.click)} />
      <ModuleTag module={MAP_TAGS[3].module} feature={MAP_TAGS[3].feature} at={at(I.click) + 8} out={at(M.end)} />
      <ManifestoOverlay text={MANIFESTOS.map.text} sub={MANIFESTOS.map.sub} accent={MANIFESTOS.map.accent} at={at(M.manifesto[0])} out={at(M.manifesto[1]) + 8} size={118} />
    </>
  );
}

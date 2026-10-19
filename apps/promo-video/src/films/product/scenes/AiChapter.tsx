/**
 * AI（曲内第 40–48 小节）：接住闭环全景——圈中心浮出一个 Tau 窗口，金线从中心连向六个窗口，
 * 叠宣言「它认识你写过的一切。」；随后推进这个窗口，同一个窗口里依次演示：
 * 小管家（一句话把待办排进下周，日程当场长出三段）→ 洞见（正文里标出可连接处，一键连上）→
 * 创作模式（窗口拉宽展开双栏，资料逐张落到白板上，写到一段时相关卡片亮起，连到此段）。
 */
import clsx from "clsx";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ease, mix, progress } from "../../../brand/motion";
import { ManifestoOverlay, manifestoVeil, VEIL_BLUR } from "../../../kit/Manifesto";
import { ModuleTag } from "../../../kit/ModuleTag";
import { Place, World, type Shot } from "../../../kit/Camera";
import { useStage } from "../../../kit/Stage";
import { caretOn, typed } from "../../../kit/typing";
import { clickAt, Cursor, type CursorStop } from "../../../kit/Cursor";
import { AppWindow } from "../../../app-kit/AppWindow";
import { ComposePage, EDITOR_PANE_DEFAULT } from "../../../app-kit/pages/ComposePage";
import { InsightsArticlePage, type InsightsState } from "../../../app-kit/pages/InsightsArticlePage";
import { SchedulePage } from "../../../app-kit/pages/SchedulePage";
import { CardCrumb } from "../../../app-kit/parts/Crumbs";
import { ComposeBoard, type BoardView, type DocState, type GatherStatus } from "../../../app-kit/parts/ComposeBoard";
import { TaskAssistDock } from "../../../app-kit/parts/TaskAssistDock";
import { boundsOf, layoutGather } from "../../../mock/compose";
import { AI_ASSIST, AI_COMPOSE, ARTICLE } from "../../../mock/deepwork";
import { MANIFESTOS, STEPS } from "../copy";
import { at, beatFrames, P } from "../timeline";
import { LOOP_VIEW, lifeWindows, SPOTS, StepLabel, Thread } from "./LifeChapter";

/**
 * 光标点按的位置（窗口坐标，左上角为原点；Measure-ai* 实测）。创作模式之后窗口拉宽到 1760×990，gather / link 是宽窗口坐标。
 */
export const AI_TARGET = {
  assistButton: { x: 1371, y: 23 },
  send: { x: 1376, y: 844 },
  insightsButton: { x: 731, y: 145 },
  linkMark: { x: 936, y: 521 },
  connect: { x: 931, y: 683 },
  composeToggle: { x: 820, y: 145 },
  gather: { x: 842, y: 636 },
  link: { x: 810, y: 449 },
  /** 刚插入正文的内链：知识地图段开头点它跳到卡片 */
  inlineLink: { x: 1458, y: 230 },
};
/** 每组操作一个固定机位：小管家（标题栏按钮到输入框）/ 洞见（按钮、标记、气泡）/ 创作模式（白板 + 正文） */
const ASSIST_VIEW = { x: 260, y: -30, zoom: 1.08 };
const INSIGHTS_VIEW = { x: 110, y: -40, zoom: 1.38 };
const COMPOSE_VIEW = { x: -80, y: -10, zoom: 1.06 };

const SMALL = { width: 1440, height: 900 };
const WIDE = { width: 1760, height: 990 };

const FRAMES = layoutGather(AI_COMPOSE.groups);
const DOCS = FRAMES.flatMap(g => g.items);
const BOUNDS = boundsOf(FRAMES);

/** 圈中心到六个窗口的辐条：AI 读得到每一处 */
function Spokes({ t }: { t: number }) {
  const stage = useStage();
  if (t <= 0) return null;
  return (
    <svg className="absolute top-0 left-0 overflow-visible" width={1} height={1}>
      {SPOTS.map((spot, i) => {
        const draw = Math.min(1, Math.max(0, t * 1.6 - i * 0.12));
        return (
          <line
            key={i}
            x1={0}
            y1={0}
            x2={spot.x * draw}
            y2={spot.y * draw}
            stroke={stage.brand[1]}
            strokeWidth={2}
            strokeOpacity={0.55}
            strokeDasharray="2 10"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

/** AI 段结束时的镜头（中心窗口在世界原点、原尺寸），知识地图段从这里接手 */
export const AI_END_SHOT = { x: -60, y: -40, zoom: 1.18 };

/** AI 段中心窗口在 frame 时刻的界面；知识地图段开头用它接住最后一帧 */
export function aiWindow(frame: number, linkHover = false) {
  const A = P.ai;

  // —— 小管家
  const H = A.assist;
  const draft = typed(AI_ASSIST.ask, frame, at(H.typing), 1);
  const sent = frame >= at(H.send);
  const assist = {
    open: progress(frame, at(H.open), 18, ease.inOut) * (1 - progress(frame, at(A.insights.start) - 10, 12, ease.inOut)),
    user: progress(frame, at(H.send), 10),
    tools: [frame < at(H.query) ? 0 : frame < at(H.query) + 24 ? 0.5 : 1, frame < at(H.create) ? 0 : frame < at(H.create) + 24 ? 0.5 : 1] as [number, number],
    answer: progress(frame, at(H.answer), at(H.answer + 3) - at(H.answer), t => t),
    draft: !sent && frame >= at(H.typing) ? draft.text : undefined,
  };
  const scheduled = AI_ASSIST.added.map((_, i) => progress(frame, at(H.create) + 24 + i * 7, 14));

  // —— 洞见
  const I = A.insights;
  const insights: InsightsState = {
    mode: frame < at(I.click) ? "off" : frame < at(I.report) ? "reading" : "on",
    report: progress(frame, at(I.report), 14),
    marks: [progress(frame, at(I.report) + 8, 33), progress(frame, at(I.report) + 23, 33)],
    popover: progress(frame, at(I.popover), 10),
    pressed: frame >= at(I.connect) - 6 && frame < at(I.connect) + 4,
    connected: progress(frame, at(I.connect), 18),
  };

  // —— 创作模式
  const C = A.compose;
  const widen = progress(frame, at(C.start), 24, ease.inOut);
  const size = {
    width: mix(SMALL.width, WIDE.width, widen),
    height: mix(SMALL.height, WIDE.height, widen),
  };
  const inner = { width: size.width - 238 - 16, height: size.height - 50 - 16 };
  const boardWidth = inner.width - EDITOR_PANE_DEFAULT - 12;
  const fit: BoardView = {
    x: (BOUNDS.minX + BOUNDS.maxX) / 2,
    y: (BOUNDS.minY + BOUNDS.maxY) / 2,
    zoom: Math.min((boardWidth - 120) / (BOUNDS.maxX - BOUNDS.minX), (inner.height - 160) / (BOUNDS.maxY - BOUNDS.minY)),
  };
  const order: { frame?: number; doc?: string }[] = FRAMES.flatMap((g, i) => [{ frame: i }, ...g.items.map(d => ({ doc: d.id }))]);
  const landAt = (k: number) => at(C.place) + k * ((at(C.done) - at(C.place)) / order.length);
  const frameAppear = FRAMES.map((_, i) => progress(frame, landAt(order.findIndex(o => o.frame === i)), 14));
  const glow = progress(frame, at(C.glow), 10) * (1 - progress(frame, at(C.link) + 2, 8));
  const cited = progress(frame, at(C.link) + 4, 12);
  const docs: Record<string, DocState> = Object.fromEntries(
    DOCS.map(d => {
      const state: DocState = {
        appear: progress(frame, landAt(order.findIndex(o => o.doc === d.id)), 16, ease.out),
      };
      if (d.id === AI_COMPOSE.glowId)
        Object.assign(state, {
          glow,
          press: frame >= at(C.link) - 6 && frame < at(C.link) + 4 ? 1 : 0,
          cited,
        });
      return [d.id, state];
    })
  );
  const phases = ["读你的写作意图…", "在 3,214 份内容里粗筛出 41 份", "挑出值得放上来的，分好组…"];
  const phase = Math.min(2, Math.floor((frame - at(C.gather)) / 12));
  const status: GatherStatus | undefined = frame >= at(C.done) ? { kind: "done", count: DOCS.length } : frame >= at(C.gather) ? { kind: "running", text: phases[Math.max(0, phase)] } : undefined;
  const para = typed(AI_COMPOSE.paragraph, frame, at(C.write), 1);
  const linked = frame >= at(C.link) + 2;
  const linkTitle = DOCS.find(d => d.id === AI_COMPOSE.glowId)!.heading!;

  const page = frame < at(I.start) ? "assist" : frame < at(C.start) ? "insights" : "compose";

  const crumb = page === "assist" ? "日程" : page === "insights" ? <CardCrumb section="文章" title={ARTICLE.title} /> : <CardCrumb section="文章" title={AI_COMPOSE.title} />;

  return (
    <AppWindow
      active={page === "assist" ? "schedule" : "articles"}
      size={size}
      crumb={crumb}
      assistOpen={page === "assist" && assist.open > 0.5}
      assist={page === "assist" ? <TaskAssistDock state={assist} /> : undefined}
    >
      {page === "assist" && <SchedulePage week={AI_ASSIST.week} events={AI_ASSIST.events} added={AI_ASSIST.added} appear={scheduled} />}
      {page === "insights" && <InsightsArticlePage title={ARTICLE.title} words={3280} links={ARTICLE.links + (insights.connected > 0 ? 1 : 0)} state={insights} frame={frame} />}
      {page === "compose" && (
        <ComposePage
          innerWidth={inner.width}
          split={widen}
          togglePressed={frame >= at(C.start) - 6 && frame < at(C.start) + 4 ? 1 : 0}
          title={AI_COMPOSE.title}
          words={[...AI_COMPOSE.title].length + para.count + (linked ? [...linkTitle].length : 0)}
          links={linked ? 1 : 0}
          board={
            <ComposeBoard
              frame={frame}
              view={fit}
              frames={FRAMES}
              frameAppear={frameAppear}
              docs={docs}
              placeholder={1 - progress(frame, at(C.place) - 4, 12)}
              intent={{
                open: progress(frame, at(C.start) + 16, 10) * (1 - progress(frame, at(C.gather), 8, ease.in)),
                text: AI_COMPOSE.title,
                caret: true,
                press: frame >= at(C.gather) - 8 && frame < at(C.gather) ? 1 : 0,
              }}
              status={status}
              statusOpacity={progress(frame, at(C.gather) + 2, 8)}
              controls={progress(frame, at(C.done), 12)}
            />
          }
        >
          <p className="relative mb-[1.25em]">
            {para.text}
            {linked && (
              <span
                data-hit="inline-link"
                className={clsx(
                  "text-accent-text underline decoration-dotted decoration-[1.5px] underline-offset-[3px]",
                  linkHover ? "decoration-accent" : "decoration-[color:color-mix(in_srgb,var(--tau-accent)_38%,transparent)]"
                )}
              >
                {linkTitle}
              </span>
            )}
            {frame >= at(C.write) - 4 && caretOn(frame, !para.done) && <i className="bg-ink-1 ml-px inline-block h-[1.1em] w-[2px] translate-y-[0.18em]" />}
          </p>
        </ComposePage>
      )}
    </AppWindow>
  );
}

export function AiChapter() {
  const frame = useCurrentFrame();
  const A = P.ai;
  const H = A.assist;
  const I = A.insights;
  const C = A.compose;
  const ringFrame = at(P.life.end);

  // —— 镜头：闭环全景 → 慢慢推向中心窗口 → 各段推近动作处
  // 运镜至少 2 拍、停住至少 1 拍；停住期间只做极缓的推近
  const shots: Shot[] = [
    { at: at(A.start), ...LOOP_VIEW },
    { at: at(A.manifesto[1] - 1.25), x: 0, y: -20, zoom: 0.42, ease: ease.soft },
    { at: at(H.open - 0.15), ...ASSIST_VIEW, ease: ease.inOut },
    { at: at(I.start - 2), ...ASSIST_VIEW, zoom: ASSIST_VIEW.zoom * 1.05, ease: ease.soft },
    { at: at(I.start), ...INSIGHTS_VIEW, ease: ease.inOut },
    { at: at(I.connect + 0.5), ...INSIGHTS_VIEW, zoom: INSIGHTS_VIEW.zoom * 1.03, ease: ease.soft },
    // 创作模式的机位在点开关之前就位：开关在画内，窗口拉宽到 1760 后也正好装满画面
    { at: at(I.connect + 2.5), ...COMPOSE_VIEW, ease: ease.inOut },
    { at: at(A.end), ...AI_END_SHOT, ease: ease.soft },
  ];

  const beatLen = beatFrames(A.start);
  const moveTo = (to: { x: number; y: number }, n: number, lead = 0.9) => clickAt(to, at(n), lead * beatLen);
  const cursorPath: CursorStop[] = [
    { at: at(A.manifesto[1]), x: 980, y: 420 },
    ...moveTo(AI_TARGET.assistButton, H.open, 0.7),
    ...moveTo(AI_TARGET.send, H.send),
    ...moveTo(AI_TARGET.insightsButton, I.click),
    ...moveTo(AI_TARGET.linkMark, I.popover),
    ...moveTo(AI_TARGET.connect, I.connect),
    ...moveTo(AI_TARGET.composeToggle, C.start),
    ...moveTo(AI_TARGET.gather, C.gather, 0.75),
    ...moveTo(AI_TARGET.link, C.link),
    // 移向刚插入的内链，由知识地图段接着点
    { at: at(P.map.click) - 0.9 * beatLen, ...AI_TARGET.inlineLink },
  ];

  const windowIn = progress(frame, at(A.start) + 6, 24, ease.out);
  const spokes = progress(frame, at(A.start) + 16, at(A.manifesto[1]) - at(A.start) - 16, ease.inOut) * (1 - progress(frame, at(H.open), 20));
  const veil = manifestoVeil(frame, at(A.manifesto[0]), at(A.manifesto[1]));
  const ring = lifeWindows(ringFrame);
  const ringFade = 1 - progress(frame, at(H.open), 30);

  return (
    <>
      <AbsoluteFill style={{ filter: veil > 0.01 ? `blur(${VEIL_BLUR * veil}px)` : undefined }}>
        <World shots={shots}>
          {camera => (
            <>
              {ringFade > 0 && (
                <div style={{ opacity: ringFade }}>
                  <Thread drawn={1} camera={camera} />
                  {ring.map((win, i) => (
                    <Place key={i} x={SPOTS[i].x} y={SPOTS[i].y}>
                      {win}
                    </Place>
                  ))}
                  {STEPS.map((step, i) => (
                    <StepLabel key={step.name} index={i} name={step.name} x={SPOTS[i].x} y={SPOTS[i].y} opacity={Math.min(1, Math.max(0, (0.5 - camera.zoom) / 0.18))} />
                  ))}
                  <Spokes t={spokes} />
                </div>
              )}
              <Place
                x={0}
                y={0}
                style={{
                  opacity: windowIn,
                  transform: `translate(-50%, -50%) scale(${0.9 + 0.1 * windowIn})`,
                }}
              >
                <div className="relative">
                  {aiWindow(frame)}
                  <Cursor path={cursorPath} visibleFrom={at(A.manifesto[1])} />
                </div>
              </Place>
            </>
          )}
        </World>
      </AbsoluteFill>
      <ModuleTag module="小管家" feature="说一句话，它替你动手" at={at(H.open)} out={at(I.start)} />
      <ModuleTag module="洞见" feature="对照你的笔记，查漏补缺" at={at(I.start) + 4} out={at(C.start)} />
      <ModuleTag module="创作模式" feature="不从一张白纸开始" at={at(C.start) + 4} out={at(A.end)} />
      <ManifestoOverlay text={MANIFESTOS.ai.text} sub={MANIFESTOS.ai.sub} accent={MANIFESTOS.ai.accent} at={at(A.manifesto[0])} out={at(A.manifesto[1])} size={118} />
    </>
  );
}

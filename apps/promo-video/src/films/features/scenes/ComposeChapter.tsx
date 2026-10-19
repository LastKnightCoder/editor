/**
 * 「不必从一张白纸开始」：空白文章 → 点「创作模式」展开双栏 → 意图卡写下想写什么 → 召集胶囊三步 →
 * frame 与资料卡逐拍落位 → 写第一段时相关卡片亮起 → 点「连到此段」，正文插入链接、卡片标「已引用」。
 */
import { useCurrentFrame } from "remotion";
import { ease, mix, progress } from "../../../brand/motion";
import { Cursor } from "../../../kit/Cursor";
import { Place, World, type Shot } from "../../../kit/Camera";
import { caretOn, typed } from "../../../kit/typing";
import { AppWindow } from "../../../app-kit/AppWindow";
import { ComposePage, EDITOR_PANE_DEFAULT } from "../../../app-kit/pages/ComposePage";
import { CardCrumb } from "../../../app-kit/parts/Crumbs";
import { ComposeBoard, type BoardView, type DocState, type GatherStatus } from "../../../app-kit/parts/ComposeBoard";
import { COMPOSE, COMPOSE_BOUNDS, COMPOSE_DOCS, COMPOSE_FRAMES } from "../../../mock/compose";
import { beat, f, P } from "../timeline";

/** 双栏需要更宽的窗口，白板栏才放得下两组资料 */
const WIN = { width: 1760, height: 990 };
/** 窗口内各区（窗口左上角为原点）：侧栏 218 + 缝 4，内容区 px-4，标题栏 46 + pt-1，底部 pb-4 */
const INNER = { left: 238, top: 50, width: WIN.width - 238 - 16, height: WIN.height - 50 - 16 };
const BOARD = { left: INNER.left, width: INNER.width - EDITOR_PANE_DEFAULT - 12 };
const BOARD_CENTER = { x: BOARD.left + BOARD.width / 2, y: INNER.top + INNER.height / 2 };
/** 窗口坐标 → 世界坐标（窗口居中放在原点） */
const world = (x: number, y: number) => ({ x: x - WIN.width / 2, y: y - WIN.height / 2 });

const FIT_PADDING = 80;
const FIT: BoardView = {
  x: (COMPOSE_BOUNDS.minX + COMPOSE_BOUNDS.maxX) / 2,
  y: (COMPOSE_BOUNDS.minY + COMPOSE_BOUNDS.maxY) / 2,
  zoom: Math.min((BOARD.width - FIT_PADDING * 2) / (COMPOSE_BOUNDS.maxX - COMPOSE_BOUNDS.minX), (INNER.height - FIT_PADDING * 2) / (COMPOSE_BOUNDS.maxY - COMPOSE_BOUNDS.minY)),
};
const frameView = (i: number, zoom: number): BoardView => {
  const g = COMPOSE_FRAMES[i];
  return { x: g.x + g.width / 2, y: (g.y - 50 + g.y + g.height) / 2, zoom };
};

/** 板坐标 → 窗口坐标 */
const boardToWindow = (view: BoardView, bx: number, by: number) => ({
  x: BOARD_CENTER.x + (bx - view.x) * view.zoom,
  y: BOARD_CENTER.y + (by - view.y) * view.zoom,
});

const at = (n: number) => f(beat(n));

/** 板内视口关键帧：落位时贴近当前组，摆完后 fit 全部 */
function boardView(frame: number): BoardView {
  const C = P.compose;
  const keys: { at: number; view: BoardView }[] = [
    { at: at(C.place) - 6, view: frameView(0, 0.9) },
    { at: at(C.place + 3) + 10, view: frameView(0, 0.9) },
    { at: at(C.place + 4), view: frameView(1, 0.88) },
    { at: at(C.done), view: frameView(1, 0.88) },
    { at: at(C.done) + 40, view: FIT },
  ];
  if (frame <= keys[0].at) return keys[0].view;
  for (let i = 1; i < keys.length; i++) {
    if (frame > keys[i].at) continue;
    const t = ease.inOut((frame - keys[i - 1].at) / (keys[i].at - keys[i - 1].at));
    const a = keys[i - 1].view;
    const b = keys[i].view;
    return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), zoom: Math.exp(mix(Math.log(a.zoom), Math.log(b.zoom), t)) };
  }
  return keys[keys.length - 1].view;
}

/** 窗口坐标里的关键位置（按类名推算的版面，静帧核对过） */
const SPOT = {
  toggle: { x: 878, y: 144 },
  gatherButton: { x: 843, y: 622 },
  editorBody: { x: 1140, y: 200 },
};

export function ComposeChapter() {
  const frame = useCurrentFrame();
  const C = P.compose;

  const split = progress(frame, at(C.toggle) + 4, 28, ease.inOut);
  const intentOpen = progress(frame, at(C.intent), 16) * (1 - progress(frame, at(C.gather) + 6, 12, ease.in));
  const intentText = typed(COMPOSE.intentTyped, frame, at(C.typing) + 4, 2);
  const placeholder = 1 - progress(frame, at(C.place) - 4, 16);

  // 召集胶囊：三步进行中 → 完成
  const phaseIndex = C.phases.filter(n => frame >= at(n)).length - 1;
  const phaseTexts = ["读你的写作意图…", `在 ${COMPOSE.notes} 份内容里粗筛出 ${COMPOSE.candidates} 份`, "挑出值得放上来的，分好组…"];
  const done = frame >= at(C.done);
  const status: GatherStatus | undefined = done ? { kind: "done", count: COMPOSE_DOCS.length } : phaseIndex >= 0 ? { kind: "running", text: phaseTexts[phaseIndex] } : undefined;
  const statusOpacity = progress(frame, at(C.gather) + 8, 10);

  // 落位顺序：frame A、A 的卡片、frame B、B 的卡片，每拍一个
  const order: { frame?: number; doc?: string }[] = COMPOSE_FRAMES.flatMap((g, i) => [{ frame: i }, ...g.items.map(d => ({ doc: d.id }))]);
  const landAt = (k: number) => at(C.place + k);
  const frameAppear = COMPOSE_FRAMES.map((_, i) => progress(frame, landAt(order.findIndex(o => o.frame === i)), 16));

  const glow = progress(frame, at(C.glow), 12) * (1 - progress(frame, at(C.link) + 2, 10));
  const press = frame >= at(C.link) && frame < at(C.link) + 12 ? 1 : 0;
  const cited = progress(frame, at(C.link) + 6, 14, ease.out);
  const docs: Record<string, DocState> = Object.fromEntries(
    COMPOSE_DOCS.map(d => {
      const k = order.findIndex(o => o.doc === d.id);
      const state: DocState = { appear: progress(frame, landAt(k), 18, ease.out) };
      if (d.id === COMPOSE.glowId) Object.assign(state, { glow, press, cited });
      return [d.id, state];
    })
  );

  // 正文：点进正文后逐字写第一段，「连到此段」后段尾插入链接
  const writeAt = at(C.write) + 10;
  const para = typed(COMPOSE.paragraph, frame, writeAt, 2);
  const linked = frame >= at(C.link) + 4;
  const linkIn = progress(frame, at(C.link) + 4, 14);
  const linkTitle = COMPOSE_DOCS.find(d => d.id === COMPOSE.glowId)!.heading!;
  const words = [...COMPOSE.title].length + para.count + (linked ? [...linkTitle].length : 0);
  const bodyCaret = frame >= writeAt - 4 && caretOn(frame, !para.done);

  const view = boardView(frame);
  const glowCard = COMPOSE_DOCS.find(d => d.id === COMPOSE.glowId)!;
  const linkButton = boardToWindow(view, glowCard.x + glowCard.width - 42, glowCard.y + glowCard.height - 17);

  const B = world(BOARD_CENTER.x, BOARD_CENTER.y);
  const shots: Shot[] = [
    { at: at(C.start), x: 0, y: 0, zoom: 1 },
    { at: at(C.toggle), x: -30, y: -40, zoom: 1.08, ease: ease.soft },
    { at: at(C.intent) + 6, x: -30, y: -20, zoom: 1.06 },
    { at: at(C.typing), x: B.x, y: B.y, zoom: 1.66 },
    { at: at(C.gather), x: B.x, y: B.y + 6, zoom: 1.74, ease: ease.soft },
    { at: at(C.gather) + 22, x: B.x, y: -330, zoom: 2.3 },
    { at: at(C.place) - 8, x: B.x, y: -320, zoom: 2.4, ease: ease.soft },
    { at: at(C.place) + 10, x: B.x + 40, y: B.y, zoom: 1.3 },
    { at: at(C.done), x: B.x + 60, y: B.y, zoom: 1.32, ease: ease.soft },
    { at: at(C.write), x: 0, y: 0, zoom: 1 },
    { at: at(C.write) + 50, x: 360, y: -120, zoom: 1.75 },
    { at: at(C.link), x: 345, y: -110, zoom: 1.8, ease: ease.soft },
    { at: at(C.link) + 30, x: 345, y: -110, zoom: 1.8 },
    { at: at(C.end), x: 0, y: 0, zoom: 1 },
  ];

  return (
    <World shots={shots}>
      {() => (
        <Place x={0} y={0}>
          <div style={{ position: "relative", width: WIN.width, height: WIN.height }}>
            <AppWindow active="articles" size={WIN} crumb={<CardCrumb section="文章" title={COMPOSE.title} />}>
              <ComposePage
                innerWidth={INNER.width}
                split={split}
                title={COMPOSE.title}
                words={words}
                links={linked ? 1 : 0}
                togglePressed={progress(frame, at(C.toggle) - 14, 10) * (1 - split)}
                board={
                  <ComposeBoard
                    frame={frame}
                    view={view}
                    frames={COMPOSE_FRAMES}
                    frameAppear={frameAppear}
                    docs={docs}
                    placeholder={placeholder}
                    intent={{ open: intentOpen, text: COMPOSE.title + intentText.text, caret: caretOn(frame, !intentText.done), press: frame >= at(C.gather) && frame < at(C.gather) + 10 ? 1 : 0 }}
                    status={status}
                    statusOpacity={statusOpacity}
                    controls={progress(frame, at(C.done), 14)}
                  />
                }
              >
                <p className="relative mb-[1.25em]">
                  {para.text}
                  {linked && (
                    <span
                      className="text-accent-text underline decoration-[color:color-mix(in_srgb,var(--tau-accent)_38%,transparent)] decoration-dotted decoration-[1.5px] underline-offset-[3px]"
                      style={{ opacity: linkIn }}
                    >
                      {linkTitle}
                    </span>
                  )}
                  {bodyCaret && <i className="bg-ink-1 ml-px inline-block h-[1.1em] w-[2px] translate-y-[0.18em]" />}
                </p>
              </ComposePage>
            </AppWindow>

            <Cursor
              visibleFrom={at(C.start)}
              visibleTo={at(C.gather) + 24}
              path={[
                { at: at(C.start), x: 1180, y: 520 },
                { at: at(C.toggle), ...SPOT.toggle, click: true },
                { at: at(C.typing), x: 900, y: 420 },
                { at: at(C.gather), ...SPOT.gatherButton, click: true },
              ]}
            />
            <Cursor
              visibleFrom={at(C.done) + 12}
              visibleTo={at(C.write) + 10}
              path={[
                { at: at(C.done) + 12, x: 1320, y: 520 },
                { at: at(C.write), ...SPOT.editorBody, click: true },
              ]}
            />
            <Cursor
              visibleFrom={at(C.glow) + 20}
              visibleTo={at(C.link) + 40}
              path={[
                { at: at(C.glow) + 20, x: 1260, y: 420 },
                { at: at(C.link), x: linkButton.x, y: linkButton.y, click: true },
              ]}
            />
          </div>
        </Place>
      )}
    </World>
  );
}

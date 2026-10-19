/**
 * 白板 → 数据库（曲内第 22.75–30 小节）：接住写作段对白板块的推进——块里的画布已是窗口纸面大小，卡片外框淡出、窗口在画布周围出现；
 * 窗口虚化浮出「把想法摊开，再收拢。」→ 逐拍画出形状与箭头 → 长出思维导图 → 换两套配色 → 一键手绘 →
 * 点「演示」全屏逐帧演示 → 镜头飞到书单数据库，虚化浮出「一份数据，四种看法。」→ 每两拍切一个视图。
 */
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ease, mix, progress } from "../../../brand/motion";
import { VIDEO } from "../../../brand/tokens";
import { ManifestoOverlay, manifestoVeil, VEIL_BLUR } from "../../../kit/Manifesto";
import { Place, World, type Shot } from "../../../kit/Camera";
import { AppWindow } from "../../../app-kit/AppWindow";
import { DatabasePage, type DatabaseView } from "../../../app-kit/pages/DatabasePage";
import { PresentationScreen, WhiteboardPage, type BoardTool } from "../../../app-kit/pages/WhiteboardPage";
import { BoardCanvas, type BoardReveal, type BoardView } from "../../../app-kit/whiteboard/BoardCanvas";
import { BOARD_FIT, BOARD_PAPER, LiveBoardBlock } from "../../../app-kit/whiteboard/LiveBoardBlock";
import { BOARD_SLIDES, MIND_NODES, type BoardRect } from "../../../mock/board";
import { MANIFESTOS } from "../copy";
import { at, P } from "../timeline";
import { BlockPaper, BOARD_CARD, BOARD_CARD_SCALE, PUSH_OUT } from "./WriteChapter";

const PAPER = BOARD_PAPER;
const WIN = { width: 1440, height: 900 };
/** 数据库窗口在世界里的位置：白板窗口右侧，镜头飞过去 */
const DB_X = 1900;

/** 板坐标 → 世界坐标（白板窗口中心在原点，板内视口为 BOARD_FIT） */
function boardToWorld(bx: number, by: number) {
  const px = PAPER.width / 2 + (bx - BOARD_FIT.x) * BOARD_FIT.zoom;
  const py = PAPER.height / 2 + (by - BOARD_FIT.y) * BOARD_FIT.zoom;
  return { x: PAPER.left + px - WIN.width / 2, y: PAPER.top + py - WIN.height / 2 };
}

/** 演示：全屏后视口用 500ms cubic ease-out 适配到这一帧，四周留 50px */
function fitSlide(rect: BoardRect): BoardView {
  const zoom = Math.min((VIDEO.width - 100) / rect.width, (VIDEO.height - 100) / rect.height);
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, zoom };
}
const cubicOut = (t: number) => 1 - (1 - t) ** 3;
const mixView = (a: BoardView, b: BoardView, t: number): BoardView => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), zoom: Math.exp(mix(Math.log(a.zoom), Math.log(b.zoom), t)) });

/** 白板块卡片在世界里的位置：块里的画布与窗口纸面重合 */
const CARD = {
  left: PAPER.left - WIN.width / 2 - BOARD_CARD.canvasLeft * BOARD_CARD_SCALE,
  top: PAPER.top - WIN.height / 2 - BOARD_CARD.canvasTop * BOARD_CARD_SCALE,
};
const CARD_CENTER = { x: CARD.left + (BOARD_CARD.width / 2) * BOARD_CARD_SCALE, y: CARD.top + (BOARD_CARD.height / 2) * BOARD_CARD_SCALE };
/** 接住推进后停在的镜头缩放 */
const SETTLE_ZOOM = 1.12;
/** 进入演示时窗口的镜头缩放 */
const PRESENT_FROM_ZOOM = 1.2;

export function BoardChapter() {
  const frame = useCurrentFrame();
  const B = P.board;

  // 交接：先在卡片外围淡入窗口，再淡出卡片外框（两边画布逐像素一致，看不出替换），最后出工具栏
  const windowIn = progress(frame, at(B.start), 12, ease.out);
  const cardOut = progress(frame, at(B.start) + 10, 16, ease.inOut);
  const chromeIn = progress(frame, at(B.start) + 20, 14, ease.out);

  const reveal: BoardReveal = {
    // 「通知」「任务切换」一开始就在，现场画「注意力残留」
    shapes: [1, 1, progress(frame, at(B.shapes[0]), 16, ease.inOut)],
    arrows: progress(frame, at(B.arrows), 12, ease.out),
    link: progress(frame, at(B.mind) - 4, 10, ease.out),
    mind: MIND_NODES.map(node => {
      if (node.level === 1) return progress(frame, at(B.mind) + 4, 14);
      if (node.level === 2) return progress(frame, at(B.branches[node.branch]), 14);
      const leafIndex = MIND_NODES.filter(n => n.level === 3).indexOf(node);
      return progress(frame, at(B.leaves) + leafIndex * 4, 14);
    }),
    ref: progress(frame, at(B.leaves) + 22, 12, ease.out),
  };
  const palette = frame >= at(B.palettes[1]) ? "autumn" : frame >= at(B.palettes[0]) ? "ocean" : "classic";
  const sketch = frame >= at(B.sketch);
  const look = { sketch, palette };

  // 工具栏高亮底块：选择 → 形状 → 箭头 → 导图 → 选择
  const toolKeys: { at: number; tool: BoardTool }[] = [
    { at: 0, tool: "select" },
    { at: at(B.shapes[0]) - 8, tool: "shape" },
    { at: at(B.arrows) - 8, tool: "arrow" },
    { at: at(B.mind) - 8, tool: "mind" },
    { at: at(B.leaves) + 30, tool: "select" },
  ];
  const toolIndex = toolKeys.findLastIndex(k => frame >= k.at);
  const tool = toolKeys[toolIndex].tool;
  const toolFrom = toolKeys[Math.max(0, toolIndex - 1)].tool;
  const toolMix = toolIndex === 0 ? 1 : progress(frame, toolKeys[toolIndex].at, 11, ease.out);

  const sketchPressed = frame >= at(B.sketch) - 8 && frame < at(B.sketch) + 6 ? 1 : 0;
  const presentPressed = frame >= at(B.slides[0]) - 8 && frame < at(B.slides[0]) ? 1 : 0;

  // 演示：全屏层淡入 → 适配第 1 帧 → 第 2 帧 → 退出
  const presentIn = progress(frame, at(B.slides[0]), 8);
  const presentOut = progress(frame, at(B.fly), 10);
  const presenting = presentIn > 0 && presentOut < 1;

  // 全屏的起点：与进入演示前窗口里看到的一致（镜头 1.2 倍对准板中心），再适配到第 1 帧
  const fullStart: BoardView = { ...BOARD_FIT, zoom: BOARD_FIT.zoom * PRESENT_FROM_ZOOM };
  const slide1 = fitSlide(BOARD_SLIDES[0]);
  const slide2 = fitSlide(BOARD_SLIDES[1]);
  const presentView =
    frame < at(B.slides[1]) ? mixView(fullStart, slide1, cubicOut(progress(frame, at(B.slides[0]), 30, t => t))) : mixView(slide1, slide2, cubicOut(progress(frame, at(B.slides[1]), 30, t => t)));

  // 数据库：每两拍切一个视图
  const views: DatabaseView[] = ["table", "kanban", "gallery", "calendar"];
  const viewIndex = Math.max(0, B.views.filter(n => frame >= at(n)).length - 1);
  const view = views[viewIndex];

  const focus = (bx: number, by: number, zoom: number, atFrame: number, easing = ease.inOut): Shot => ({ at: atFrame, ...boardToWorld(bx, by), zoom, ease: easing });
  const frameCenter = { x: 250, y: 380 };
  const mindCenter = { x: 720, y: 380 };
  const allCenter = { x: BOARD_FIT.x, y: BOARD_FIT.y };
  const dbTop = { x: DB_X + 111, y: -150 };
  const dbAll = { x: DB_X + 111, y: 17 };
  const shots: Shot[] = [
    // 接住写作段的推进：起点即卡片中心、镜头 1 倍
    { at: at(B.start), ...CARD_CENTER, zoom: 1 },
    focus(allCenter.x, allCenter.y, SETTLE_ZOOM, at(B.start) + 36, PUSH_OUT),
    focus(allCenter.x, allCenter.y, SETTLE_ZOOM, at(B.manifesto[1]) - 10),
    focus(frameCenter.x, frameCenter.y, 1.5, at(B.shapes[0]) + 6),
    focus(frameCenter.x, frameCenter.y + 10, 1.55, at(B.arrows) + 10, ease.soft),
    focus(mindCenter.x, mindCenter.y, 1.45, at(B.branches[0])),
    focus(mindCenter.x + 60, mindCenter.y, 1.4, at(B.leaves) + 20, ease.soft),
    focus(allCenter.x, allCenter.y, 1.16, at(B.palettes[0]) + 4),
    focus(allCenter.x, allCenter.y, PRESENT_FROM_ZOOM, at(B.slides[0]), ease.soft),
    focus(allCenter.x, allCenter.y, PRESENT_FROM_ZOOM, at(B.fly)),
    { at: at(B.views[0]) - 6, ...dbTop, zoom: 1.3, ease: ease.inOut, dip: 0.35 },
    { at: at(B.views[2]) - 4, ...dbTop, zoom: 1.32, ease: ease.soft },
    { at: at(B.views[3]) + 4, ...dbAll, zoom: 1.12, ease: ease.inOut },
    { at: at(B.end), ...dbAll, zoom: 1.14, ease: ease.soft },
  ];

  const boardManifesto = { at: at(B.manifesto[0]), out: at(B.manifesto[1]) };
  const dbManifesto = { at: at(B.dbManifesto[0]) + 6, out: at(B.dbManifesto[1]) + 8 };
  const veil = Math.max(manifestoVeil(frame, boardManifesto.at, boardManifesto.out), manifestoVeil(frame, dbManifesto.at, dbManifesto.out));
  const zoomText = `${Math.round(BOARD_FIT.zoom * 100)}%`;

  return (
    <>
      <AbsoluteFill style={{ filter: veil > 0.01 ? `blur(${VEIL_BLUR * veil}px)` : undefined }}>
        <World shots={shots}>
          {() => (
            <>
              <Place x={0} y={0} style={{ opacity: windowIn }}>
                <AppWindow active="whiteboard" crumb={<span className="text-tau-meta text-ink-1 font-medium">专注力手册</span>}>
                  <WhiteboardPage
                    canvas={<BoardCanvas view={BOARD_FIT} width={PAPER.width} height={PAPER.height} reveal={reveal} look={look} />}
                    tool={tool}
                    toolFrom={toolFrom}
                    toolMix={toolMix}
                    sketch={sketch}
                    sketchPressed={sketchPressed}
                    presentPressed={presentPressed}
                    zoomText={zoomText}
                    chrome={chromeIn}
                  />
                </AppWindow>
              </Place>
              {cardOut < 1 && (
                <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `translate(${CARD.left}px, ${CARD.top}px) scale(${BOARD_CARD_SCALE})`, opacity: 1 - cardOut }}>
                  <BlockPaper name="WHITEBOARD" width={680}>
                    <LiveBoardBlock />
                  </BlockPaper>
                </div>
              )}
              <Place x={DB_X} y={0}>
                <AppWindow active="databases" crumb={<span className="text-tau-meta text-ink-2 px-1.5 py-0.5">书单</span>}>
                  <DatabasePage view={view} />
                </AppWindow>
              </Place>
            </>
          )}
        </World>
        {presenting && (
          <AbsoluteFill style={{ opacity: presentIn * (1 - presentOut) }}>
            <PresentationScreen
              canvas={<BoardCanvas view={presentView} width={VIDEO.width} height={VIDEO.height} reveal={reveal} look={look} />}
              index={frame >= at(B.slides[1]) ? 2 : 1}
              total={2}
              hint={progress(frame, at(B.slides[0]) + 4, 8) * (1 - progress(frame, at(B.slides[1]) + 10, 20))}
            />
          </AbsoluteFill>
        )}
      </AbsoluteFill>
      <ManifestoOverlay text={MANIFESTOS.board.text} sub={MANIFESTOS.board.sub} accent={MANIFESTOS.board.accent} at={boardManifesto.at} out={boardManifesto.out} size={118} />
      <ManifestoOverlay text={MANIFESTOS.database.text} sub={MANIFESTOS.database.sub} accent={MANIFESTOS.database.accent} at={dbManifesto.at} out={dbManifesto.out} size={118} />
    </>
  );
}

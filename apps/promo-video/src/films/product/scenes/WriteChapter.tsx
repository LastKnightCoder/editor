/**
 * 写作（曲内第 15–22 小节）：开场俯冲进 Deep Work 文章窗口后不切镜头——窗口虚化，浮出「所见，即所得。」；
 * 字退场时正文已滚到文末，逐拍敲出新的一节，每块敲完记号当场成型；接着敲 / 弹出斜杠菜单，
 * 各种块化成卡片飞到窗口四周的画布上，最后一张是白板，镜头一路推进，块里的画布放大到白板窗口纸面大小，由白板段接住。
 */
import type { ReactNode } from "react";
import { Easing, useCurrentFrame } from "remotion";
import { ease, progress } from "../../../brand/motion";
import { fonts } from "../../../brand/tokens";
import { ManifestoOverlay, manifestoVeil, VEIL_BLUR } from "../../../kit/Manifesto";
import { Place, World, type Shot } from "../../../kit/Camera";
import { AppWindow } from "../../../app-kit/AppWindow";
import { useAppTheme } from "../../../app-kit/theme";
import { ArticleEditorPage } from "../../../app-kit/pages/ArticleEditorPage";
import { CardCrumb } from "../../../app-kit/parts/Crumbs";
import { bodyLength, PACE, schedule, type Timed } from "../../../app-kit/doc/script";
import { SlashMenu } from "../../../app-kit/doc/SlashMenu";
import { CalloutBlock, CodeShowcase, DatabaseBlock, MathShowcase, MermaidBlock, TableBlock, TaskListBlock } from "../../../app-kit/doc/Blocks";
import { BOARD_PAPER, LIVE_BLOCK, LiveBoardBlock } from "../../../app-kit/whiteboard/LiveBoardBlock";
import { ARTICLE, BLOCK_CONTENT } from "../../../mock/deepwork";
import { MANIFESTOS } from "../copy";
import { bar, beat, f, P } from "../timeline";

const EXISTING = schedule(ARTICLE.blocks, -100000);
const EXISTING_WORDS = [...ARTICLE.title].length + ARTICLE.blocks.reduce((n, b) => n + bodyLength(b), 0);

/** Deep Work 文章窗口：开场立起的窗口与写作段是同一个，保证俯冲衔接时画面不跳 */
export function ArticleWindow({ timed = EXISTING, frame = 0, scroll = 0, words = EXISTING_WORDS, tail }: { timed?: Timed[]; frame?: number; scroll?: number; words?: number; tail?: ReactNode }) {
  return (
    <AppWindow active="articles" crumb={<CardCrumb section="文章" title={ARTICLE.title} />}>
      <ArticleEditorPage title={ARTICLE.title} titleCount={99} timed={timed} frame={frame} scroll={scroll} words={words} links={ARTICLE.links} tail={tail} />
    </AppWindow>
  );
}

/** 开场俯冲结束时窗口在画面里的位置，换算成世界镜头（窗口中心在原点） */
export const DIVE_END: Shot = { at: 0, x: 0, y: -251, zoom: 1.406 };

/** 敲字时镜头的水平中心：新一节的文字左缘在 x≈-249、最长一行止于 x≈34，取二者中点让内容居中 */
const TYPE_X = -110;
/** 正文滚到文末的距离 */
const SCROLL_END = 380;
/** 新一节各行在世界坐标里的纵向中心（滚动后，按已知机位的静帧实测）：标题、段落、引用、列表各项、斜杠命令 */
const LINE_Y = { heading: -240, paragraph: -188, quote: -141, bullets: [-95, -60, -25], slash: 20 };
/** 斜杠菜单弹出后，镜头对准命令行与菜单的中间 */
const MENU_Y = 180;

type BlockCard = { name: string; x: number; y: number; width?: number; render: () => ReactNode };

/**
 * 飞出的块卡片：每拍一张先飞到画面正中放大停住，下一拍缩回窗口四周的位置（世界坐标，窗口 1440×900 居中于原点）。
 * 最后一张白板停在正中，镜头推进去接下一段。
 */
const BLOCK_CARDS: BlockCard[] = [
  { name: "TABLE", x: -1340, y: -640, render: () => <TableBlock rows={BLOCK_CONTENT.table} /> },
  { name: "CODE", x: -1340, y: -20, render: () => <CodeShowcase /> },
  { name: "MATH", x: -1340, y: 600, render: () => <MathShowcase tex={String.raw`\int_0^{\infty} e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}`} /> },
  { name: "CALLOUT", x: -420, y: -850, render: () => <CalloutBlock type="tip" text="意志力会耗尽，环境不会。" /> },
  { name: "TASKS", x: 420, y: -850, render: () => <TaskListBlock items={BLOCK_CONTENT.tasks} /> },
  { name: "MERMAID", x: 1340, y: -640, render: () => <MermaidBlock /> },
  { name: "DATABASE", x: 1340, y: 80, width: 680, render: () => <DatabaseBlock rows={BLOCK_CONTENT.books} /> },
  { name: "WHITEBOARD", x: 0, y: -20, width: 680, render: () => <LiveBoardBlock /> },
];
/** 正中停住时的世界缩放（镜头 0.48 倍时约等于画面 1.2 倍）与落位后的缩放 */
const HERO = { x: 0, y: -20, scale: 2.5 };
const SLOT_SCALE = 0.72;
/** 卡片飞出的起点：斜杠菜单的大致位置（世界坐标） */
const MENU_ORIGIN = { x: -60, y: 160 };
/** 卡片阶段的远景镜头 */
const WIDE = { x: 0, y: -20, zoom: 0.48 };

/** 白板块的画布放大到白板窗口纸面大小时，卡片在世界里的缩放（白板段以镜头 1 倍接手） */
export const BOARD_CARD_SCALE = BOARD_PAPER.width / LIVE_BLOCK.width;
/** 白板块卡片的版面（卡片单位）：BlockPaper 的 px-14 / pt-16 / pb-14，块外框 1px */
export const BOARD_CARD = { width: 680 + 112, height: 64 + LIVE_BLOCK.height + 2 + 56, canvasLeft: 56 + 1, canvasTop: 64 + 1 };
/**
 * 推进白板块的两段缓动：写作段末端斜率 2、白板段起始斜率 5，配合两段的时长与缩放跨度，
 * 交接处对数缩放的速度相等（推进不顿挫）。
 */
export const PUSH_IN = Easing.bezier(0.5, 0, 0.8, 0.6);
export const PUSH_OUT = Easing.bezier(0.08, 0.4, 0.3, 1);

/** 卡片位置：起点 → 正中（arrive 0→1）→ 落位（settle 0→1） */
function cardPose(card: BlockCard, arrive: number, settle: number) {
  const hx = MENU_ORIGIN.x + (HERO.x - MENU_ORIGIN.x) * arrive;
  const hy = MENU_ORIGIN.y + (HERO.y - MENU_ORIGIN.y) * arrive;
  const heroScale = HERO.scale * (0.25 + 0.75 * arrive);
  return {
    x: hx + (card.x - hx) * settle,
    y: hy + (card.y - hy) * settle,
    scale: heroScale + (SLOT_SCALE - heroScale) * settle,
  };
}

/** leave：推进白板块时其余卡片向外散开并淡出，免得在交接时突然消失 */
function BlockCardView({ card, arrive, settle, leave, z }: { card: BlockCard; arrive: number; settle: number; leave: number; z: number }) {
  const pose = cardPose(card, arrive, settle);
  const spread = 1 + 0.35 * leave;
  return (
    <Place x={HERO.x + (pose.x - HERO.x) * spread} y={HERO.y + (pose.y - HERO.y) * spread} style={{ opacity: Math.min(1, arrive * 2.5) * (1 - leave), zIndex: z }}>
      <div style={{ transform: `scale(${pose.scale})` }}>
        <BlockPaper name={card.name} width={card.width ?? 760}>
          {card.render()}
        </BlockPaper>
      </div>
    </Place>
  );
}

/** 块陈列纸：同功能片 BlockStage 的纸面，左上角是块名 */
export function BlockPaper({ name, width, children }: { name: string; width: number; children: ReactNode }) {
  const appTheme = useAppTheme();
  return (
    <div
      data-theme={appTheme}
      data-mode="light"
      className="bg-surface shadow-paper rounded-tau-lg font-tau text-ink-1 relative px-14 pt-16 pb-14 text-[16px] leading-[1.65]"
      style={{ width: width + 112 }}
    >
      <span className="text-ink-3 absolute top-6 left-14 text-[12px] tracking-[0.2em]" style={{ fontFamily: fonts.label }}>
        {name}
      </span>
      {children}
    </div>
  );
}

export function WriteChapter() {
  const frame = useCurrentFrame();
  const W = P.write;
  const M = MANIFESTOS.write;
  const manifestoAt = f(W.manifesto[0]);
  const manifestoOut = f(W.manifesto[1]);
  const veil = manifestoVeil(frame, manifestoAt, manifestoOut);

  const starts = W.typed.map(n => f(bar(n)));
  const typed = schedule(ARTICLE.typed, 0, starts);
  const timed = [...EXISTING, ...typed];
  const words = EXISTING_WORDS + typed.reduce((n, item) => n + (frame >= item.end ? bodyLength(item.block) : 0), 0);
  // 宣言期间（画面虚化时）把正文滚到文末
  const scroll = SCROLL_END * progress(frame, manifestoAt + 10, manifestoOut - manifestoAt - 20, ease.inOut);

  const slashAt = f(beat(W.slash));
  const menuOpen = progress(frame, slashAt + 6, 8, ease.out);
  const flyStarts = BLOCK_CARDS.map((_, i) => f(beat(W.cards + i)));
  const menuGone = progress(frame, flyStarts[flyStarts.length - 1], 12);
  const tail =
    frame >= slashAt ? (
      <p className="relative mb-[1.25em]" style={{ opacity: 1 - menuGone }}>
        <span>/</span>
        <i className="bg-ink-1 ml-px inline-block h-[1.1em] w-[2px] translate-y-[0.18em]" />
        {menuOpen > 0 && (
          <span className="font-tau absolute top-[calc(100%+6px)] left-[10px] z-10">
            <SlashMenu active={9} scroll={84} open={menuOpen} />
          </span>
        )}
      </p>
    ) : null;

  // 列表各项起敲的时刻，同 LiveDoc 的排期
  const bulletItem = typed[3];
  const bulletStarts: number[] = [];
  if (bulletItem.block.kind === "bullets") {
    let at = bulletItem.bodyAt;
    for (const text of bulletItem.block.items) {
      bulletStarts.push(at);
      at += [...text].length * PACE.char + 6;
    }
  }
  const TYPE_ZOOM = 1.75;
  const follow = (at: number, y: number): Shot => ({ at, x: TYPE_X, y, zoom: TYPE_ZOOM, ease: ease.inOut });
  const shots: Shot[] = [
    { ...DIVE_END, at: f(W.start) },
    // 接住俯冲的速度继续推进再减速，避免交接处急刹
    { at: f(W.start) + 30, x: 30, y: -200, zoom: 2.3, ease: ease.out },
    // 镜头始终让正在写的那一行停在画面正中
    follow(manifestoOut - 6, LINE_Y.heading),
    follow(typed[0].end + 6, LINE_Y.heading),
    follow(typed[1].start + 10, LINE_Y.paragraph),
    follow(typed[1].end + 6, LINE_Y.paragraph),
    follow(typed[2].start + 10, LINE_Y.quote),
    follow(typed[2].end + 6, LINE_Y.quote),
    ...bulletStarts.map((at, i) => follow(at + 6, LINE_Y.bullets[i])),
    follow(slashAt, LINE_Y.slash),
    { at: slashAt + 20, x: TYPE_X, y: MENU_Y, zoom: 1.5, ease: ease.inOut },
    { at: flyStarts[0] + 14, ...WIDE, ease: ease.inOut },
    { at: flyStarts[flyStarts.length - 1] + 12, ...WIDE },
    // 推进白板块：结束时块里的画布正好是白板窗口纸面的大小
    { at: f(W.end), x: HERO.x, y: HERO.y, zoom: BOARD_CARD_SCALE / HERO.scale, ease: PUSH_IN },
  ];

  return (
    <>
      <div className="absolute inset-0" style={{ filter: veil > 0.01 ? `blur(${VEIL_BLUR * veil}px)` : undefined }}>
        <World shots={shots}>
          {() => (
            <>
              <Place x={0} y={0}>
                <ArticleWindow timed={timed} frame={frame} scroll={scroll} words={words} tail={tail} />
              </Place>
              {BLOCK_CARDS.map((card, i) => {
                const arrive = progress(frame, flyStarts[i], 12, ease.out);
                const last = i === BLOCK_CARDS.length - 1;
                const settle = last ? 0 : progress(frame, flyStarts[i + 1], 18, ease.inOut);
                const leave = last ? 0 : progress(frame, f(W.end) - 34, 30, ease.in);
                return arrive > 0 ? <BlockCardView key={card.name} card={card} arrive={arrive} settle={settle} leave={leave} z={10 + i} /> : null;
              })}
            </>
          )}
        </World>
      </div>
      <ManifestoOverlay text={M.text} sub={M.sub} accent={M.accent} at={manifestoAt} out={manifestoOut} size={118} />
    </>
  );
}

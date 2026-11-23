/**
 * 功能片外壳：舞台 + 宽窗口 + 回放叠层。教程片的做法（固定机位、按键回放、字幕、键帽、光标）加上产品片的镜头语言
 * （章节卡期间窗口虚化、镜头在虚化里换机位、不硬切不交叉淡化）。
 * 每一章的画面由影片自己的场景给（场景读回放时间轴决定此刻的状态）；外壳负责镜头、光标、章节卡、字幕、键帽、片头片尾和声音。
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AbsoluteFill, Audio, getStaticFiles, staticFile, useCurrentFrame } from "remotion";
import { ease, progress } from "../../../brand/motion";
import { TRACKS } from "../../../brand/music";
import { FEATURE_WINDOW } from "../../../mock/videonote";
import { Ending } from "../../../kit/Ending";
import { ManifestoOverlay, manifestoVeil, VEIL_BLUR } from "../../../kit/Manifesto";
import { MusicBed } from "../../../kit/MusicBed";
import { CaptionBar, KeyCaps } from "../../../kit/Overlays";
import { StageFill, StageProvider } from "../../../kit/Stage";
import { Cursor, type CursorStop } from "../../../kit/Cursor";
import { cameraAt, project, World, type Shot } from "../../../kit/Camera";
import { STAGES } from "../../../brand/stage";
import { AppThemeProvider } from "../../../app-kit/theme";
import { isTyping, mark, pressing, typedText, under, type Replay } from "./run.ts";
import { chapterAt, INTRO, type Card, type Chapter, type ChapterTiming, type Timeline, type View } from "./timeline.ts";

export type Hit = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };

/** 场景拿到的工具：帧号、回放时间轴和几个取状态的函数 */
export type SceneTools = {
  frame: number;
  replay: Replay;
  /** 此刻画面里各 data-hit 元素的位置（窗口坐标） */
  hits: Record<string, Hit>;
  hit: (name: string) => Hit | null;
  pressing: (hit: string) => boolean;
  /** 某个输入框已打出的字 */
  text: (input: string) => string;
  /** 某个输入框此刻是否在打字 */
  typing: (input: string) => boolean;
  /** 此刻光标停在哪个 data-hit 上（菜单项的高亮跟着它走） */
  under: () => string | undefined;
  /** 状态时刻的帧号 */
  mark: (name: string) => number;
  /** 侧栏里正被点按的条目 */
  pressedNav: string | undefined;
};

/** 一章的画面：渲染窗口（AppWindow）和窗口里的浮层 */
export type Scene = (tools: SceneTools) => ReactNode;

export type Film = {
  /** 片头的整屏宣言 */
  intro: Card;
  ending: { line: string; url: string };
  chapters: Chapter[];
  scenes: Record<string, Scene>;
  /** 键帽停在哪（窗口坐标）；缺省在画面右下角 */
  keysAt?: (chapter: ChapterTiming, tools: SceneTools) => Point | null;
  /** 音效轨（public/ 下的路径）；文件不在时静音 */
  sfx?: string;
};

const STAGE = STAGES.studio;
const { width: W, height: H } = FEATURE_WINDOW;
const FULL_VIEW: View = { x: W / 2, y: H / 2, zoom: 1 };
/** 键帽的缺省位置（画面坐标）：画面右下角、字幕条上方。不跟着窗口走：特写机位里窗口的右下角常在画外 */
const KEYS_HOME: Point = { x: 1920 - 380, y: 1080 - 210 };

/**
 * 元素相对 ancestor 的排版位置：沿 offsetParent 链累加，再减去所有祖先滚过的像素（不受 transform 影响）。
 * 滚动容器常常没有定位、不在 offsetParent 链上，所以滚动要沿 parentElement 链逐个减。
 */
function offsetIn(el: HTMLElement, ancestor: HTMLElement) {
  let left = 0;
  let top = 0;
  for (let node: HTMLElement | null = el; node && node !== ancestor; node = node.offsetParent as HTMLElement | null) {
    left += node.offsetLeft;
    top += node.offsetTop;
  }
  for (let node = el.parentElement; node && node !== ancestor; node = node.parentElement) {
    left -= node.scrollLeft;
    top -= node.scrollTop;
  }
  return { left, top };
}

/** 测量结果都是排版整数，相等才算没变：每帧都 setState 会无限重渲（教程片交接文档的坑） */
function sameHits(a: Record<string, Hit>, b: Record<string, Hit>) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every(key => {
    const p = a[key];
    const q = b[key];
    return p && q && p.x === q.x && p.y === q.y && p.w === q.w && p.h === q.h;
  });
}

/** 镜头关键帧：上一章的机位停到本章章节卡开始，卡片退场时正好落在本章的机位上；章节自带 shots 时用它 */
function shotsOf(timeline: Timeline): Shot[] {
  const shots: Shot[] = [];
  let current: View = FULL_VIEW;
  for (const timing of timeline.chapters) {
    const { chapter, card, swap } = timing;
    if (chapter.shots) {
      // 章节自己的第一帧机位从这一章接手时才生效：有章节卡就在卡片虚化里走过去，没有就要求与上一章收尾的机位相同
      const [first, ...rest] = chapter.shots(timing);
      if (card) shots.push({ at: card.at, ...current }, { at: card.out, x: first.x, y: first.y, zoom: first.zoom, ease: ease.inOut });
      else shots.push({ at: swap, x: first.x, y: first.y, zoom: first.zoom });
      shots.push(...rest.map(key => ({ ...key, ease: ease.inOut })));
      const last = shots[shots.length - 1];
      current = { x: last.x, y: last.y, zoom: last.zoom };
      continue;
    }
    const view = chapter.view ?? FULL_VIEW;
    if (!shots.length) {
      shots.push({ at: 0, ...view });
      current = view;
      continue;
    }
    if (view === current) continue;
    const move = card ? card.out : swap + 50;
    const hold = card ? card.at : swap - 10;
    shots.push({ at: hold, ...current }, { at: move, ...view, ease: ease.inOut });
    current = view;
  }
  return shots.length ? shots : [{ at: 0, ...FULL_VIEW }];
}

/**
 * 光标路径 = 回放里的每一站（点按、悬停、划选的起终点）：光标在每一站到位，点按的那一站到了就按。
 * 两站之间由 Cursor 自己控制在到点前 26 帧内动身——所以界面的变化（高亮、二级菜单、按钮按下）都跟着光标走。
 */
function cursorPath(replay: Replay, hits: Record<string, Hit>) {
  const path: CursorStop[] = [];
  let last: Point = { x: W / 2, y: H / 2 };
  for (const stop of replay.stops) {
    const hit = hits[stop.hit];
    const to: Point = hit ? { x: hit.x, y: hit.y } : last;
    // 第一次出现：从第一站的右下方进场
    if (!path.length) path.push({ at: stop.at - 18, x: to.x + 70, y: to.y + 46 });
    path.push(stop.click ? { at: stop.at, ...to, click: true } : { at: stop.at, ...to });
    last = to;
  }
  return path;
}

/**
 * 圈出重点：刚发生变化的地方套一圈强调色描边，四周压一层淡雾，让眼睛落到这里。
 * 坐标是窗口坐标（画在窗口层里，跟着镜头一起缩放）；圈比元素大一圈，进出各 14 帧。
 */
function Spotlight({ spots, hits, frame }: { spots: Replay["spots"]; hits: Record<string, Hit>; frame: number }) {
  return (
    <>
      {spots.map(spot => {
        const hit = hits[spot.hit];
        const t = Math.min(progress(frame, spot.from, 14, ease.out), 1 - progress(frame, spot.to - 14, 14, ease.in));
        if (!hit || t <= 0) return null;
        const pad = 10;
        const left = hit.x - hit.w / 2 - pad;
        const top = hit.y - hit.h / 2 - pad;
        const grow = 1 + (1 - t) * 0.06;
        return (
          <div key={`${spot.hit}-${spot.from}`} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 900, overflow: "hidden", borderRadius: 14 }}>
            <div
              style={{
                position: "absolute",
                left,
                top,
                width: hit.w + pad * 2,
                height: hit.h + pad * 2,
                borderRadius: 14,
                transform: `scale(${grow})`,
                opacity: t,
                boxShadow: `0 0 0 3px rgba(61, 116, 184, 0.95), 0 0 0 9px rgba(61, 116, 184, 0.18), 0 0 0 4000px rgba(236, 241, 247, ${0.5 * t})`,
              }}
            />
          </div>
        );
      })}
    </>
  );
}

/** 点按的位置：按下的那一刻在这里荡开一圈强调色的涟漪，比光标自带的那圈更显眼（特写里也看得清点了哪） */
function ClickRings({ clicks, hits, frame }: { clicks: Replay["clicks"]; hits: Record<string, Hit>; frame: number }) {
  return (
    <>
      {clicks.map(click => {
        const hit = hits[click.hit];
        if (!hit || frame < click.at || frame >= click.at + 30) return null;
        const t = progress(frame, click.at, 30, ease.out);
        const size = 18 + 56 * t;
        return (
          <div
            key={`${click.hit}-${click.at}`}
            style={{
              position: "absolute",
              left: hit.x - size / 2,
              top: hit.y - size / 2,
              width: size,
              height: size,
              borderRadius: "50%",
              background: `rgba(61, 116, 184, ${0.22 * (1 - t)})`,
              border: `3px solid rgba(61, 116, 184, ${0.8 * (1 - t)})`,
              pointerEvents: "none",
              zIndex: 950,
            }}
          />
        );
      })}
    </>
  );
}

export function FeatureFrame({ film, timeline, music }: { film: Film; timeline: Timeline; music?: ReactNode }) {
  const frame = useCurrentFrame();
  const current = chapterAt(timeline, frame);
  const { index, chapter, replay } = current;
  const next = timeline.chapters[index + 1];
  const Scene = film.scenes[chapter.id];
  const rootRef = useRef<HTMLDivElement>(null);
  const [hits, setHits] = useState<Record<string, Hit>>({});
  const known = useRef<Record<string, Hit>>({});

  // 每帧按真实排版量各 data-hit 元素的中心（窗口坐标）。用 offsetTop / offsetLeft（整数像素、不受 transform 影响），
  // 并行渲染的各个标签页量到的一样；量到过的位置留着，元素暂时不在画面里时光标停在原地
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const nextHits: Record<string, Hit> = {};
    root.querySelectorAll<HTMLElement>("[data-hit]").forEach(el => {
      const at = offsetIn(el, root);
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      nextHits[el.dataset.hit!] = { x: at.left + w / 2, y: at.top + h / 2, w, h };
    });
    if (!sameHits(hits, nextHits)) {
      known.current = { ...known.current, ...nextHits };
      setHits(nextHits);
    }
  });

  const tools: SceneTools = {
    frame,
    replay,
    hits,
    hit: name => hits[name] ?? known.current[name] ?? null,
    pressing: hit => pressing(replay, hit, frame),
    text: input => typedText(replay, input, frame),
    typing: input => isTyping(replay, input, frame),
    under: () => under(replay, frame),
    mark: name => mark(replay, name),
    pressedNav: replay.clicks.find(click => click.hit.startsWith("nav:") && pressing(replay, click.hit, frame))?.hit.slice(4),
  };

  // —— 镜头与章节卡
  const shots = shotsOf(timeline);
  const camera = cameraAt(frame, shots);
  const veil = Math.max(manifestoVeil(frame, INTRO.at, INTRO.out), ...timeline.chapters.map(c => (c.card ? manifestoVeil(frame, c.card.at, c.card.out) : 0)));
  // 片头：窗口从舞台底里浮上来，宣言随即叠上去
  const rise = progress(frame, 0, 50, ease.out);
  const ending = timeline.ending;
  const until = next?.card?.at ?? ending.at;
  const path = cursorPath(replay, known.current);
  const keySpot = film.keysAt?.(current, tools);
  const keys = keySpot ? project(camera, keySpot.x, keySpot.y) : KEYS_HOME;
  const hasSfx = !!film.sfx && getStaticFiles().some(file => file.name === film.sfx);

  return (
    <StageProvider stage={STAGE}>
      <AppThemeProvider theme={STAGE.appTheme}>
        <AbsoluteFill>
          <StageFill />
          {frame < ending.at + 30 && (
            <AbsoluteFill style={{ filter: veil > 0.01 ? `blur(${VEIL_BLUR * veil}px)` : undefined, opacity: rise, transform: `translateY(${(1 - rise) * 40}px)` }}>
              <World shots={shots}>
                <div ref={rootRef} className="relative" style={{ width: W, height: H }}>
                  {Scene ? Scene(tools) : null}
                  <Spotlight spots={replay.spots} hits={known.current} frame={frame} />
                  <ClickRings clicks={replay.clicks} hits={known.current} frame={frame} />
                  {path.length > 0 && (
                    <div style={{ position: "absolute", inset: 0, zIndex: 1000, pointerEvents: "none" }}>
                      <Cursor path={path} visibleFrom={path[0].at - 22} visibleTo={path[path.length - 1].at + 30} />
                    </div>
                  )}
                </div>
              </World>
            </AbsoluteFill>
          )}
          {timeline.chapters.map(
            ({ chapter, card }) =>
              chapter.card && card && <ManifestoOverlay key={chapter.id} text={chapter.card.text} sub={chapter.card.sub} accent={chapter.card.accent} at={card.at} out={card.out} size={112} />
          )}
          <KeyCaps keys={replay.keys} frame={frame} x={keys.x} y={keys.y} />
          <CaptionBar captions={replay.captions} frame={frame} until={until} />
          <Ending frame={frame} at={ending.at} out={ending.out} line={film.ending.line} url={film.ending.url} />
          <ManifestoOverlay text={film.intro.text} sub={film.intro.sub} accent={film.intro.accent} at={INTRO.at} out={INTRO.out} size={128} />
          {hasSfx && film.sfx && <Audio src={staticFile(film.sfx)} />}
          {music ?? <MusicBed track={TRACKS.chillax} frames={timeline.end} />}
        </AbsoluteFill>
      </AppThemeProvider>
    </StageProvider>
  );
}

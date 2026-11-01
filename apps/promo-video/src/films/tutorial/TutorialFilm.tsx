/**
 * 教程片「所见即所得 · 快捷语法」：整屏片头 → 各章在同一个文章窗口里演（章节卡期间窗口虚化、换成新文章）→ 速查表 → 片尾。
 * 固定机位：窗口放大 ZOOM 倍，正文版心停在画面左中；正在写的那一行停在 TARGET_Y（正文像编辑器的打字机模式那样滚动），
 * 斜杠菜单打开时镜头再往上让出菜单的位置；右侧是本章的速查条，光标下方（或菜单右侧）是键帽，底部是字幕，点按时出鼠标光标。
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { AbsoluteFill, Audio, getStaticFiles, Sequence, staticFile, useCurrentFrame } from "remotion";
import { ease, mix, progress } from "../../brand/motion";
import { STAGES } from "../../brand/stage";
import { fonts } from "../../brand/tokens";
import { TRACKS } from "../../brand/music";
import { ManifestoOverlay, ManifestoText, manifestoVeil, VEIL_BLUR } from "../../kit/Manifesto";
import { StageFill, StageProvider, useStage } from "../../kit/Stage";
import { Soundtrack } from "../../kit/Soundtrack";
import { Cursor } from "../../kit/Cursor";
import { Wordmark } from "../../kit/Wordmark";
import { AppWindow, WINDOW } from "../../app-kit/AppWindow";
import { AppThemeProvider } from "../../app-kit/theme";
import { ArticleEditorPage } from "../../app-kit/pages/ArticleEditorPage";
import { CardCrumb } from "../../app-kit/parts/Crumbs";
import type { Doc } from "./model";
import { anchorChanges, snapshotAt, type ChapterRun } from "./run";
import { CHEAT_SHEET, ENDING as ENDING_COPY, INTRO as INTRO_COPY } from "./script";
import { chapterAt, FPS, INTRO, TIMELINE, typingWeight } from "./timeline";
import { TutorialDoc } from "./TutorialDoc";
import { CaptionBar, CheatSheet, CheatStrip, KeyCaps } from "./Overlays";

const STAGE = STAGES.studio;
const ZOOM = 1.45;
/** 正文版心中心在画面上的 x、窗口顶边、正在写的那一行的画面 y */
const COLUMN_X = 830;
const WIN_TOP = 10;
const TARGET_Y = 470;
/** 斜杠菜单打开时光标行再上移多少（画面 px），给菜单让位置 */
const PANEL_LIFT = 150;
/** 代码块一行的高度（16px × 0.8em × 1.8 行高），代码里换行时镜头按它推算上一行 */
const CODE_LINE = 16 * 0.8 * 1.8;
const SFX_FILE = "sfx/tutorial-syntax.mp3";
/** 配乐音量：打字演示时退后，让键盘声和成型提示音在前；章节卡、片头片尾回到正常 */
const MUSIC_VOLUME = { typing: 0.5, open: 0.85 };
/** 配乐接第二遍：第一遍在曲尾淡出前接上，第二遍的曲尾对齐片尾 */
const MUSIC_JOIN = { before: 12, crossfade: 4 };

type Point = { x: number; y: number };
/** 坐标都是窗口坐标（未缩放），y 相对正文顶端（与滚动无关） */
type Measure = {
  docTop0: number;
  docCenterX: number;
  caretY: number | null;
  belowY: number;
  ends: Record<number, number>;
  anchors: Record<string, number>;
  hits: Record<string, Point>;
  panel: { right: number; top: number } | null;
};
/** 首帧测量之前的估计值（之后由布局测量替换） */
const GUESS: Measure = { docTop0: 182, docCenterX: 847, caretY: 13, belowY: 26, ends: {}, anchors: {}, hits: {}, panel: null };

/** 元素相对 ancestor 的排版位置：沿 offsetParent 链累加（不受 transform、滚动影响） */
function offsetIn(el: HTMLElement, ancestor: HTMLElement) {
  let left = 0;
  let top = 0;
  for (let node: HTMLElement | null = el; node && node !== ancestor; node = node.offsetParent as HTMLElement | null) {
    left += node.offsetLeft;
    top += node.offsetTop;
  }
  return { left, top };
}

/** 测量值都是排版整数，相等才算没变（留一点浮点余量） */
function sameMeasure(a: Measure, b: Measure) {
  const close = (x: number | null | undefined, y: number | null | undefined) => (x == null || y == null ? x == y : Math.abs(x - y) < 0.01);
  const sameMap = (p: Record<string, number>, q: Record<string, number>) => {
    const keys = new Set([...Object.keys(p), ...Object.keys(q)]);
    return [...keys].every(k => p[k] !== undefined && q[k] !== undefined && close(p[k], q[k]));
  };
  const hitKeys = new Set([...Object.keys(a.hits), ...Object.keys(b.hits)]);
  return (
    close(a.docTop0, b.docTop0) &&
    close(a.docCenterX, b.docCenterX) &&
    close(a.caretY, b.caretY) &&
    close(a.belowY, b.belowY) &&
    sameMap(a.ends, b.ends) &&
    sameMap(a.anchors, b.anchors) &&
    [...hitKeys].every(k => a.hits[k] && b.hits[k] && close(a.hits[k].x, b.hits[k].x) && close(a.hits[k].y, b.hits[k].y)) &&
    close(a.panel?.right, b.panel?.right) &&
    close(a.panel?.top, b.panel?.top)
  );
}

const textLength = (leaves: { kind: string; text?: string }[]) => leaves.reduce((m, l) => m + (l.kind === "text" ? [...(l.text ?? "")].length : 1), 0);
const words = (doc: Doc) =>
  doc.blocks.reduce((n, b) => {
    if (b.kind === "paragraph" || b.kind === "heading") return n + textLength(b.leaves);
    if (b.kind === "box") return n + b.children.reduce((m, p) => m + textLength(p.leaves), [...b.title].length);
    if (b.kind === "tabs") return n + b.panes.flat().reduce((m, p) => m + textLength(p.leaves), 0);
    return n;
  }, 0);

/** 某一「行」在正文里的 y：容器里的段落 / 表格行 / 嵌入块各有 data-anchor；代码行按行高推算；否则取块末尾 */
function anchorY(anchor: string, m: Measure, current: { anchor: string; y: number }) {
  if (m.anchors[anchor] !== undefined) return m.anchors[anchor];
  const [block, line] = anchor.split(":");
  const [curBlock, curLine] = current.anchor.split(":");
  if (block === curBlock && /^\d+$/.test(line) && /^\d+$/.test(curLine)) return current.y - (Number(curLine) - Number(line)) * CODE_LINE;
  return m.ends[Number(block)] ?? current.y;
}

/** 光标行在正文里的 y：换行后 16 帧内从上一行缓到这一行 */
function followY(changes: { at: number; anchor: string }[], frame: number, m: Measure) {
  const i = Math.max(
    0,
    changes.findLastIndex(c => c.at <= frame)
  );
  const anchor = changes[i]?.anchor ?? "0:0";
  const y = m.caretY ?? m.anchors[anchor] ?? m.ends[Number(anchor.split(":")[0])] ?? 0;
  if (i <= 0) return y;
  const prev = anchorY(changes[i - 1].anchor, m, { anchor, y });
  return mix(prev, y, progress(frame, changes[i].at, 16, ease.inOut));
}

/** 斜杠菜单打开的时段：[打开, 关闭) */
function panelSpans(run: ChapterRun) {
  const spans: { at: number; out: number }[] = [];
  for (const s of run.snapshots) {
    const last = spans[spans.length - 1];
    if (s.doc.panel && (!last || last.out !== Infinity)) spans.push({ at: s.at, out: Infinity });
    else if (!s.doc.panel && last?.out === Infinity) last.out = s.at;
  }
  return spans.map(s => ({ at: s.at, out: s.out === Infinity ? run.end : s.out }));
}

function TutorialWindow({ frame }: { frame: number }) {
  const { chapter, run } = chapterAt(frame);
  const snapshot = snapshotAt(run, frame);
  const changes = useMemo(() => anchorChanges(run), [run]);
  const panels = useMemo(() => panelSpans(run), [run]);
  const rootRef = useRef<HTMLDivElement>(null);
  const [m, setM] = useState<Measure>(GUESS);

  const lift = Math.max(0, ...panels.map(p => progress(frame, p.at, 16, ease.inOut) * (1 - progress(frame, p.out, 16, ease.inOut)))) * PANEL_LIFT;
  const caretLine = followY(changes, frame, m);
  const scroll = Math.max(0, m.docTop0 + caretLine - (TARGET_Y - lift - WIN_TOP) / ZOOM);
  const left = COLUMN_X - m.docCenterX * ZOOM;

  // 每帧按真实排版量光标、各行、可点元素与斜杠菜单。用 offsetTop / offsetLeft（整数像素、不受 transform 影响）：
  // 成型的缩放回弹、详情块的展开动画、正文滚动都不改变量出来的值，并行渲染的各个标签页量到的永远一样，
  // 用 getBoundingClientRect 时各标签页留着差零点几像素的旧值，键帽和正文会逐帧来回抖
  useLayoutEffect(() => {
    const root = rootRef.current;
    const doc = root?.querySelector<HTMLElement>("[data-doc-root]");
    if (!root || !doc) return;
    const docAt = offsetIn(doc, root);
    const box = (el: Element) => {
      const at = offsetIn(el as HTMLElement, root);
      const { offsetWidth: w = 0, offsetHeight: h = 0 } = el as HTMLElement;
      return { left: at.left, top: at.top - docAt.top, width: w, height: h };
    };
    const middle = (el: Element) => {
      const b = box(el);
      return b.top + b.height / 2;
    };
    const caret = doc.querySelector("[data-caret]");
    const lastBlock = doc.lastElementChild;
    const ends: Record<number, number> = {};
    doc.querySelectorAll<HTMLElement>("[data-block-end]").forEach(el => (ends[Number(el.dataset.blockEnd)] = middle(el)));
    const anchors: Record<string, number> = {};
    doc.querySelectorAll<HTMLElement>("[data-anchor]").forEach(el => (anchors[el.dataset.anchor ?? ""] = middle(el)));
    const hits: Record<string, Point> = {};
    doc.querySelectorAll<HTMLElement>("[data-hit]").forEach(el => {
      const b = box(el);
      hits[el.dataset.hit ?? ""] = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    });
    const panelBoxes = [...doc.querySelectorAll("[data-slash-panel]")].map(box);
    const panel = panelBoxes.length ? { right: Math.max(...panelBoxes.map(b => b.left + b.width)), top: Math.min(...panelBoxes.map(b => b.top)) } : null;
    const next: Measure = {
      docTop0: docAt.top,
      docCenterX: docAt.left + doc.offsetWidth / 2,
      caretY: caret ? middle(caret) : null,
      belowY: lastBlock ? box(lastBlock).top + (lastBlock as HTMLElement).offsetHeight : m.belowY,
      ends,
      anchors,
      hits,
      panel,
    };
    if (!sameMeasure(next, m)) setM(next);
  });

  const toScreenY = (docY: number) => WIN_TOP + (m.docTop0 - scroll + docY) * ZOOM;
  const toScreenX = (winX: number) => left + winX * ZOOM;
  const next = TIMELINE.chapters[TIMELINE.chapters.findIndex(c => c.run === run) + 1];
  const until = next?.swap ?? TIMELINE.cheat.at;
  const keyPos = m.panel ? { x: toScreenX(m.panel.right) + 28, y: toScreenY(m.panel.top) } : { x: COLUMN_X - 360 * ZOOM, y: toScreenY(m.belowY) + 22 };
  return (
    <>
      <div ref={rootRef} className="absolute" style={{ left, top: WIN_TOP, width: WINDOW.width, height: WINDOW.height, transform: `scale(${ZOOM})`, transformOrigin: "0 0" }}>
        <AppWindow active="articles" crumb={<CardCrumb section="文章" title={chapter.title} />}>
          <ArticleEditorPage
            title={chapter.title}
            titleCount={99}
            timed={[]}
            frame={frame}
            scroll={scroll}
            words={[...chapter.title].length + words(snapshot.doc)}
            links={0}
            tail={<TutorialDoc doc={snapshot.doc} frame={frame} typingAt={snapshot.at} />}
          />
        </AppWindow>
      </div>
      {run.clicks.map(c => {
        const hit = m.hits[c.hit];
        if (!hit || frame < c.at - 50 || frame > c.at + 40) return null;
        const to = { x: toScreenX(hit.x), y: toScreenY(hit.y) };
        return (
          <Cursor
            key={c.at}
            visibleFrom={c.at - 36}
            visibleTo={c.at + 20}
            path={[
              { at: c.at - 34, x: to.x + 70, y: to.y + 46 },
              { at: c.at - 4, ...to },
              { at: c.at, ...to, click: true },
            ]}
          />
        );
      })}
      <KeyCaps keys={run.keys} frame={frame} x={keyPos.x} y={keyPos.y} />
      <CheatStrip chips={run.chips} frame={frame} x={COLUMN_X + 360 * ZOOM + 46} top={170} until={until} />
      <CaptionBar captions={run.captions} frame={frame} until={until} />
    </>
  );
}

/** 片尾：字标 + 一句话 + 网址，依次浮现 */
function Ending({ frame, at, out }: { frame: number; at: number; out: number }) {
  const stage = useStage();
  if (frame < at) return null;
  const fill = progress(frame, at, 30, ease.inOut);
  const item = (delay: number) => {
    const t = progress(frame, at + 30 + delay, 26, ease.out) * (1 - progress(frame, out - 30, 30, ease.in));
    return { opacity: t, transform: `translateY(${(1 - t) * 14}px)` };
  };
  return (
    <AbsoluteFill style={{ opacity: fill, zIndex: 70 }}>
      <StageFill />
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30 }}>
        <div style={item(0)}>
          <Wordmark size={96} />
        </div>
        <div style={{ ...item(14), fontFamily: fonts.caption, fontSize: 34, letterSpacing: "0.2em", color: stage.ink2 }}>{ENDING_COPY.line}</div>
        <div style={{ ...item(28), fontFamily: fonts.label, fontSize: 30, letterSpacing: "0.06em", color: stage.brand[0] }}>{ENDING_COPY.url}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** 配乐：曲子不够长时接第二遍，两遍之间交叉淡化，第二遍的曲尾对齐片尾 */
function Music() {
  const track = TRACKS.chillax;
  const gain = (offset: number) => (f: number) => mix(MUSIC_VOLUME.open, MUSIC_VOLUME.typing, typingWeight(f + offset));
  const film = TIMELINE.end / FPS;
  const first = (track.duration ?? Infinity) - track.offset - MUSIC_JOIN.before;
  if (film <= first) return <Soundtrack track={track} volume={1} fadeIn={1.5} fadeOut={3} gain={gain(0)} />;
  const joinAt = Math.round(first * FPS);
  const secondFrom = joinAt - MUSIC_JOIN.crossfade * FPS;
  const secondStart = (track.duration ?? 0) - (TIMELINE.end - secondFrom) / FPS;
  return (
    <>
      <Sequence durationInFrames={joinAt} layout="none">
        <Soundtrack track={track} volume={1} fadeIn={1.5} fadeOut={MUSIC_JOIN.crossfade} gain={gain(0)} />
      </Sequence>
      <Sequence from={secondFrom} layout="none">
        <Soundtrack track={track} startAt={secondStart} volume={1} fadeIn={MUSIC_JOIN.crossfade} fadeOut={3} gain={gain(secondFrom)} />
      </Sequence>
    </>
  );
}

export function TutorialFilm() {
  const frame = useCurrentFrame();
  const { cheat, ending } = TIMELINE;
  const veil = Math.max(0, manifestoVeil(frame, cheat.at, cheat.out + 60), ...TIMELINE.chapters.map(c => (c.card ? manifestoVeil(frame, c.card.at, c.card.out) : 0)));
  // 标题先退场，再淡掉整屏底色露出窗口，免得字叠在窗口上
  const introFill = 1 - progress(frame, INTRO.fade, INTRO.end - INTRO.fade, ease.inOut);
  const rise = progress(frame, INTRO.windowIn, INTRO.end - INTRO.windowIn + 20, ease.out);
  const files = getStaticFiles().map(file => file.name);
  return (
    <StageProvider stage={STAGE}>
      <AppThemeProvider theme={STAGE.appTheme}>
        <AbsoluteFill>
          <StageFill />
          {frame < ending.at + 30 && (
            <AbsoluteFill style={{ filter: veil > 0.01 ? `blur(${VEIL_BLUR * veil}px)` : undefined, transform: `translateY(${(1 - rise) * 40}px)` }}>
              <TutorialWindow frame={frame} />
            </AbsoluteFill>
          )}
          {TIMELINE.chapters.map(
            ({ chapter, card }) =>
              card && chapter.card && <ManifestoOverlay key={chapter.id} text={chapter.card.text} sub={chapter.card.sub} accent={chapter.card.accent} at={card.at} out={card.out} size={112} />
          )}
          <CheatSheet sheet={CHEAT_SHEET} frame={frame} at={cheat.at} out={cheat.out} />
          <Ending frame={frame} at={ending.at} out={ending.out} />
          {introFill > 0 && (
            <AbsoluteFill style={{ opacity: introFill }}>
              <StageFill />
              <ManifestoText text={INTRO_COPY.text} sub={INTRO_COPY.sub} accent={INTRO_COPY.accent} at={INTRO.title + 8} out={INTRO.fade + 2} size={128} />
            </AbsoluteFill>
          )}
          {files.includes(SFX_FILE) && <Audio src={staticFile(SFX_FILE)} />}
          <Music />
        </AbsoluteFill>
      </AppThemeProvider>
    </StageProvider>
  );
}

/**
 * 功能片「视频笔记」：片头（边看边记的成品）→ 视频从哪来 → 本机转录出字幕 → 摘录 / 时间戳 / 截帧 → 点回那一刻 → 问 AI → 整门课写成一本书 → 片尾。
 * 脚本与文案在同目录的 script.ts；这里只管每一章的画面：读回放时间轴决定此刻界面的状态。
 * 界面的状态全部按真实软件的行为来（见 docs/交接-功能片.md §3）：普通插件装好即用、添加视频后自动打开并缓存、文档树放不下两栏时自动收起。
 * 播放位置贯穿全片：每章从上一章停下的地方接着播（同一套算式从上一章的回放里重算），画面、字幕、进度条不跳。
 */
import type { ReactNode } from "react";
import { ease, mix, progress } from "../../../brand/motion";
import { AppWindow } from "../../../app-kit/AppWindow";
import type { NavKey } from "../../../app-kit/navigation";
import { FinderWindow } from "../../../app-kit/pages/FinderWindow";
import { PluginsPage, type InstallState } from "../../../app-kit/pages/PluginsPage";
import { ProjectCrumb, ProjectTreePage } from "../../../app-kit/pages/ProjectTreePage";
import { VideoNotePage, type NoteBlock, type VideoNoteState } from "../../../app-kit/pages/VideoNotePage";
import { ConfirmCard } from "../../../app-kit/parts/Dialog";
import { EbookExportDialog } from "../../../app-kit/parts/EbookExportDialog";
import { LectureFrame } from "../../../app-kit/parts/LectureSlide";
import type { ChatTurn } from "../../../app-kit/parts/VideoNoteChat";
import { OnlineVideoDialog } from "../../../app-kit/parts/OnlineVideoDialog";
import { Toast } from "../../../app-kit/parts/Toast";
import { WindowLayer } from "../../../app-kit/parts/WindowLayer";
import { CATALOG, CHAT, type ChatExchange, EBOOK, FEATURE_WINDOW, INSTALL_NOTICE, LECTURE, NOTE, QUOTE_TEXT, slideAt, slideStart, TREE, TREE_BEFORE, VIDEO_PLUGINS } from "../../../mock/videonote";
import { FeatureFrame, type Scene, type SceneTools } from "../shared/FeatureFrame";
import { mark, NEVER, PACE, ramp, span } from "../shared/run.ts";
import { FPS, layout, type Timeline } from "../shared/timeline.ts";
import { CHAPTERS, ENDING, INTRO, TRANSCRIBE_STEPS } from "./script.ts";

const TIMELINE: Timeline = layout(CHAPTERS);
const replayOf = (id: string) => TIMELINE.chapters.find(chapter => chapter.chapter.id === id)!.replay;

/** 清晰度选项：取自插件的清晰度名称与提示（需登录 / 大会员） */
const BILIBILI_VARIANTS = ["360P 流畅", "480P 清晰", "720P 高清", "1080P 高清 · 需登录", "1080P+ 高码率 · 大会员"];

// —— 播放位置。片里的视频按 SPEED 倍速往前走（字幕才来得及在几秒里滚过去）；暂停、跳转处断开重算

/** 一段播放：从 from 帧起、在 start 秒处开始，每秒走 speed 秒，到 until 帧停住 */
type Play = { from: number; start: number; speed: number; until?: number };
const timeIn = (play: Play, frame: number) => play.start + ((Math.min(frame, play.until ?? NEVER) - play.from) / FPS) * play.speed;
/** 一串首尾相接的播放段里，frame 时刻的位置与所在的段 */
function playAt(plays: Play[], frame: number) {
  const play = plays.findLast(item => item.from <= frame) ?? plays[0];
  return { play, time: timeIn(play, frame) };
}

/** time 这一刻是第几句（落在两句的空隙里时算上一句） */
const currentAt = (time: number) =>
  Math.max(
    0,
    LECTURE.segments.findLastIndex(segment => segment.start / 1000 <= time)
  );
/** 当前句换成这一句的帧号：字幕滚动从这一帧开始缓动 */
function changedAt(play: Play, current: number) {
  const start = LECTURE.segments[current].start / 1000;
  return start <= play.start ? NEVER : play.from + ((start - play.start) / play.speed) * FPS;
}

/** 某一句挪到字幕视口正中的滚动量。量到的位置已经减过滚动，所以按这句在内容里的位置算，不随当前滚动变 */
function rowScroll(index: number, hit: SceneTools["hit"]) {
  const row = hit(`segment:${index}`);
  const content = hit("transcript-content");
  const viewport = hit("transcript-viewport");
  return row && content && viewport ? row.y - (content.y - content.h / 2) - viewport.h / 2 : null;
}

/** 字幕跟随播放滚动：当前句挪到视口正中；换句后的 18 帧里从上一句的位置缓过去 */
function followScroll(current: number, frame: number, changeAt: number, hit: SceneTools["hit"]) {
  const place = (index: number) => rowScroll(index, hit);
  const target = place(current);
  if (target === null) return 0;
  const previous = current > 0 ? place(current - 1) : null;
  if (previous === null || changeAt >= NEVER) return target;
  return mix(previous, target, progress(frame, changeAt, 18, ease.inOut));
}

/** 播放器、字幕、进度条这一组跟着播放位置走的状态 */
function playback(plays: Play[], frame: number, hit: SceneTools["hit"]) {
  const { play, time } = playAt(plays, frame);
  const current = currentAt(time);
  return {
    time,
    current,
    slide: slideAt(time),
    slideElapsed: time - slideStart(time),
    playing: frame < (play.until ?? NEVER),
    scroll: followScroll(current, frame, changedAt(play, current), hit),
  };
}

function Window({ tools, active, crumb, overlay, children }: { tools: SceneTools; active: NavKey; crumb?: ReactNode; overlay?: ReactNode; children: ReactNode }) {
  return (
    <>
      <AppWindow active={active} crumb={crumb} size={FEATURE_WINDOW} pressedNav={tools.pressedNav}>
        {children}
      </AppWindow>
      {overlay ? <WindowLayer>{overlay}</WindowLayer> : null}
    </>
  );
}

function mainNote(partial: Partial<VideoNoteState>): VideoNoteState {
  return {
    title: LECTURE.title,
    source: VIDEO_PLUGINS.bilibili.name,
    transcript: "已转录",
    duration: LECTURE.duration,
    time: 0,
    playing: false,
    slide: "focused",
    chapters: LECTURE.chapters,
    segments: LECTURE.segments,
    count: LECTURE.count,
    current: 0,
    notes: { kind: "empty" },
    ...partial,
  };
}

/** 视频笔记开着的那一幕：文档树收起，条目区是视频笔记 */
function NoteShell({ tools, state, overlay }: { tools: SceneTools; state: VideoNoteState; overlay?: ReactNode }) {
  return (
    <Window tools={tools} active="projects" crumb={<ProjectCrumb project={LECTURE.project} />} overlay={overlay}>
      <ProjectTreePage project={LECTURE.project} items={TREE} activeId="v2" tree={0}>
        <VideoNotePage state={state} />
      </ProjectTreePage>
    </Window>
  );
}

/** 划选：按下 → 拖到句尾（底色从左铺开）→ 工具条出现 → 点了某个按钮后收起 */
function selectionOf(tools: SceneTools, index: number, until: number, button: "quote" | "ask") {
  const { frame, mark, pressing } = tools;
  const select = mark("select");
  if (frame < select || frame >= until + 6) return undefined;
  return { index, progress: ramp(frame, select, select + PACE.drag), toolbar: span(frame, select + PACE.drag + 6, until + 6), pressed: pressing(`toolbar:${button}`) ? button : undefined };
}

// —— 全片的播放位置：记笔记那章从 02:46 起播，后面各章接着它往下走；片头是这门课记完以后的样子（先给成品）

/** 记笔记那章：2.6 倍速；写完时间戳后快进到示意图那页（FAST），截帧后常速 */
const NOTE_REPLAY = replayOf("note");
const NOTE_T0 = 2 * 60 + 46;
const NOTE_SPEED = 2.6;
const FAST_SPEED = 9;
const NOTE_PLAYS: Play[] = (() => {
  const base: Play = { from: NOTE_REPLAY.start, start: NOTE_T0, speed: NOTE_SPEED };
  const fastFrom = mark(NOTE_REPLAY, "fast");
  const fast: Play = { from: fastFrom, start: timeIn(base, fastFrom), speed: FAST_SPEED };
  const shotAt = mark(NOTE_REPLAY, "shot");
  return [base, fast, { from: shotAt, start: timeIn(fast, shotAt), speed: 1 }];
})();
/** 添加的视频缓存好以后开始播，一直播过转录那章，在记笔记那章开始时正好到 NOTE_T0 */
const READY_FROM = mark(replayOf("add"), "cached") + 18;
const READY_PLAY: Play = { from: READY_FROM, start: NOTE_T0 - ((NOTE_REPLAY.start - READY_FROM) / FPS) * NOTE_SPEED, speed: NOTE_SPEED };
const QUOTE_TIME = LECTURE.segments[LECTURE.quote].start / 1000;
const STAMP_TIME = playAt(NOTE_PLAYS, mark(NOTE_REPLAY, "stamp")).time;
const SHOT_TIME = playAt(NOTE_PLAYS, mark(NOTE_REPLAY, "shot")).time;

const quoteBlock = (appear: number): NoteBlock => ({
  kind: "quote",
  parts: [
    { kind: "timestamp", time: QUOTE_TIME, appear: 1 },
    { kind: "text", text: ` ${QUOTE_TEXT}` },
  ],
  typed: 99,
  appear,
});
const QUOTE_MARKER = { time: QUOTE_TIME, kind: "quote" as const, appear: 1, text: QUOTE_TEXT, note: "笔记 1" };
const STAMP_MARKER = { time: STAMP_TIME, kind: "timestamp" as const, appear: 1, text: NOTE.typed, note: "笔记 1" };
const SHOT_MARKER = { time: SHOT_TIME, kind: "screenshot" as const, appear: 1, note: "笔记 1" };

/** 记笔记那章之后笔记里的内容：摘录、一行带时间戳的字、一张截帧 */
const FINAL_BLOCKS: NoteBlock[] = [
  quoteBlock(1),
  {
    kind: "paragraph",
    parts: [
      { kind: "text", text: NOTE.typed },
      { kind: "timestamp", time: STAMP_TIME, appear: 1 },
    ],
    typed: 99,
  },
  { kind: "screenshot", time: SHOT_TIME, slide: slideAt(SHOT_TIME), appear: 1 },
];
const FINAL_MARKERS = [QUOTE_MARKER, STAMP_MARKER, SHOT_MARKER];

/** 点回那一刻：章节卡期间视频接着常速播，点时间戳后跳回 STAMP_TIME */
const SEEK_REPLAY = replayOf("seek");
const SEEK_PLAYS: Play[] = [{ ...NOTE_PLAYS[NOTE_PLAYS.length - 1] }, { from: mark(SEEK_REPLAY, "seek"), start: STAMP_TIME, speed: 1 }];

/** 问 AI：接着播，点暂停后停住 */
const ASK_REPLAY = replayOf("ask");
const ASK_PLAYS: Play[] = [{ ...SEEK_PLAYS[1], until: mark(ASK_REPLAY, "pause") }];
/** 问 AI 之后视频停住的位置 */
const REST_TIME = playAt(ASK_PLAYS, ASK_REPLAY.end).time;

/** 片头：这门课记完以后的样子，从 02:31 往下播；镜头从播放器特写拉开到整窗，宣言叠在上面 */
const TEASER_PLAYS: Play[] = [{ from: 0, start: 2 * 60 + 31, speed: 3 }];
const teaser: Scene = tools => {
  const play = playback(TEASER_PLAYS, tools.frame, tools.hit);
  return <NoteShell tools={tools} state={mainNote({ ...play, playing: true, quoted: [LECTURE.quote], notes: { kind: "blocks", tab: "笔记 1", blocks: FINAL_BLOCKS }, markers: FINAL_MARKERS })} />;
};

/** 「+」菜单：鼠标停到哪一项，哪一项才高亮；停在「添加视频」上约 0.25 秒，二级菜单展开（真实菜单的延时），之后父项一直亮着 */
function addMenu(tools: SceneTools) {
  const { frame, mark } = tools;
  const on = tools.under();
  const inSubmenu = on?.startsWith("video:") ?? false;
  const appear = span(frame, mark("open:bilibili") + 6, mark("pick:bilibili") + 8);
  if (appear <= 0) return undefined;
  return {
    appear,
    submenu: span(frame, mark("hover:bilibili") + PACE.hover, mark("pick:bilibili") + 8),
    highlighted: [...(on === "add:2" || inSubmenu ? ["2"] : []), ...(inSubmenu ? [on!] : [])],
  };
}

/** 视频从哪来：插件中心装 Bilibili → 项目里「+」→ 添加视频 → Bilibili → 粘链接解析 → 确认 → 自动打开、缓存到本机 */
const add: Scene = tools => {
  const { frame, text, mark, pressing } = tools;
  const onPlugins = frame >= mark("toPlugins") + 4 && frame < mark("toProjects") + 4;
  if (frame < mark("toPlugins") + 4) return teaser(tools);
  if (onPlugins) {
    const state: InstallState = frame < mark("confirm:bilibili") + 8 ? "available" : frame < mark("installed:bilibili") ? "installing" : "installed";
    const confirm = span(frame, mark("install:bilibili") + 8, mark("confirm:bilibili") + 8);
    return (
      <Window
        tools={tools}
        active="plugins"
        overlay={
          <>
            {confirm > 0 && (
              <ConfirmCard
                title={`安装「${VIDEO_PLUGINS.bilibili.name}」${VIDEO_PLUGINS.bilibili.version}？`}
                description={INSTALL_NOTICE}
                confirmText="安装"
                appear={confirm}
                pressed={pressing("confirm")}
              />
            )}
          </>
        }
      >
        <PluginsPage
          plugins={CATALOG}
          query={text("search")}
          states={{ bilibili: state }}
          installedCount={2 + (state === "installed" ? 1 : 0)}
          pressed={{ install: pressing("install:bilibili") ? "bilibili" : undefined, search: pressing("search") }}
        />
      </Window>
    );
  }

  const confirmAt = mark("confirm");
  const added = frame >= confirmAt + 10;
  // 加完视频会自动打开；文档树放不下两栏就自动收起
  const tree = 1 - ramp(frame, confirmAt + 10, confirmAt + 32);
  const cacheEnd = mark("cached");
  const ready = frame >= READY_PLAY.from;
  const play = playback([READY_PLAY], frame, tools.hit);
  const note = mainNote({ ...UNTRANSCRIBED, ...(ready ? { ...play, playing: true } : { cache: { progress: ramp(frame, confirmAt + 36, cacheEnd), done: ramp(frame, cacheEnd - 14, cacheEnd) } }) });
  const resolvedAt = mark("resolved:bilibili");
  const dialog = span(frame, mark("pick:bilibili") + 8, confirmAt + 8);
  const toast = span(frame, confirmAt + 8, confirmAt + 124, 12, 16);
  const on = tools.under();
  return (
    <Window
      tools={tools}
      active="projects"
      crumb={<ProjectCrumb project={LECTURE.project} />}
      overlay={
        <>
          {toast > 0 && <Toast message="视频笔记添加成功" appear={toast} />}
          {dialog > 0 && (
            <OnlineVideoDialog
              provider={VIDEO_PLUGINS.bilibili.name}
              appear={dialog}
              url={text("url:bilibili")}
              caret={frame >= mark("focus:url:bilibili") && frame < mark("pasted:url:bilibili") + 40}
              parsing={frame >= mark("parse:url:bilibili") + 6 && frame < resolvedAt}
              resolved={frame >= resolvedAt ? { title: LECTURE.title, cover: "modes", variants: BILIBILI_VARIANTS, selected: 2, appear: ramp(frame, resolvedAt, resolvedAt + 12) } : undefined}
              pressed={pressing("parse") ? "parse" : pressing("confirm") ? "confirm" : undefined}
              selectHighlighted={on?.startsWith("variant:") ? Number(on.slice("variant:".length)) : undefined}
            />
          )}
        </>
      }
    >
      <ProjectTreePage project={LECTURE.project} items={added ? TREE : TREE_BEFORE} activeId={added ? "v2" : undefined} tree={tree} menu={addMenu(tools)} providers={[VIDEO_PLUGINS.bilibili.name]}>
        {added ? <VideoNotePage state={note} /> : null}
      </ProjectTreePage>
    </Window>
  );
};

/** 这个视频没带字幕：添加后字幕区是「开始转录」的空态，进度条也还没有章节分段 */
const UNTRANSCRIBED: Partial<VideoNoteState> = { transcript: "未转录", segments: [], chapters: [], current: null };

/** 字幕的当前句：片段（02:21 起）之前没有当前句 */
const currentOf = (time: number) => (time < LECTURE.segments[0].start / 1000 ? null : currentAt(time));

/** 转录：开始转录 → 准备视频、提取音频、识别（百分比）→ 字幕逐句出现 → 分章节 → 进度条分段。视频一直接着添加那章往下播 */
const transcribe: Scene = tools => {
  const { frame, mark, hit, pressing } = tools;
  const play = playback([READY_PLAY], frame, hit);
  const started = mark("transcribe") + 8;
  const done = mark("done");
  const chaptered = mark("chaptered");
  const base = { ...play, playing: true, current: currentOf(play.time), scroll: currentOf(play.time) === null ? 0 : play.scroll };
  let state: VideoNoteState;
  if (frame < started) state = mainNote({ ...UNTRANSCRIBED, ...base, pressed: pressing("transcribe") ? "transcribe" : undefined });
  else if (frame < done) {
    const percent = Math.round(100 * ramp(frame, mark("recognize") + 10, done - 16));
    const step = frame < mark("extract") ? TRANSCRIBE_STEPS[0] : frame < mark("recognize") ? TRANSCRIBE_STEPS[1] : `${TRANSCRIBE_STEPS[2]} ${percent}%`;
    state = mainNote({ ...UNTRANSCRIBED, ...base, transcript: "转录中…", transcribing: step });
  } else
    state = mainNote({
      ...base,
      chapters: frame >= chaptered ? LECTURE.chapters : [],
      segmentsReveal: ramp(frame, done, done + 60),
      chaptering: frame >= mark("chaptering") && frame < chaptered,
    });
  return <NoteShell tools={tools} state={state} overlay={<Toast message={TRANSCRIBE_STEPS[3]} appear={span(frame, done, done + 110, 12, 16)} />} />;
};

/** 截下的一帧从播放器飞进笔记：起点是播放器画面，终点是笔记里这张截图的画面，走一条往上拱的弧 */
function ShotFlight({ tools }: { tools: SceneTools }) {
  const { frame, mark, hit } = tools;
  const from = hit("player");
  const to = hit("note-shot:2");
  const shot = mark("shot");
  const landed = mark("landed");
  if (!from || !to || frame < shot || frame >= landed + 4) return null;
  const t = progress(frame, shot + 4, landed - shot - 4, ease.inOut);
  // 终点只取截图的画面部分（下面那行「视频截图 - mm:ss」不算）
  const width = mix(from.w, to.w, t);
  const height = (width * 9) / 16;
  const x = mix(from.x - from.w / 2, to.x - to.w / 2, t);
  const y = mix(from.y - from.h / 2, to.y - to.h / 2, t) - Math.sin(Math.PI * t) * 70;
  const lift = Math.sin(Math.PI * Math.min(1, t * 1.2));
  return (
    <div
      className="absolute z-[350] overflow-hidden rounded-lg"
      style={{
        left: x,
        top: y,
        width,
        height,
        transform: `scale(${1 - 0.06 * lift})`,
        boxShadow: `0 ${18 * lift}px ${48 * lift}px rgba(15, 30, 50, ${0.32 * lift})`,
        outline: `${2 * lift}px solid var(--tau-accent)`,
      }}
    >
      <LectureFrame kind={slideAt(SHOT_TIME)} />
    </div>
  );
}

/** 记：划一句摘进笔记 → 写一行字、⌘⇧T 时间戳 → 快进到示意图、⌘⇧S 截一帧 */
const note: Scene = tools => {
  const { frame, mark, text, typing, hit } = tools;
  const toNote = mark("toNote");
  const stamp = mark("stamp");
  const shot = mark("shot");
  const play = playback(NOTE_PLAYS, frame, hit);
  const blocks: NoteBlock[] = [];
  if (frame >= toNote + 4) blocks.push(quoteBlock(ramp(frame, toNote + 4, toNote + 20)));
  if (frame >= mark("focusNote") + 6)
    blocks.push({
      kind: "paragraph",
      parts: [
        { kind: "text", text: NOTE.typed },
        { kind: "timestamp", time: STAMP_TIME, appear: ramp(frame, stamp, stamp + 10) },
      ],
      typed: text("note").length + (frame >= stamp ? 1 : 0),
      caret: typing("note") || (frame >= stamp && frame < stamp + 16),
    });
  // 截图块按下快捷键就占好位置（飞行的终点要量得到），飞到了才显出来
  const landed = mark("landed");
  if (frame >= shot) blocks.push({ kind: "screenshot", time: SHOT_TIME, slide: slideAt(SHOT_TIME), appear: ramp(frame, landed - 2, landed + 8) });
  const markers: NonNullable<VideoNoteState["markers"]> = [];
  if (frame >= toNote + 24) markers.push({ ...QUOTE_MARKER, appear: ramp(frame, toNote + 24, toNote + 40) });
  if (frame >= stamp + 24) markers.push({ ...STAMP_MARKER, appear: ramp(frame, stamp + 24, stamp + 40) });
  if (frame >= landed + 24) markers.push({ ...SHOT_MARKER, appear: ramp(frame, landed + 24, landed + 40) });
  return (
    <NoteShell
      tools={tools}
      state={mainNote({
        ...play,
        quoted: frame >= toNote + 4 ? [LECTURE.quote] : [],
        notes: blocks.length ? { kind: "blocks", tab: "笔记 1", blocks } : { kind: "empty" },
        selection: selectionOf(tools, LECTURE.quote, toNote, "quote"),
        selectHits: [LECTURE.quote],
        markers,
        flash: shot <= frame && frame < shot + 12 ? Math.sin((Math.PI * (frame - shot)) / 12) : 0,
      })}
      overlay={<ShotFlight tools={tools} />}
    />
  );
};

/** 点回那一刻：点笔记里的时间戳 → 播放头跳回、字幕滚回去 → 鼠标停到进度条的刻度上，浮出当时记下的那句话 */
const seek: Scene = tools => {
  const { frame, mark, hit } = tools;
  const hover = mark("hover");
  return (
    <NoteShell
      tools={tools}
      state={mainNote({
        ...playback(SEEK_PLAYS, frame, hit),
        quoted: [LECTURE.quote],
        notes: { kind: "blocks", tab: "笔记 1", blocks: FINAL_BLOCKS },
        markers: FINAL_MARKERS,
        markerHover: { index: 1, appear: span(frame, hover - 4, NEVER, 10) },
      })}
    />
  );
};

/** 对话里的一轮：发送后用户消息浮出 → 工具行依次执行（每个 40 帧，间隔 45 帧）→ 回答逐段流出 */
function turnOf(tools: SceneTools, index: number, exchange: ChatExchange, answerFrames: number): ChatTurn {
  const { frame, mark } = tools;
  const send = mark(`send:${index}`);
  const toolAt = mark(`tool:${index}:0`);
  const answerAt = mark(`answer:${index}`);
  return {
    exchange,
    user: frame >= send + 4 ? ramp(frame, send + 4, send + 20) : 0,
    tools: exchange.tools.map((_, i) => (frame >= toolAt + i * 45 ? ramp(frame, toolAt + i * 45, toolAt + i * 45 + 40) || 0.01 : 0)),
    answer: frame >= answerAt ? ramp(frame, answerAt, answerAt + answerFrames) : 0,
  };
}

/** 问 AI：暂停 → 打开对话 → 建议提问「总结」→ 自己打一问（工具行：检索字幕、读一段）→ 划一句「问 AI」→「举个例子」→ 发送 */
const ask: Scene = tools => {
  const { frame, mark, hit, pressing, text, typing } = tools;
  const open = mark("open");
  const select = mark("select");
  const asked = mark("ask");
  const fill = mark("fill");
  const lastSend = mark("send:2");
  const play = playback(ASK_PLAYS, frame, hit);
  const turns = [turnOf(tools, 0, CHAT.summary, 170), turnOf(tools, 1, CHAT.search, 150), turnOf(tools, 2, CHAT.quote, 180)];
  const typed = frame < mark("send:1") + 4 ? text("chat") : "";
  const quoting = frame >= asked + 4 && frame < lastSend + 4;
  const chat = {
    turns,
    quote: quoting ? CHAT.quote.quote : undefined,
    quoteAt: ramp(frame, asked + 16, asked + 34),
    input: frame >= fill + 4 && frame < lastSend + 4 ? NOTE.prompt : typed,
    caret: typing("chat") || (frame >= mark("focus:chat") && frame < mark("send:1")) || (frame >= fill + 4 && frame < lastSend + 4),
    pressedAsk: pressing("ask:2") ? 2 : undefined,
    pressedSend: pressing("send"),
    pressedPrompt: pressing("chat-prompt:0") ? 0 : undefined,
  };
  // 划的那句在当前句上面：字幕先滚回去把它露出来
  const scroll = frame >= select - 40 ? mix(play.scroll, placeRow(LECTURE.ask, hit), progress(frame, select - 40, 24, ease.inOut)) : play.scroll;
  return (
    <NoteShell
      tools={tools}
      state={mainNote({
        ...play,
        scroll,
        quoted: [LECTURE.quote],
        notes: { kind: "blocks", tab: "笔记 1", blocks: FINAL_BLOCKS },
        markers: FINAL_MARKERS,
        selection: selectionOf(tools, LECTURE.ask, asked, "ask"),
        selectHits: [LECTURE.ask],
        chatOpen: ramp(frame, open + 4, open + 30),
        chat,
      })}
    />
  );
};

/** 把某一句挪到字幕视口正中要滚多少 */
const placeRow = (index: number, hit: SceneTools["hit"]) => rowScroll(index, hit) ?? 0;

/** 草稿的总字数 */
const DRAFT_CHARS = EBOOK.draft.reduce((n, block) => n + [...block.text].length, 0);

/** 整门课写成一本书：⋯ → AI 导出电子书 → 生成草稿（长文逐段流出）→ 下一步 → 改书名 → 导出 EPUB → 访达里选中这本书 */
const ebook: Scene = tools => {
  const { frame, mark, hit, text, pressing } = tools;
  const opened = mark("open:ebook");
  const streaming = mark("streaming");
  const drafted = mark("drafted");
  const next = mark("next");
  const exported = mark("export");
  const finder = mark("finder");
  const on = tools.under();
  const menu: VideoNoteState["menu"] = { appear: span(frame, mark("menu") + 6, opened + 6), highlighted: on?.startsWith("menu:") ? on.slice("menu:".length) : undefined };
  const shown = Math.round(DRAFT_CHARS * ramp(frame, streaming + 24, drafted));
  // 草稿写到下半截时跟着往下滚，最后一行留在编辑区里
  const draftEl = hit("ebook:draft");
  const viewport = hit("ebook:draft-viewport");
  const overflow = draftEl && viewport ? Math.max(0, draftEl.h - viewport.h) : 0;
  const draftScroll = overflow * ramp(frame, mix(streaming, drafted, 0.45), drafted);
  const typed = text("title");
  const title = frame < mark("clear") ? LECTURE.title : typed;
  const dialog = span(frame, opened + 8, exported + 14);
  const finderIn = span(frame, finder - 10, NEVER, 18);
  const pressed = pressing("ebook:generate") ? "generate" : pressing("ebook:next") ? "next" : pressing("ebook:export") ? "export" : undefined;
  return (
    <NoteShell
      tools={tools}
      state={mainNote({
        time: REST_TIME,
        current: currentAt(REST_TIME),
        slide: slideAt(REST_TIME),
        scroll: placeRow(currentAt(REST_TIME), hit),
        quoted: [LECTURE.quote],
        notes: { kind: "blocks", tab: "笔记 1", blocks: FINAL_BLOCKS },
        markers: FINAL_MARKERS,
        menu: menu.appear > 0 ? menu : undefined,
      })}
      overlay={
        <>
          {dialog > 0 && (
            <EbookExportDialog
              appear={dialog}
              context={LECTURE.title}
              step={frame < next + 8 ? 0 : 1}
              style={0}
              draft={EBOOK.draft}
              shown={frame >= streaming ? shown : 0}
              streaming={frame >= streaming && frame < drafted}
              draftScroll={draftScroll}
              book={{
                title,
                author: EBOOK.author,
                description: "看完一节《学会学习》写成的长文：大脑的两种工作方式，以及卡住的时候为什么要先离开一会儿。",
                cover: "diagram",
                focused: frame >= mark("focus:title") && frame < exported,
                selected: frame >= mark("focus:title") + 6 && frame < mark("clear"),
              }}
              pressed={pressed}
            />
          )}
          {frame >= exported + 4 && <Toast message="已导出 EPUB" appear={span(frame, exported + 4, finder + 10, 12, 16)} />}
          {finderIn > 0 && (
            <div className="absolute inset-0 z-[400] grid place-items-center" style={{ opacity: finderIn, transform: `scale(${0.94 + 0.06 * finderIn})` }}>
              <FinderWindow rows={FINDER_ROWS} selected={progress(frame, finder + 12, 10)} />
            </div>
          )}
        </>
      }
    />
  );
};

/** 导出后 Tau 在访达里显示这本书 */
const FINDER_ROWS = [
  { name: `${EBOOK.book}.epub`, date: "今天 21:46", size: "2.3 MB", kind: "EPUB 电子书", book: true },
  { name: "读书会资料", date: "昨天 21:03", size: "--", kind: "文件夹" },
  { name: "学习计划.pdf", date: "2026年11月12日 22:40", size: "864 KB", kind: "PDF 文稿" },
  { name: "截图", date: "2026年11月8日 10:15", size: "--", kind: "文件夹" },
];

const SCENES: Record<string, Scene> = { teaser, add, transcribe, note, seek, ask, ebook };

export function VideoNotesFilm() {
  return <FeatureFrame film={{ intro: INTRO, ending: ENDING, chapters: CHAPTERS, scenes: SCENES, sfx: "sfx/video-notes.mp3" }} timeline={TIMELINE} />;
}

export const VIDEO_NOTES_DURATION = TIMELINE.end;

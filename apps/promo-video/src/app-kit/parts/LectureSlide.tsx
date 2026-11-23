/**
 * 播放器里代码画的讲座幻灯片（片中的课没有用真实视频画面）。16:9，是播放器画面、笔记里的截帧和解析结果里的封面。
 * 三页随播放切换；elapsed 是这一页已经播了几秒，页内元素按它逐个出现（像讲者一页页点出来），缺省为全部出齐（截帧、封面）。
 */
import type { ReactNode } from "react";
import { fonts } from "../../brand/tokens";
import { SLIDE_TEXT, type SlideKind } from "../../mock/videonote";

/** 课件配色：深海蓝底 + 盐白字 + 浅海盐蓝强调，和软件的「海盐」主题同一色系，又像一帧真实的视频画面 */
export const SLIDE_COLORS = { ink: "#eef3f9", muted: "#93a4b8", accent: "#7fb1ea", paper: "#17283d", line: "rgba(238,243,249,0.16)" };
const INK = SLIDE_COLORS.ink;
const MUTED = SLIDE_COLORS.muted;
const ACCENT = SLIDE_COLORS.accent;
const PAPER = SLIDE_COLORS.paper;

/** 页内第 step 个元素在 elapsed 秒时的出现进度（每 2.4 秒点出一个，0.5 秒淡入） */
const build = (elapsed: number, step: number) => Math.max(0, Math.min(1, (elapsed - step * 2.4) / 0.5));
const reveal = (t: number) => ({ opacity: t, transform: `translateY(${(1 - t) * 0.6}cqw)` });

/** 专注模式：一条窄路上挨着的点；发散模式：散开、彼此连着的点。grow 0→1 是连线逐条画出 */
function Network({ cx, cy, compact, grow = 1 }: { cx: number; cy: number; compact: boolean; grow?: number }) {
  const seeds = [3, 17, 29, 41, 53, 67, 79, 91, 103, 117];
  const points = seeds.map((seed, i) => {
    const angle = (seed * 2.399) % (Math.PI * 2);
    const radius = compact ? 12 + (seed % 5) * 5 : 40 + ((seed * 7) % 90);
    return { x: cx + Math.cos(angle) * radius * (compact ? 1.6 : 1), y: cy + Math.sin(angle) * radius * (compact ? 0.5 : 0.8), i };
  });
  const near = points.flatMap((a, i) =>
    points
      .slice(i + 1)
      .filter(b => Math.hypot(a.x - b.x, a.y - b.y) < (compact ? 34 : 95))
      .map(b => [a, b] as const)
  );
  const shown = Math.round(near.length * grow);
  return (
    <g>
      {near.slice(0, shown).map(([a, b], i) => (
        <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={compact ? ACCENT : MUTED} strokeWidth={compact ? 3.5 : 1.6} strokeLinecap="round" opacity={compact ? 0.85 : 0.6} />
      ))}
      {points.map(p => (
        <circle key={p.i} cx={p.x} cy={p.y} r={compact ? 7 : 6} fill={compact ? ACCENT : INK} stroke={PAPER} strokeWidth={3} />
      ))}
    </g>
  );
}

function Page({ title, foot, page, children, subtitle, mounted }: { title: string; foot: string; page: string; children: ReactNode; subtitle?: string; mounted?: number }) {
  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden px-[7%] py-[6%]" style={{ background: PAPER, fontFamily: fonts.caption, color: INK, containerType: "size" }}>
      <div style={{ fontSize: "4.2cqw", fontWeight: 700, letterSpacing: "0.04em" }}>{title}</div>
      <div className="flex min-h-0 flex-1 flex-col justify-center">{children}</div>
      <div className="flex items-center justify-between" style={{ fontSize: "1.7cqw", color: MUTED }}>
        <span>{foot}</span>
        <span>{page}</span>
      </div>
      {subtitle && <SlideSubtitle text={subtitle} mounted={mounted ?? 1} />}
    </div>
  );
}

export function LectureSlide({ kind, elapsed = 99, subtitle, mounted }: { kind: SlideKind; elapsed?: number; subtitle?: string; mounted?: number }) {
  if (kind === "focused") {
    const text = SLIDE_TEXT.focused;
    return (
      <Page title={text.title} foot={text.foot} page={text.page} subtitle={subtitle} mounted={mounted}>
        <svg viewBox="0 0 1000 300" className="w-full">
          {/* 一条窄路：点沿着路一个个亮起来 */}
          <path d="M60 200 C 260 200, 320 110, 520 110 S 820 170, 940 120" fill="none" stroke={SLIDE_COLORS.line} strokeWidth="34" strokeLinecap="round" />
          {[0, 1, 2, 3, 4, 5, 6].map(i => {
            const t = build(elapsed, 0.4 + i * 0.28);
            const x = 90 + i * 135;
            const y = [196, 178, 128, 110, 122, 152, 128][i];
            return <circle key={i} cx={x} cy={y} r={16 * t} fill={ACCENT} stroke={PAPER} strokeWidth={5} />;
          })}
        </svg>
        <div style={{ ...reveal(build(elapsed, 2.6)), fontSize: "2.6cqw", color: MUTED, textAlign: "center", marginTop: "2cqw" }}>{text.sub}</div>
      </Page>
    );
  }
  if (kind === "modes") {
    const text = SLIDE_TEXT.modes;
    const left = build(elapsed, 0.2);
    const right = build(elapsed, 1.4);
    return (
      <Page title={text.title} foot={text.foot} page={text.page} subtitle={subtitle} mounted={mounted}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center" style={{ columnGap: "6%" }}>
          <div className="flex flex-col items-center" style={reveal(left)}>
            <svg viewBox="0 0 400 220" className="w-[78%]">
              <Network cx={200} cy={110} compact grow={left} />
            </svg>
            <div style={{ fontSize: "3.6cqw", fontWeight: 700, letterSpacing: "0.2em", color: ACCENT }}>{text.focused}</div>
            <div style={{ fontSize: "2.1cqw", color: MUTED, marginTop: "0.3em" }}>{text.focusedSub}</div>
          </div>
          <div style={{ width: 2, alignSelf: "stretch", background: SLIDE_COLORS.line, opacity: right }} />
          <div className="flex flex-col items-center" style={reveal(right)}>
            <svg viewBox="0 0 400 220" className="w-[78%]">
              <Network cx={200} cy={110} compact={false} grow={build(elapsed, 1.6)} />
            </svg>
            <div style={{ fontSize: "3.6cqw", fontWeight: 700, letterSpacing: "0.2em" }}>{text.diffuse}</div>
            <div style={{ fontSize: "2.1cqw", color: MUTED, marginTop: "0.3em" }}>{text.diffuseSub}</div>
          </div>
        </div>
      </Page>
    );
  }
  const text = SLIDE_TEXT.diagram;
  const boxes = build(elapsed, 0.1);
  const arrows = build(elapsed, 1.2);
  return (
    <Page title={text.title} foot={text.foot} page={text.page} subtitle={subtitle} mounted={mounted}>
      <svg viewBox="0 0 1000 320" className="w-full">
        <g opacity={boxes}>
          <rect x="110" y="60" width="310" height="190" rx="28" fill="none" stroke={ACCENT} strokeWidth="6" />
          <rect x="580" y="60" width="310" height="190" rx="28" fill="none" stroke={INK} strokeWidth="6" strokeDasharray="16 12" />
          <text x="265" y="150" textAnchor="middle" fontSize="60" fontWeight="700" fill={ACCENT} letterSpacing="12">
            {text.focused}
          </text>
          <text x="265" y="205" textAnchor="middle" fontSize="28" fill={MUTED}>
            {text.focusedSub}
          </text>
          <text x="735" y="150" textAnchor="middle" fontSize="60" fontWeight="700" fill={INK} letterSpacing="12">
            {text.diffuse}
          </text>
          <text x="735" y="205" textAnchor="middle" fontSize="28" fill={MUTED}>
            {text.diffuseSub}
          </text>
        </g>
        <g opacity={arrows}>
          <path d="M440 115 C 490 75, 510 75, 560 115" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
          <path d="M552 101 L 566 119 L 544 125" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M560 195 C 510 235, 490 235, 440 195" fill="none" stroke={ACCENT} strokeWidth="5" strokeLinecap="round" />
          <path d="M448 209 L 434 191 L 456 185" fill="none" stroke={ACCENT} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    </Page>
  );
}

/**
 * 幻灯片铺满这个容器（16:9）。幻灯片里的字号按容器宽度算（cqw），容器必须是定位过的：外面的 h-full / aspect-video 撑不出确定的高度。
 */
export function LectureFrame({ kind, elapsed, subtitle, mounted }: { kind: SlideKind; elapsed?: number; subtitle?: string; mounted?: number }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden">
      <LectureSlide kind={kind} elapsed={elapsed} subtitle={subtitle} mounted={mounted} />
    </div>
  );
}

/** 挂载字幕：叠在画面底部的一句（浏览器原生字幕的样子：白字、半透明深底） */
function SlideSubtitle({ text, mounted }: { text: string; mounted: number }) {
  if (mounted <= 0) return null;
  return (
    <div className="absolute inset-x-0 bottom-[6%] flex justify-center" style={{ opacity: mounted }}>
      <span className="rounded-[4px] px-[0.5em] py-[0.15em]" style={{ background: "rgba(8, 8, 8, 0.7)", color: "#fff", fontSize: "2.5cqw", lineHeight: 1.3 }}>
        {text}
      </span>
    </div>
  );
}

/** 解析结果里的封面（96×54）：幻灯片的示意图形，不放字——这个尺寸下字只会糊成一片 */
export function LectureCover({ kind }: { kind: SlideKind }) {
  return (
    <div className="absolute inset-0" style={{ background: PAPER }}>
      <svg viewBox="0 0 160 90" className="size-full">
        {kind === "diagram" ? (
          <>
            <rect x={18} y={22} width={50} height={46} rx={9} fill="none" stroke={ACCENT} strokeWidth={3.5} />
            <rect x={92} y={22} width={50} height={46} rx={9} fill="none" stroke={INK} strokeWidth={3.5} strokeDasharray="7 5" />
            <path d="M72 38 C 78 32, 82 32, 88 38" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
            <path d="M88 52 C 82 58, 78 58, 72 52" fill="none" stroke={ACCENT} strokeWidth={3} strokeLinecap="round" />
          </>
        ) : (
          <>
            <g transform="translate(-30 -10) scale(0.55)">
              <Network cx={200} cy={110} compact />
            </g>
            <line x1={80} y1={18} x2={80} y2={72} stroke={SLIDE_COLORS.line} strokeWidth={1.5} />
            <g transform="translate(38 -10) scale(0.55)">
              <Network cx={200} cy={110} compact={false} />
            </g>
          </>
        )}
      </svg>
    </div>
  );
}

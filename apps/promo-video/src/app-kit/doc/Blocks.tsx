/**
 * 代表性块的展示态重建（只读）。类名摘自 editor-extensions：table / callout / diagram(mermaid) /
 * media(image-gallary) / tabs，数据库块摘自 apps/desktop/src/editor-extensions/database + packages/database。
 * 颜色统一取 --tau-*（编辑器 --ed-* 即由其派生）。
 */
import clsx from "clsx";
import katex from "katex";
import "katex/dist/katex.min.css";
import { staticFile } from "remotion";
import { ArrowDownUp, CalendarDays, CircleChevronDown, Filter, Hash, Maximize, MoreHorizontal, Play, Plus, Search, SquareKanban, Table2, Type, Volume2, X } from "lucide-react";
import { CodeBlock } from "./LiveDoc";

const TABLE_ROWS = [
  ["方法", "适合的内容", "频率"],
  ["卡片", "一个观点、一段随想", "随时"],
  ["文章", "成体系的长文", "每周"],
  ["闪卡", "需要记住的事实", "每天"],
];

/** rows 首行为表头；各片演示内容不同，缺省为功能片的数据 */
export function TableBlock({ rows = TABLE_ROWS }: { rows?: string[][] }) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-solid border-[var(--tau-line-1)]">
      <table className="w-full border-separate border-spacing-0">
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td
                  key={c}
                  className={clsx(
                    "border-solid border-[var(--tau-line-1)] px-3 py-[7px] text-left align-top",
                    c < row.length - 1 && "border-r",
                    r < rows.length - 1 && "border-b",
                    r === 0 && "bg-hover font-semibold"
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CALLOUT = {
  tip: { title: "技巧", border: "var(--tau-ok)", bg: "var(--tau-ok-soft)" },
  info: { title: "信息", border: "var(--tau-info)", bg: "var(--tau-info-soft)" },
  warning: { title: "警告", border: "var(--tau-warn)", bg: "var(--tau-warn-soft)" },
} as const;

export function CalloutBlock({ type = "tip", text }: { type?: keyof typeof CALLOUT; text: string }) {
  const c = CALLOUT[type];
  return (
    <div className="relative rounded-[0.5em] border-l-[0.25em] p-[0.5em] pb-[1.25em] pl-[1em] text-[var(--tau-ink-1)]" style={{ borderLeftColor: c.border, backgroundColor: c.bg }}>
      <p className="relative mt-[0.625em] mb-[0.6em] pl-[1.5em] leading-tight font-semibold">
        <span
          className="absolute top-[-0.1em] left-0 h-[1.25em] w-[1.25em]"
          style={{
            background: c.border,
            WebkitMask: `url(${staticFile(`callout/${type}.svg`)}) left center / contain no-repeat`,
            mask: `url(${staticFile(`callout/${type}.svg`)}) left center / contain no-repeat`,
          }}
        />
        {c.title}
      </p>
      <div>{text}</div>
    </div>
  );
}

export function MathShowcase({ tex }: { tex: string }) {
  const html = katex.renderToString(tex, { displayMode: true, throwOnError: false });
  return (
    <div
      className="flex min-h-[3em] flex-col justify-center rounded-[0.625em] text-[1.25em] [&_.katex-display]:my-[0.4em] [&_.katex-display>.katex]:mx-auto"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Mermaid 流程图：按 mermaid-theme.ts 的取色手绘（节点 accent-soft 底 + accent 描边，连线 ink-3） */
export function MermaidBlock() {
  const node = (x: number, y: number, w: number, label: string, alt?: boolean) => (
    <g key={label}>
      <rect
        x={x - w / 2}
        y={y - 21}
        width={w}
        height={42}
        rx={6}
        fill={alt ? "var(--tau-tag-2-soft)" : "var(--tau-accent-soft)"}
        stroke={alt ? "var(--tau-tag-2)" : "var(--tau-accent)"}
        strokeWidth={1.25}
      />
      <text x={x} y={y + 5} textAnchor="middle" fontSize={14} fontWeight={500} fill="var(--tau-ink-1)" fontFamily="var(--tau-font)">
        {label}
      </text>
    </g>
  );
  const arrow = (x1: number, y1: number, x2: number, y2: number) => (
    <path key={`${x1}${y1}${x2}`} d={`M${x1} ${y1} L${x2} ${y2}`} stroke="var(--tau-ink-3)" strokeWidth={1.5} markerEnd="url(#mm-arrow)" fill="none" />
  );
  return (
    <div className="flex w-full items-center justify-center rounded-[0.625em] p-[20px]">
      <svg width={560} height={150} viewBox="0 0 560 150">
        <defs>
          <marker id="mm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill="var(--tau-ink-3)" />
          </marker>
        </defs>
        {arrow(110, 75, 178, 75)}
        {arrow(282, 75, 350, 40)}
        {arrow(282, 75, 350, 110)}
        {node(60, 75, 100, "输入")}
        {node(230, 75, 104, "消化")}
        {node(420, 40, 130, "卡片 · 文章", true)}
        {node(420, 110, 130, "复习 · 回看", true)}
      </svg>
    </div>
  );
}

/** 图集（横排 justified）：用渐变色块代替照片 */
export function GalleryBlock() {
  const tiles = [
    { w: 2.1, bg: "linear-gradient(135deg,#d9c7a7,#a8875a 60%,#6f5636)" },
    { w: 1.3, bg: "linear-gradient(160deg,#9fb4c7,#5c7d99)" },
    { w: 1.6, bg: "linear-gradient(140deg,#c9d6c3,#61795f)" },
    { w: 1.4, bg: "linear-gradient(150deg,#e7c6b8,#b06a5e)" },
    { w: 2.0, bg: "linear-gradient(130deg,#d6cde4,#8a7aa6)" },
    { w: 1.2, bg: "linear-gradient(160deg,#f1e2bd,#a38c4d)" },
  ];
  const rows = [tiles.slice(0, 3), tiles.slice(3)];
  return (
    <div className="flex flex-col gap-2 rounded-[var(--tau-radius-sm)]">
      {rows.map((row, r) => (
        <div key={r} className="flex h-[130px] gap-2">
          {row.map((tile, i) => (
            <div key={i} className="h-full overflow-hidden rounded-[var(--tau-radius-sm)]" style={{ flex: tile.w, background: tile.bg }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function TabsBlock() {
  const tabs = ["概念", "例子", "延伸阅读"];
  return (
    <div className="bg-surface overflow-hidden rounded-[10px] border border-[var(--tau-line-1)]">
      <div className="flex h-[42px] items-stretch gap-2.5 pr-2 pl-4 shadow-[inset_0_-1px_0_var(--tau-line-1)]">
        <div className="relative flex min-w-0 flex-1 items-stretch gap-[22px]">
          {tabs.map((tab, i) => (
            <div
              key={tab}
              className={clsx(
                "relative flex shrink-0 items-center gap-0.5 px-px text-[13.5px] leading-none after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-t-sm after:content-['']",
                i === 0 ? "text-ink-1 font-medium after:bg-[var(--tau-accent)]" : "text-ink-2"
              )}
            >
              <span>{tab}</span>
              {i === 0 && <X className="text-ink-3 -mr-1 size-3" />}
            </div>
          ))}
        </div>
        <span className="text-ink-3 flex h-7 w-7 items-center justify-center self-center">
          <Plus size={15} />
        </span>
      </div>
      <div className="relative px-[18px] pt-3.5 pb-4">卡片笔记法的核心：一张卡片只写一个观点，并用链接把它们织成网络。</div>
    </div>
  );
}

export type BookRow = [string, { t: string; tone: string }, string, string];

const BOOK_ROWS: BookRow[] = [
  ["延展心智", { t: "在读", tone: "bg-accent-soft text-accent-text" }, "24", "—"],
  ["卡片笔记写作法", { t: "读完", tone: "bg-ok-soft text-ok" }, "57", "9月12日"],
  ["思考，快与慢", { t: "想读", tone: "bg-info-soft text-info" }, "0", "—"],
];

export function DatabaseBlock({ rows = BOOK_ROWS }: { rows?: BookRow[] }) {
  const cols = [
    { icon: Type, title: "书名", w: 190 },
    { icon: CircleChevronDown, title: "状态", w: 120 },
    { icon: Hash, title: "划线", w: 90 },
    { icon: CalendarDays, title: "读完", w: 120 },
  ];
  return (
    <div className="bg-surface border-line-1 shadow-card rounded-tau-md relative flex w-full flex-col overflow-hidden border">
      <div className="border-line-1 flex h-[46px] items-center gap-2 border-b pr-3 pl-4">
        <div className="flex h-full items-center gap-5">
          {[
            { icon: Table2, name: "书单", active: true },
            { icon: SquareKanban, name: "看板" },
          ].map(v => (
            <span key={v.name} className={clsx("relative inline-flex h-full items-center gap-1.5", v.active ? "text-ink-1 font-medium" : "text-ink-3")}>
              <v.icon className="size-[14px] opacity-80" strokeWidth={1.75} />
              <span className="text-tau-body">{v.name}</span>
              {v.active && <i className="bg-ink-1 absolute inset-x-0 -bottom-px h-0.5 rounded-full" />}
            </span>
          ))}
        </div>
        <span className="flex-1" />
        <span className="text-ink-3 grid size-7 place-items-center">
          <Search size={14} strokeWidth={1.75} />
        </span>
        <span className="text-ink-3 text-tau-meta flex h-7 items-center gap-1.5 rounded-[8px] px-2.5">
          <Filter className="size-[13px]" strokeWidth={1.75} />
          筛选
        </span>
        <span className="text-ink-3 text-tau-meta flex h-7 items-center gap-1.5 rounded-[8px] px-2.5">
          <ArrowDownUp className="size-[13px]" strokeWidth={1.75} />
          排序
        </span>
      </div>
      <div className="border-line-1 flex border-b">
        <span className="border-line-2 h-10 w-[50px] min-w-[50px] border-r" />
        {cols.map(c => (
          <span key={c.title} className="border-line-2 flex h-10 items-center border-r px-2 font-medium" style={{ width: c.w }}>
            <c.icon className="text-ink-2 mr-1.5 size-[14px]" strokeWidth={1.75} />
            <span className="text-tau-sm text-ink-2 truncate">{c.title}</span>
            <MoreHorizontal className="text-ink-3 ml-auto size-[14px]" strokeWidth={1.75} />
          </span>
        ))}
      </div>
      {rows.map((row, i) => (
        <div key={i} className="border-line-2 flex h-10 border-b">
          <span className="border-line-2 text-ink-3 text-tau-sm flex w-[50px] min-w-[50px] items-center justify-center border-r tabular-nums">{i + 1}</span>
          <span className="text-ink-1 text-tau-body border-line-2 flex items-center border-r px-2" style={{ width: cols[0].w }}>
            {row[0]}
          </span>
          <span className="border-line-2 flex items-center border-r px-2" style={{ width: cols[1].w }}>
            <span className={clsx("text-tau-sm inline-flex h-[22px] items-center gap-1.5 rounded-full px-[9px] leading-none", row[1].tone)}>
              <i className="size-1.5 rounded-full bg-current" />
              {row[1].t}
            </span>
          </span>
          <span className="text-ink-1 text-tau-body border-line-2 flex items-center border-r px-2 tabular-nums" style={{ width: cols[2].w }}>
            {row[2]}
          </span>
          <span className="text-ink-1 text-tau-body border-line-2 flex items-center border-r px-2" style={{ width: cols[3].w }}>
            {row[3]}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CodeShowcase({ dark = false }: { dark?: boolean }) {
  return (
    <CodeBlock
      lang="ts"
      dark={dark}
      code={`// 下一次复习的间隔\nexport function nextInterval(card: Card, grade: Grade) {\n  const ease = Math.max(1.3, card.ease + 0.1 - (5 - grade) * 0.08);\n  return Math.round(card.interval * ease);\n}`}
    />
  );
}

/** 任务列表：list/check-list + shared CustomCheckbox（已勾项文字不划线） */
const TASK_ITEMS = [
  { text: "读完《延展心智》第三章", done: true },
  { text: "把划线整理成三张卡片", done: true },
  { text: "给读书会准备三个问题", done: false },
];

export function TaskListBlock({ items = TASK_ITEMS }: { items?: { text: string; done: boolean }[] }) {
  return (
    <ul className="m-0 ps-[0.75em]">
      {items.map(item => (
        <li key={item.text} className="relative mb-[0.9em] flex items-start gap-[0.5em] leading-[1.8]">
          <span className="relative mt-[0.25em] size-[1.25em] shrink-0">
            <svg className="size-full" viewBox="0 0 24 24">
              <rect x={2} y={2} width={20} height={20} rx={4} strokeWidth={2} fill={item.done ? "var(--tau-accent)" : "transparent"} stroke={item.done ? "var(--tau-accent)" : "var(--tau-line-1)"} />
              {item.done && <path d="M7 13L10 16L17 9" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="var(--tau-ink-inverse)" />}
            </svg>
          </span>
          <div className="flex-1">{item.text}</div>
        </li>
      ))}
    </ul>
  );
}

/** 高亮块：highlight-block，配色写死（configs.ts） */
export function HighlightBlock() {
  return (
    <div className="rounded-[0.5em] p-[1.25em]" style={{ backgroundColor: "#f0f4ff", border: "0.125em solid #e1eaff" }}>
      <p className="font-semibold">核心观点</p>
      <p className="mt-1">工具不只是存放想法的地方——记录的方式，会反过来塑造想法本身。</p>
    </div>
  );
}

/** 详情块（展开态）：detail，箭头为 CaretRight 自绘 SVG */
export function DetailBlock() {
  return (
    <div className="relative rounded-[0.5em] border border-[var(--tau-line-1)] bg-[var(--tau-bg-sunken)] px-[1em] py-[1.25em]">
      <div className="mb-[0.625em] flex gap-[0.25em]">
        <div className="rotate-90">
          <svg viewBox="0 0 16 16" width="1em" height="1em" fill="currentColor">
            <path d="M6 3.5v9a.6.6 0 0 0 1 .45l5-4.5a.6.6 0 0 0 0-.9l-5-4.5A.6.6 0 0 0 6 3.5Z" />
          </svg>
        </div>
        <div>为什么间隔重复有效？</div>
      </div>
      <div className="pl-[1em]">每次在快要遗忘时回想，记忆的稳定性就会提升一截，下一次遗忘来得更晚。</div>
    </div>
  );
}

/** 视频：shared MediaPlayer/VideoPlayer 的暂停态（画面用渐变代替） */
export function VideoBlock() {
  return (
    <div className="rounded-tau-md bg-surface shadow-card relative mx-auto w-full overflow-hidden">
      <div className="flex flex-col">
        <div className="relative h-[300px] bg-black" style={{ background: "radial-gradient(circle at 30% 40%, #5c7d99 0%, #24384c 55%, #101820 100%)" }}>
          <span className="absolute inset-0 grid place-items-center">
            <span className="shadow-float bg-surface text-accent-text grid size-14 place-items-center rounded-full">
              <Play size={22} className="translate-x-0.5" fill="currentColor" />
            </span>
          </span>
        </div>
        <div className="relative flex h-12 shrink-0 items-center gap-0.5 px-2 pt-1">
          <div className="absolute inset-x-0 -top-1.5 flex h-4 items-center">
            <div className="bg-track absolute inset-x-0 h-1 overflow-hidden">
              <div className="bg-accent-soft absolute inset-y-0 left-0 w-[46%]" />
              <div className="bg-accent absolute inset-y-0 left-0 w-[18%]" />
            </div>
          </div>
          <span className="bg-accent text-ink-inverse grid size-[30px] place-items-center rounded-full">
            <Play size={14} fill="currentColor" className="translate-x-px" />
          </span>
          <span className="font-tau-mono text-tau-sm text-ink-2 ml-2 tabular-nums">
            <span className="text-ink-1 font-medium">2:14</span> / 12:30
          </span>
          <span className="text-ink-3 text-tau-sm ml-3.5 flex-1 truncate">Bilibili · 卡片笔记法十分钟入门</span>
          <span className="text-ink-2 grid size-[30px] place-items-center">
            <Volume2 size={15} />
          </span>
          <span className="font-tau-mono text-tau-sm text-ink-2 flex h-[26px] items-center px-2">1×</span>
          <span className="text-ink-2 grid size-[30px] place-items-center">
            <Maximize size={15} />
          </span>
        </div>
      </div>
    </div>
  );
}

/** 音频：shared MediaPlayer/AudioPlayer，带波形 */
export function AudioBlock() {
  const bars = Array.from({ length: 110 }, (_, i) => 18 + (Math.abs(Math.sin(i * 0.37) * 50 + Math.sin(i * 1.3) * 22) % 80));
  return (
    <div className="rounded-tau-md bg-surface shadow-card relative px-4 pt-3.5 pb-3">
      <div className="flex items-center gap-0.5">
        <span className="bg-accent text-ink-inverse grid size-[42px] place-items-center rounded-full">
          <Play size={18} className="translate-x-0.5" fill="currentColor" />
        </span>
        <div className="mx-3 min-w-0 flex-1">
          <div className="text-tau-body text-ink-1 truncate font-medium">读书会录音 · 延展心智</div>
          <div className="text-ink-3 text-tau-sm mt-0.5">42:18</div>
        </div>
        <span className="text-ink-2 grid size-[30px] place-items-center">
          <Volume2 size={15} />
        </span>
        <span className="font-tau-mono text-tau-sm text-ink-2 flex h-[26px] items-center px-2">1×</span>
      </div>
      <div className="mt-2.5 flex h-10 items-center gap-3 pr-1">
        <span className="font-tau-mono text-tau-sm text-ink-1 font-medium tabular-nums">8:05</span>
        <div className="relative h-10 flex-1">
          {[false, true].map(played => (
            <div key={String(played)} className="absolute inset-0 flex items-center gap-[1.5px]" style={played ? { clipPath: "inset(0 72% 0 0)" } : undefined}>
              {bars.map((h, i) => (
                <i key={i} className={clsx("min-w-px flex-1 rounded-full", played ? "bg-accent" : "bg-track")} style={{ height: `${h}%` }} />
              ))}
            </div>
          ))}
        </div>
        <span className="font-tau-mono text-tau-sm text-ink-2 tabular-nums">42:18</span>
      </div>
    </div>
  );
}

/** 乐谱（ABC）：abcjs 单色五线谱，按正文色手绘一小节 */
export function MusicBlock() {
  const lines = [0, 1, 2, 3, 4].map(i => 40 + i * 12);
  const notes = [
    { x: 150, y: 76 },
    { x: 205, y: 70 },
    { x: 260, y: 64 },
    { x: 315, y: 70 },
    { x: 390, y: 58 },
    { x: 445, y: 52 },
    { x: 500, y: 58 },
    { x: 555, y: 64 },
  ];
  return (
    <div className="flex items-center justify-center py-[10px]">
      <svg width={620} height={130} viewBox="0 0 620 130" fill="none" stroke="var(--tau-ink-1)">
        {lines.map(y => (
          <line key={y} x1={20} x2={600} y1={y} y2={y} strokeWidth={1} />
        ))}
        <text x={24} y={98} fontSize={72} fill="var(--tau-ink-1)" stroke="none" fontFamily="serif">
          𝄞
        </text>
        <text x={78} y={64} fontSize={26} fill="var(--tau-ink-1)" stroke="none" fontFamily="serif" fontWeight={700}>
          4
        </text>
        <text x={78} y={88} fontSize={26} fill="var(--tau-ink-1)" stroke="none" fontFamily="serif" fontWeight={700}>
          4
        </text>
        {notes.map((n, i) => (
          <g key={i}>
            <ellipse cx={n.x} cy={n.y} rx={7.5} ry={5.5} transform={`rotate(-20 ${n.x} ${n.y})`} fill="var(--tau-ink-1)" stroke="none" />
            <line x1={n.x + 7} x2={n.x + 7} y1={n.y} y2={n.y - 36} strokeWidth={1.4} />
          </g>
        ))}
        <line x1={355} x2={355} y1={40} y2={88} strokeWidth={1.2} />
        <line x1={598} x2={598} y1={40} y2={88} strokeWidth={1.2} />
      </svg>
    </div>
  );
}

/** 闪卡挖空：行内元素，内联样式摘自 FlashcardBlank.tsx */
export function ClozeBlock() {
  const blank = (text: string) => (
    <span style={{ backgroundColor: "var(--tau-info-soft)", padding: "1px 8px", borderRadius: 4, border: "1px solid var(--tau-info)", margin: "0 1px", fontWeight: 500, color: "var(--tau-info)" }}>
      {text}
      <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.7 }}>⚙️</span>
    </span>
  );
  return (
    <p className="leading-[2]">
      艾宾浩斯发现，学习后的 {blank("24 小时")} 内遗忘最快；在快要遗忘时{blank("主动回想")}，比反复重读更能留住记忆。
    </p>
  );
}

/** 文档待办：任务列表项首段里的项目 / 日期胶囊（doc-tasks/TokenChip） */
export function DocTasksBlock() {
  const group = (name: string, dot: string) => (
    <span className="bg-hover text-ink-2 rounded-[5px] px-[5px] py-px">
      <span className={clsx("mr-1 inline-block size-[7px] rounded-[2px] align-middle", dot)} />#{name}
    </span>
  );
  const date = (text: string, suffix: string, overdue = false) => (
    <span className={clsx("rounded-[5px] px-[5px] py-px", overdue ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent-text")}>
      {text}
      <span className="ml-1 text-[0.85em] opacity-75">{suffix}</span>
    </span>
  );
  const rows = [
    <>
      整理读书会纪要 {group("阅读", "bg-tag-2")} {date("2026年10月19日", "明天")}
    </>,
    <>
      把大纲扩写成初稿 {group("写作", "bg-accent")} {date("2026年10月22日", "周四")}
    </>,
    <>
      回复编辑的修改意见 {group("写作", "bg-accent")} {date("2026年10月16日", "", true)}
    </>,
  ];
  return (
    <ul className="m-0 ps-[0.75em]">
      {rows.map((row, i) => (
        <li key={i} className="relative mb-[0.9em] flex items-start gap-[0.5em] leading-[1.8]">
          <span className="relative mt-[0.25em] size-[1.25em] shrink-0">
            <svg className="size-full" viewBox="0 0 24 24">
              <rect x={2} y={2} width={20} height={20} rx={4} strokeWidth={2} fill="transparent" stroke="var(--tau-line-1)" />
            </svg>
          </span>
          <div className="flex-1">{row}</div>
        </li>
      ))}
    </ul>
  );
}

/** 白板引用块：嵌在文档里的只读白板（文档卡 + frame，结构同创作模式白板） */
export type BoardBlockContent = {
  frame: string;
  /** 画框里的两张卡与框外的两张卡：标题、骨架行数、标签 */
  inside: [string, number, string?][];
  outside: [string, number, string?][];
};

const BOARD_CONTENT: BoardBlockContent = {
  frame: "延展心智",
  inside: [
    ["环境参与思考", 3, "认知科学"],
    ["笔记是思考的现场", 4, "笔记方法"],
  ],
  outside: [
    ["卡片笔记法：一张卡只写一个观点", 3],
    ["写作即思考", 2],
  ],
};

export function WhiteboardBlock({ content = BOARD_CONTENT }: { content?: BoardBlockContent }) {
  const card = (x: number, y: number, title: string, lines: number, tag?: string) => (
    <div className="bg-surface shadow-paper absolute overflow-hidden rounded-[10px] px-3 py-2.5" style={{ left: x, top: y, width: 150, height: 120 }}>
      {tag && <span className="bg-hover text-ink-2 rounded-[4px] px-1.5 text-[9px] leading-4">#{tag}</span>}
      <div className="text-ink-1 mt-1 text-[11px] leading-snug font-semibold">{title}</div>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="bg-hover mt-1.5 h-1.5 rounded-full" style={{ width: `${[100, 88, 94, 70][i]}%` }} />
      ))}
    </div>
  );
  return (
    <div className="border-line-1 relative w-full overflow-hidden rounded-[0.5em] border border-solid">
      <div className="bg-surface relative h-[300px] w-full overflow-hidden">
        <div className="absolute rounded-[8px] border-2" style={{ left: 30, top: 54, width: 360, height: 216, borderColor: "#3b82f6", background: "rgba(59,130,246,0.1)" }} />
        <span className="absolute rounded-lg px-2 py-1 text-[12px] font-medium text-white" style={{ left: 30, top: 18, background: "#3b82f6" }}>
          {content.frame}
        </span>
        {card(50, 96, ...content.inside[0])}
        {card(220, 96, ...content.inside[1])}
        {card(440, 70, ...content.outside[0])}
        {card(440, 150 + 60, ...content.outside[1])}
        <svg className="absolute inset-0" width="100%" height="100%">
          <path d="M370 156 C 405 156, 405 130, 440 130" stroke="var(--tau-ink-3)" strokeWidth={1.5} fill="none" />
        </svg>
      </div>
      <div className="absolute top-[0.625em] right-[0.625em] rounded-[0.25em] bg-[rgba(38,38,38,0.6)] p-[0.25em] text-white">
        <Maximize size={16} />
      </div>
    </div>
  );
}

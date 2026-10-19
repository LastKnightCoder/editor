/**
 * 微信读书插件的书架页重建：结构摘自 tau-plugin-weread（ui/WeReadView 书架 / ConnectPanel 首次连接 / ShelfItems 在读卡与封面 / bits BookCover）。
 * 状态：connect（粘贴 API Key）→ checking（校验中）→ syncing（正在同步书架 x / y）→ shelf。
 * 封面不用微信读书的封面图，用插件自己的回落样式（按 id 派生的粉彩底 + 宋体书名）。
 */
import type { ReactNode } from "react";
import clsx from "clsx";
import { ArrowDownUp, BookOpen, ChevronDown, ExternalLink, KeyRound, LayoutGrid, ListFilter, RefreshCw, Search } from "lucide-react";
import { Button } from "@tau/ui";
import { PLUGINS } from "../../mock/deepwork";
import { InputLook, LoadingLook, SpinnerLook } from "../parts/FormLook";
import { Pressed } from "../parts/Dialog";

const SERIF = "font-['Songti_SC','STSong','Noto_Serif_SC','Source_Han_Serif_SC',serif]";
const W = PLUGINS.weread;

function coverTone(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 5) + 1;
}

function BookCover({ id, title, author, className, titleClassName, children }: { id: string; title: string; author: string; className?: string; titleClassName?: string; children?: ReactNode }) {
  const n = coverTone(id);
  return (
    <div
      className={clsx("shadow-lift relative aspect-[3/4.3] shrink-0 overflow-hidden rounded-[3px_6px_6px_3px]", className)}
      style={{ background: `var(--tau-tag-${n}-soft)`, color: `var(--tau-tag-${n})` }}
    >
      <div className="flex size-full flex-col px-[12%] pt-[14%] pb-[10%]">
        <span className={clsx(SERIF, "line-clamp-4 leading-[1.35] font-semibold", titleClassName)}>{title}</span>
        <span className="mt-auto line-clamp-1 text-[0.7em] opacity-80">{author}</span>
      </div>
      {children}
    </div>
  );
}

const fmtMinutes = (m: number) => (m < 60 ? `${m} 分钟` : m % 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${Math.floor(m / 60)} 小时`);

function FilterPill({ label, count, active }: { label: string; count?: number; active?: boolean }) {
  return (
    <span
      className={clsx(
        "flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] whitespace-nowrap",
        active ? "bg-selected text-accent-text border-transparent font-medium" : "border-line-1 text-ink-2"
      )}
    >
      {label}
      {count !== undefined && <span className={clsx("text-[10.5px] tabular-nums", active ? "opacity-75" : "text-ink-3")}>{count}</span>}
    </span>
  );
}

export type WeReadState = { kind: "connect"; key: string; pressSave?: boolean } | { kind: "checking"; key: string } | { kind: "syncing"; done: number } | { kind: "shelf"; appear: number };

export function WeReadPage({ state }: { state: WeReadState }) {
  const shelf = state.kind === "shelf";
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pt-1 pb-4">
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-none flex-col px-8 pt-5">
          <div className="flex h-10 flex-none items-center gap-3">
            <h1 className="text-tau-title-lg shrink-0 font-semibold tracking-[-0.01em]">微信读书</h1>
            <span className="text-tau-meta text-ink-2 w-0 flex-1 truncate whitespace-nowrap tabular-nums">
              {shelf && (
                <>
                  <b className="text-ink-1 font-semibold">{W.total}</b> 本书
                  <span className="text-ink-3 mx-1.5">·</span>累计阅读 <b className="text-ink-1 font-semibold">{fmtMinutes(W.minutes)}</b>
                  <span className="text-ink-3 mx-1.5">·</span>
                  <span className="text-ink-3">刚刚同步</span>
                </>
              )}
            </span>
            {shelf && <InputLook size="sm" lead={Search} placeholder="搜索书名或作者" className="w-[240px]" />}
            <span className="flex shrink-0 items-center">
              {state.kind === "syncing" ? (
                <Button variant="secondary" size="sm" className="rounded-r-none tabular-nums">
                  <SpinnerLook className="size-[13px]" />
                  同步中 {state.done}/{W.total}
                </Button>
              ) : (
                <Button variant="secondary" size="sm" icon={RefreshCw} className="rounded-r-none">
                  {state.kind === "connect" || state.kind === "checking" ? "连接微信读书" : "同步"}
                </Button>
              )}
              <Button variant="secondary" size="sm" className="-ml-px rounded-l-none px-1.5">
                <ChevronDown className="size-3.5" strokeWidth={1.75} />
              </Button>
            </span>
          </div>
          {shelf && (
            <div className="mt-2 flex h-10 flex-none items-center gap-1.5" style={{ opacity: Math.min(1, state.appear * 2) }}>
              <div className="flex w-0 flex-1 items-center gap-1.5 overflow-hidden py-1 pr-6">
                <FilterPill label="全部" count={W.total} active />
                {W.archives.map(a => (
                  <FilterPill key={a.name} label={a.name} count={a.count} />
                ))}
              </div>
              <Button variant="ghost" size="sm" icon={ListFilter} className="shrink-0">
                全部状态
                <ChevronDown className="text-ink-3 size-3.5" strokeWidth={1.75} />
              </Button>
              <Button variant="ghost" size="sm" icon={ArrowDownUp} className="shrink-0">
                最近阅读
                <ChevronDown className="text-ink-3 size-3.5" strokeWidth={1.75} />
              </Button>
              <Button variant="ghost" size="sm" icon={LayoutGrid} className="shrink-0">
                封面
                <ChevronDown className="text-ink-3 size-3.5" strokeWidth={1.75} />
              </Button>
            </div>
          )}
        </div>
        <div className="mb-4 min-h-0 flex-1 overflow-hidden pt-3 pr-[26px] pb-4 pl-8">
          {state.kind === "connect" && <ConnectPanel apiKey={state.key} pressSave={state.pressSave} />}
          {state.kind === "checking" && <LoadingLook label="正在校验 API Key…" />}
          {state.kind === "syncing" && <LoadingLook label={`正在同步书架 ${state.done} / ${W.total}`} />}
          {shelf && <Shelf appear={state.appear} />}
        </div>
      </div>
    </div>
  );
}

function ConnectPanel({ apiKey, pressSave }: { apiKey: string; pressSave?: boolean }) {
  return (
    <div className="flex flex-col items-center px-5 py-20 text-center">
      <span className="bg-accent-soft text-accent-text mb-3.5 grid size-[52px] place-items-center rounded-[16px]">
        <BookOpen className="size-6" strokeWidth={1.5} />
      </span>
      <p className="text-ink-1 text-[15px] font-semibold">把微信读书的书架和笔记带进来</p>
      <p className="text-tau-meta text-ink-2 mt-1.5 max-w-[42ch]">连接后同步书架，打开一本书时再拉取它的划线、想法和章节。数据只存在当前工作区。</p>
      <ol className="text-tau-meta text-ink-2 mt-5 flex flex-col gap-2 text-left">
        <li className="flex items-center gap-2.5">
          <Step n={1} />
          在微信读书「AI 技能」页获取 API Key
          <span className="text-accent-text inline-flex items-center gap-1 font-medium">
            打开获取页
            <ExternalLink className="size-3" strokeWidth={1.75} />
          </span>
        </li>
        <li className="flex items-center gap-2.5">
          <Step n={2} />
          粘贴到下方，校验通过后自动开始首次同步
        </li>
      </ol>
      <div className="mt-5 flex w-full max-w-[420px] gap-2">
        <InputLook lead={KeyRound} value={apiKey} placeholder="粘贴 API Key" password focused={!!apiKey} className="flex-1" />
        <Pressed on={!!pressSave}>
          <Button variant="primary" className={clsx("shrink-0", !apiKey && "opacity-55")}>
            保存并同步
          </Button>
        </Pressed>
      </div>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return <span className="bg-accent-soft text-accent-text grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold">{n}</span>;
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <h2 className="mb-3 flex items-baseline gap-2 px-0.5 text-[13.5px] font-semibold">
      {title}
      {hint && <small className="text-tau-sm text-ink-3 font-normal tabular-nums">{hint}</small>}
    </h2>
  );
}

/** 书架：在读两本 + 全部封面网格；appear 让封面逐个落下 */
function Shelf({ appear }: { appear: number }) {
  const step = (i: number, n: number) => {
    const t = Math.min(1, Math.max(0, appear * (n + 4) - i) / 4);
    return { opacity: t, transform: `translateY(${(1 - t) * 10}px)` };
  };
  return (
    <>
      <section className="mb-6">
        <SectionTitle title="在读" hint="最近读过的书" />
        <div className="-mx-3.5 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-1">
          {W.reading.map((book, i) => (
            <div key={book.id} className="flex min-w-0 gap-3.5 rounded-[var(--tau-radius-lg)] p-3.5 text-left" style={step(i, 18)}>
              <BookCover id={book.id} title={book.title} author={book.author} className="w-[64px] self-start" titleClassName="text-[9px]" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5">
                <span className="truncate text-[14px] font-semibold">{book.title}</span>
                <span className="text-tau-sm text-ink-3 truncate">{book.author}</span>
                <span className="text-tau-sm text-ink-2 mt-1 truncate tabular-nums">
                  最近阅读 {book.last}
                  <span className="text-ink-3"> · 累计 {fmtMinutes(book.minutes)}</span>
                </span>
                <span className="text-tau-micro text-ink-3 mt-auto flex items-center gap-2 tabular-nums">
                  <span className="bg-line-1 h-[3px] flex-1 overflow-hidden rounded-full">
                    <span className="bg-accent block h-full rounded-full" style={{ width: `${book.progress}%` }} />
                  </span>
                  {book.progress}%
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>
      <section>
        <SectionTitle title="全部" hint={`${W.total} 本 · 按最近阅读`} />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-x-[22px] gap-y-6">
          {W.books.map((book, i) => (
            <div key={book.id} className="min-w-0 text-left" style={step(i + 2, 18)}>
              <BookCover id={book.id} title={book.title} author={book.author} titleClassName="text-[13px]" className="w-full">
                {book.status === "reading" && (
                  <span className="bg-ink-1/20 absolute inset-x-0 bottom-0 h-[3px]">
                    <span className="bg-accent block h-full" style={{ width: `${book.progress}%` }} />
                  </span>
                )}
              </BookCover>
              <span className="mt-2.5 line-clamp-2 text-[13px] leading-[1.4] font-medium">{book.title}</span>
              <span className="text-tau-micro text-ink-3 mt-0.5 flex gap-2 tabular-nums">
                {book.status === "finished" ? <span className="text-ok">读完</span> : book.status === "reading" ? <span>{book.progress}%</span> : null}
                {book.notes > 0 ? <span>{book.notes} 划线</span> : <span className="truncate">{book.author}</span>}
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

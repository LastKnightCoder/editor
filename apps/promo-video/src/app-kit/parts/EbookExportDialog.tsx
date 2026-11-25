/**
 * 视频笔记 · 「AI 导出电子书」弹窗重建，结构与文案摘自 components/VideoNotePanel/VideoNoteEpubExportModal.tsx（880×760 工作台型弹窗）。
 * 两步：① 选写作风格 → 生成草稿（草稿逐段流出到编辑区）；② 导出设置（封面、书名、作者、语言、简介、导出格式）。
 * 视频里不需要交互：步骤、选中项、草稿流出进度、按下态都由调用方按帧给。
 */
import clsx from "clsx";
import { ArrowLeft, ArrowRight, BookOpen, Check, Download, FileText, Sparkles, Square } from "lucide-react";
import { Button } from "@tau/ui";
import { DialogFrame, Pressed } from "./Dialog";
import { SpinnerLook } from "./FormLook";
import { LectureCover, SLIDE_COLORS } from "./LectureSlide";
import { HEADING_SIZE } from "../doc/LiveDoc";
import type { SlideKind } from "../../mock/videonote";

/** 写作风格（STYLE_OPTIONS） */
export const EBOOK_STYLES = [
  { label: "杂志长文", description: "叙事流畅，兼顾信息密度" },
  { label: "学术总结", description: "结构严谨，论证与结论清晰" },
  { label: "轻松博客", description: "语气亲切，段落短而轻快" },
  { label: "技术文档", description: "术语统一，步骤便于检索" },
];

const FORMATS = [
  { label: "EPUB", icon: BookOpen, description: "电子书格式，带封面与章节导航" },
  { label: "PDF", icon: FileText, description: "适合打印与阅读，自适应分页" },
];

const STEPS = [
  { label: "生成草稿", subtitle: "选择写作风格，AI 把转录改写成可编辑的电子书草稿" },
  { label: "导出设置", subtitle: "填写书籍信息、挑选封面，选择导出格式" },
];

/** 草稿里的一块：标题或段落 */
export type DraftBlock = { kind: "h1" | "h2" | "p"; text: string };

const FIELD_LABEL = "text-ink-2 text-[12px]";
const INPUT = "border-line-1 bg-surface text-ink-1 rounded-tau-sm flex h-[34px] items-center border px-3 text-tau-body";

function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="m-0 mr-auto flex list-none items-center gap-2 p-0">
      {STEPS.map((step, index) => {
        const active = index === current;
        const done = index < current;
        return (
          <li key={step.label} className="flex items-center gap-2">
            {index > 0 && <span className={clsx("h-px w-5", done || active ? "bg-accent" : "bg-line-1")} />}
            <span className={clsx("flex items-center gap-1.5 text-[12px]", active ? "text-ink-1 font-medium" : "text-ink-3")}>
              <span
                className={clsx(
                  "grid size-[18px] place-items-center rounded-full text-[10.5px] font-semibold",
                  active ? "bg-accent text-ink-inverse" : done ? "bg-accent-soft text-accent-text" : "bg-sunken text-ink-3"
                )}
              >
                {done ? <Check className="size-[11px]" strokeWidth={2.5} /> : index + 1}
              </span>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * 草稿：按 shown（已流出的字数）逐字露出，最后一块后面跟着光标。还没流出的字照样排版、只是不可见，
 * 草稿区的高度从头到尾不变，跟着往下滚时不会因为换行一跳一跳
 */
function Draft({ blocks, shown, streaming }: { blocks: DraftBlock[]; shown: number; streaming: boolean }) {
  let left = shown;
  const out = blocks.map((block, i) => {
    const chars = [...block.text];
    const count = Math.max(0, Math.min(chars.length, left));
    const visible = chars.slice(0, count).join("");
    const rest = chars.slice(count).join("");
    const last = left > 0 && left <= chars.length;
    left -= chars.length;
    const caret = streaming && last ? <i className="bg-accent ml-px inline-block h-[1.05em] w-[2px] translate-y-[0.16em]" /> : null;
    const content = (
      <>
        {visible}
        {caret}
        {rest && <span className="invisible">{rest}</span>}
      </>
    );
    if (block.kind === "h1")
      return (
        <h1 key={i} className={clsx(HEADING_SIZE[1], "text-ink-1 mb-[0.6em] font-bold")}>
          {content}
        </h1>
      );
    if (block.kind === "h2")
      return (
        <h2 key={i} className="text-ink-1 mt-[1em] mb-[0.4em] text-[1.3em] font-semibold">
          {content}
        </h2>
      );
    return (
      <p key={i} className="text-ink-1 mb-[0.9em]">
        {content}
      </p>
    );
  });
  return <>{out}</>;
}

export function EbookExportDialog({
  appear,
  context,
  step,
  style,
  hoverStyle,
  draft,
  shown,
  streaming,
  draftScroll = 0,
  book,
  pressed,
}: {
  appear: number;
  /** 标题旁的上下文徽标：视频标题 */
  context: string;
  /** 0 = 生成草稿，1 = 导出设置 */
  step: 0 | 1;
  /** 选中的写作风格下标 */
  style: number;
  hoverStyle?: number;
  draft: DraftBlock[];
  /** 草稿已流出的字数；0 时编辑区是占位 */
  shown: number;
  streaming: boolean;
  /** 草稿区滚过的像素 */
  draftScroll?: number;
  /** 第二步的书籍信息 */
  book?: { title: string; author: string; description: string; cover: SlideKind; focused?: boolean; selected?: boolean };
  pressed?: "generate" | "next" | "export";
}) {
  const hasDraft = shown > 0 && !streaming;
  const status = streaming ? (shown <= 0 ? "等待模型响应…" : "正在生成草稿…") : hasDraft ? "草稿已就绪，可直接修改" : "选好风格后生成草稿，也可以直接在这里写";
  return (
    <DialogFrame
      title="AI 导出电子书"
      subtitle={STEPS[step].subtitle}
      icon={<BookOpen />}
      context={context}
      width={880}
      height={760}
      appear={appear}
      footer={
        step === 0 ? (
          <>
            <StepIndicator current={0} />
            <Button variant="secondary" size="sm">
              取消
            </Button>
            <span data-hit="ebook:next">
              <Pressed on={pressed === "next"}>
                <Button variant="primary" size="sm" disabled={!hasDraft}>
                  下一步
                  <ArrowRight size={15} strokeWidth={1.75} className="-mr-0.5 shrink-0" />
                </Button>
              </Pressed>
            </span>
          </>
        ) : (
          <>
            <StepIndicator current={1} />
            <Button variant="secondary" size="sm" icon={ArrowLeft}>
              上一步
            </Button>
            <span data-hit="ebook:export">
              <Pressed on={pressed === "export"}>
                <Button variant="primary" size="sm" icon={Download}>
                  导出 EPUB
                </Button>
              </Pressed>
            </span>
          </>
        )
      }
    >
      {step === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 pt-4 pb-5">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className={FIELD_LABEL}>写作风格</span>
            <div className="grid grid-cols-4 gap-2">
              {EBOOK_STYLES.map((option, i) => {
                const active = i === style;
                return (
                  <span
                    key={option.label}
                    data-hit={`ebook:style:${i}`}
                    className={clsx(
                      "rounded-[10px] border px-3 py-2 text-left",
                      active ? "border-accent bg-accent-soft" : clsx("border-line-1", hoverStyle === i && "bg-hover"),
                      streaming && "opacity-55"
                    )}
                  >
                    <span className={clsx("block text-[13px] font-semibold", active ? "text-accent-text" : "text-ink-1")}>{option.label}</span>
                    <span className="text-ink-3 mt-0.5 block text-[11.5px] leading-[1.5]">{option.description}</span>
                  </span>
                );
              })}
            </div>
          </div>
          <div className="border-line-1 rounded-tau-md flex min-h-0 flex-1 flex-col overflow-hidden border">
            <div className="border-line-2 flex h-10 shrink-0 items-center gap-2 border-b pr-1.5 pl-3.5">
              {streaming ? <SpinnerLook className="size-3.5" /> : <span className={clsx("size-[6px] rounded-full", hasDraft ? "bg-ok" : "bg-line-1")} />}
              <span className="text-tau-meta text-ink-3 min-w-0 flex-1 truncate">{status}</span>
              {streaming ? (
                <Button variant="ghost" size="sm" icon={Square}>
                  停止生成
                </Button>
              ) : (
                <span data-hit="ebook:generate">
                  <Pressed on={pressed === "generate"}>
                    <Button variant="soft" size="sm" icon={Sparkles}>
                      {hasDraft ? "重新生成" : "生成草稿"}
                    </Button>
                  </Pressed>
                </span>
              )}
            </div>
            <div data-hit="ebook:draft-viewport" className="min-h-0 flex-1 overflow-hidden">
              <div data-hit="ebook:draft" className="pt-5 pr-[26px] pb-8 pl-8 text-[16px] leading-[1.75]" style={{ transform: `translateY(${-draftScroll}px)` }}>
                {shown > 0 ? <Draft blocks={draft} shown={shown} streaming={streaming} /> : <p className="text-ink-3">草稿会在这里逐步出现</p>}
              </div>
            </div>
          </div>
        </div>
      ) : book ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="grid grid-cols-[196px_minmax(0,1fr)] gap-7 pt-4 pr-[18px] pb-5 pl-6">
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex min-h-[20px] items-center gap-2">
                  <span className={FIELD_LABEL}>封面</span>
                  <span className="text-ink-3 text-[11.5px]">可选</span>
                </div>
                <BookCover title={book.title} author={book.author} cover={book.cover} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-ink-3 text-[11.5px]">草稿中的图片</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {(["diagram", "modes"] as SlideKind[]).map((kind, i) => (
                    <span key={kind} className={clsx("relative aspect-square overflow-hidden rounded-[7px] border", i === 0 ? "border-accent shadow-[0_0_0_1px_var(--tau-accent)]" : "border-line-1")}>
                      <LectureCover kind={kind} />
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <Field label="书名" required>
                <span data-hit="ebook:title" className={clsx(INPUT, book.focused && "border-accent shadow-[var(--tau-focus-ring)]")}>
                  <span className={clsx("truncate", book.selected && "bg-[color-mix(in_srgb,var(--tau-accent)_24%,transparent)]")}>{book.title}</span>
                  {book.focused && <i className="bg-ink-1 ml-px inline-block h-[1.1em] w-[1.5px] shrink-0" />}
                </span>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="作者" required>
                  <span className={INPUT}>{book.author}</span>
                </Field>
                <Field label="语言" hint="如 zh-CN / en">
                  <span className={INPUT}>zh-CN</span>
                </Field>
              </div>
              <Field label="简介" hint="可选">
                <span className={clsx(INPUT, "h-auto min-h-[78px] items-start py-2 leading-[1.6]")}>{book.description}</span>
              </Field>
              <Field label="导出格式" hint="可多选">
                <div className="grid grid-cols-2 gap-2">
                  {FORMATS.map((option, i) => {
                    const active = i === 0;
                    const Icon = option.icon;
                    return (
                      <span key={option.label} className={clsx("flex items-start gap-2.5 rounded-[10px] border px-3 py-2.5 text-left", active ? "border-accent bg-accent-soft" : "border-line-1")}>
                        <Icon className={clsx("mt-px size-4 shrink-0", active ? "text-accent-text" : "text-ink-3")} strokeWidth={1.75} />
                        <span className="min-w-0 flex-1">
                          <span className={clsx("block text-[13px] font-semibold", active ? "text-accent-text" : "text-ink-1")}>{option.label}</span>
                          <span className="text-ink-3 mt-0.5 block text-[11.5px] leading-[1.5]">{option.description}</span>
                        </span>
                        <span className={clsx("mt-px grid size-4 shrink-0 place-items-center rounded-[5px] border", active ? "border-accent bg-accent text-ink-inverse" : "border-line-1")}>
                          {active && <Check className="size-3" strokeWidth={2.5} />}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </Field>
            </div>
          </div>
        </div>
      ) : null}
    </DialogFrame>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-h-[20px] items-center gap-2">
        <span className={FIELD_LABEL}>
          {label}
          {required && <span className="text-danger ml-0.5">*</span>}
        </span>
        {hint && <span className="text-ink-3 text-[11.5px]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * 封面（3:4）：选中的是草稿里的那张示意图。片里导出后这本书也用同一个组件画（书架上的成品），
 * 所以图上叠了书名和作者，像一本真的书。
 */
export function BookCover({ title, author, cover, className }: { title: string; author: string; cover: SlideKind; className?: string }) {
  return (
    <div className={clsx("rounded-tau-md border-line-1 relative aspect-[3/4] w-full overflow-hidden border", className)} style={{ containerType: "size", background: SLIDE_COLORS.paper }}>
      <div className="absolute inset-x-0 top-[34%] h-[30%]">
        <LectureCover kind={cover} />
      </div>
      <div className="absolute inset-x-[9%] top-[8%]" style={{ color: SLIDE_COLORS.ink, fontSize: "7.6cqw", fontWeight: 700, lineHeight: 1.3 }}>
        {title}
      </div>
      <div className="absolute inset-x-[9%] bottom-[8%] flex items-center justify-between" style={{ color: SLIDE_COLORS.muted, fontSize: "4.6cqw" }}>
        <span>{author}</span>
        <span className="h-[3px] w-[18%] rounded-full" style={{ background: SLIDE_COLORS.accent }} />
      </div>
    </div>
  );
}

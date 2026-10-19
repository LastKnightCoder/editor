/**
 * 卡片详情 + 所见即所得 Markdown 打字演示。
 * 结构摘自 features/cards/views/CardDetailView.tsx；正文元素类名摘自 editor-extensions（header / blockquote /
 * text-formatting / list / content-link）。t 为本组件局部帧，脚本见 CARD_SCRIPT。
 */
import type { ReactNode } from "react";
import clsx from "clsx";
import { FileText, Layers, MoreHorizontal, Plus, Sparkles, Waypoints } from "lucide-react";
import { caretOn, typed } from "../../kit/typing";
import { CARD_SCRIPT as S } from "../../mock/day";

const CARET = <i className="bg-ink-1 ml-px inline-block h-[1.15em] w-[1.5px] translate-y-[0.2em]" />;

/** 一段「先打 Markdown 记号、再成型」的文字：记号以淡墨显示 hold 帧后消失 */
function markdownBlock(t: number, start: number, mark: string, text: string, perChar = 3) {
  const markTyped = typed(mark, t, start, 4);
  const formed = t >= start + mark.length * 4 + 10;
  const body = typed(text, t, start + mark.length * 4 + 14, perChar);
  return { started: t >= start, markText: markTyped.text, formed, body };
}

/** 打字脚本里由文字长度推出的时刻：加粗开始、加粗结束、开始输入 [[ */
export function cardTimings() {
  const boldStart = S.claim.at + [...S.claim.before].length * 3;
  const afterBold = boldStart + 2 * 4 + 14 + [...S.claim.bold].length * 3 + 6;
  const linkAt = afterBold + [...S.claim.middle].length * 3 + 4;
  return { boldStart, afterBold, linkAt };
}

export function CardEditorPage({ t, linkPicker = 0 }: { t: number; linkPicker?: number }) {
  const h = markdownBlock(t, S.heading.at, "## ", S.heading.text);
  const p1 = typed(S.lead.text, t, S.lead.at, 3);
  const q = markdownBlock(t, S.quote.at, "> ", S.quote.text, 2);
  const p2a = typed(S.claim.before, t, S.claim.at, 3);
  const { boldStart, afterBold, linkAt } = cardTimings();
  const bold = markdownBlock(t, boldStart, "**", S.claim.bold, 3);
  const p2b = typed(S.claim.middle, t, afterBold, 3);
  const linkTyped = typed("[[卡片", t, linkAt, 5);
  const linked = t >= S.claim.linkedAt;
  const p2c = typed(S.claim.after, t, S.claim.linkedAt + 8, 3);
  const list = S.list.items.map((item, i) => typed(item, t, S.list.at + i * 70, 3));
  const listStarted = t >= S.list.at;

  // 光标落在最后一个正在输入的块上
  const caretAt = listStarted ? "list" : t >= S.claim.at ? "claim" : t >= S.quote.at ? "quote" : t >= S.lead.at ? "lead" : "heading";
  const typing = Math.floor(t) % 3 !== 0;
  const caret = caretOn(t, typing) ? CARET : null;
  const words = [h.body.count, p1.count, q.body.count, p2a.count, bold.body.count, p2b.count, linked ? 7 : 0, p2c.count, ...list.map(l => l.count)].reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pt-1 pb-4">
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="my-4 min-h-0 flex-1 overflow-hidden">
          <div className="grid grid-cols-[1fr_minmax(0,640px)_1fr] items-start px-[26px] pt-6 pb-8">
            <article className="col-start-2 min-w-0">
              <div className="mb-5 flex items-center gap-2.5">
                <span className="text-tau-meta text-ink-3 min-w-0 truncate tabular-nums">创建于 10月17日 · 最后修改 刚刚 · {words} 字</span>
                <span className="text-tau-meta text-ink-2 inline-flex h-[22px] shrink-0 items-center gap-[5px] rounded-full px-2 tabular-nums">
                  <Waypoints className="size-[13px]" strokeWidth={1.75} />
                  {linked ? 3 : 2} 处关联
                </span>
                <span className="text-tau-meta text-ink-2 inline-flex h-[22px] shrink-0 items-center gap-[5px] rounded-full px-2">
                  <Sparkles className="size-[13px]" strokeWidth={1.75} />
                  AI 洞见
                </span>
                <span className="ml-auto flex items-center gap-1">
                  <span className="text-ink-3 rounded-tau-sm grid size-[26px] place-items-center">
                    <MoreHorizontal className="size-4" strokeWidth={1.75} />
                  </span>
                </span>
              </div>

              <div className="min-h-[80px] text-[15px] leading-[1.65]">
                {h.started && (
                  <div className="relative mt-0">
                    {h.formed ? (
                      <h2 className="relative mb-[1em] flex w-fit flex-wrap items-center gap-[0.25em] text-[1.75em] leading-[1.5] font-bold">
                        <span>
                          {h.body.text}
                          {caretAt === "heading" && caret}
                        </span>
                      </h2>
                    ) : (
                      <p className="relative mb-[1.25em]">
                        <span className="text-ink-3">{h.markText}</span>
                        {caret}
                      </p>
                    )}
                  </div>
                )}
                {t >= S.lead.at && (
                  <p className="relative mb-[1.25em]">
                    {p1.text}
                    {caretAt === "lead" && caret}
                  </p>
                )}
                {q.started &&
                  (q.formed ? (
                    <div className="relative mb-[1.25em]">
                      <div className="relative pl-[2em] text-[var(--tau-ink-1)]">
                        <span
                          className="text-accent pointer-events-none absolute -top-[0.12em] -left-[0.02em] text-[2.9em] leading-none opacity-55 select-none"
                          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                        >
                          “
                        </span>
                        <span className="absolute top-[1.6em] bottom-[0.35em] left-[0.5em] w-[2px] rounded-full bg-[color-mix(in_srgb,var(--tau-ink-1)_20%,transparent)]" />
                        <p className="relative">
                          {q.body.text}
                          {caretAt === "quote" && caret}
                        </p>
                        {q.body.done && (
                          <p className="text-ink-3 mt-1 text-[0.85em]">
                            —— <span className="text-accent-text decoration-accent/40 underline decoration-dotted decoration-[1.5px] underline-offset-[3px]">延展心智 · 第 112 页</span>
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="relative mb-[1.25em]">
                      <span className="text-ink-3">{q.markText}</span>
                      {caret}
                    </p>
                  ))}
                {t >= S.claim.at && (
                  <p className="relative mb-[1.25em]">
                    {p2a.text}
                    {bold.started && (bold.formed ? <span className="font-bold">{bold.body.text}</span> : <span className="text-ink-3">{bold.markText}</span>)}
                    {p2b.text}
                    {t >= linkAt && !linked && <span className="text-ink-3">{linkTyped.text}</span>}
                    {linked && (
                      <span className="text-accent-text underline decoration-[color:color-mix(in_srgb,var(--tau-accent)_38%,transparent)] decoration-dotted decoration-[1.5px] underline-offset-[3px]">
                        {S.claim.link}
                      </span>
                    )}
                    {p2c.text}
                    {caretAt === "claim" && caret}
                    {linkPicker > 0 && !linked && <LinkPicker open={linkPicker} />}
                  </p>
                )}
                {listStarted && (
                  <ul className="m-0 ps-[2.5em]">
                    {list.map((item, i) =>
                      t >= S.list.at + i * 70 ? (
                        <li
                          key={i}
                          className="relative mb-[0.6em] list-none pl-[0.5em] before:absolute before:top-[0.7em] before:-left-[1em] before:h-[0.35em] before:w-[0.35em] before:rounded-full before:bg-[var(--tau-accent)]"
                        >
                          {item.text}
                          {caretAt === "list" && i === list.length - 1 && caret}
                          {caretAt === "list" && i < list.length - 1 && t < S.list.at + (i + 1) * 70 && caret}
                        </li>
                      ) : null
                    )}
                  </ul>
                )}
              </div>

              <div className="border-line-2 mt-[34px] flex flex-wrap items-center gap-1.5 border-t pt-[18px]">
                {S.tags.map(tag => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
                <Tag>
                  <Plus className="size-3" strokeWidth={2} />
                  添加标签
                </Tag>
              </div>
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="text-tau-sm border-line-1 bg-surface text-ink-2 inline-flex h-[22px] max-w-full items-center gap-1.5 rounded-full border px-[9px] leading-none">{children}</span>;
}

/** 输入 [[ 后弹出的内容选择浮层（视觉沿用 AnchoredPanel 浮层：surface + shadow-float） */
function LinkPicker({ open }: { open: number }) {
  const items = [
    { icon: Layers, title: "卡片笔记法：一张卡只写一个观点", meta: "卡片 · 2 年前" },
    { icon: Layers, title: "卡片盒是一台会思考的机器", meta: "卡片 · 1 年前" },
    { icon: FileText, title: "我的第二大脑搭建记录", meta: "文章 · 3 天前" },
  ];
  return (
    <span
      className="bg-surface shadow-float rounded-tau-md absolute top-[calc(100%+6px)] left-[120px] z-10 block w-[340px] p-1.5"
      style={{ opacity: Math.min(1, open * 2), transform: `translateY(${(1 - Math.min(1, open * 2)) * 6}px)` }}
    >
      {items.map((item, i) => (
        <span key={item.title} className={clsx("text-tau-meta flex h-9 items-center gap-2.5 rounded-[7px] px-2.5", i === 0 ? "bg-selected text-ink-1" : "text-ink-2")}>
          <item.icon size={14} strokeWidth={1.75} className="text-ink-3 shrink-0" />
          <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
          <span className="text-ink-3 text-tau-tiny shrink-0">{item.meta}</span>
        </span>
      ))}
    </span>
  );
}

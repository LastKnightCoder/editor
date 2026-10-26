/**
 * PDF 划线批注：点一句话代替选中文字，弹出浮动工具条，选颜色高亮，或「写笔记」在页边留一条批注；
 * 左侧「标注」计数随之增加。工具条按 features/pdfs/reader 的 FloatToolbar、NoteCard 重建。
 */
import { useState } from "react";
import { Copy, MessageSquareText, Sparkles } from "lucide-react";
import { cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

const COLORS = [
  { name: "黄", swatch: "bg-tag-4", mark: "bg-tag-4-soft" },
  { name: "红", swatch: "bg-danger", mark: "bg-danger-soft" },
  { name: "绿", swatch: "bg-ok", mark: "bg-ok-soft" },
  { name: "蓝", swatch: "bg-info", mark: "bg-info-soft" },
  { name: "紫", swatch: "bg-tag-3", mark: "bg-tag-3-soft" },
];

const SENTENCES = [
  "心流是一种全神贯注的状态，",
  "人在其中会忘记时间，甚至忘记自我。",
  "它最常出现在挑战与能力恰好匹配的时候：",
  "太难让人焦虑，太简单又让人无聊。",
  "要进入心流，目标必须清晰，反馈必须及时。",
  "这也解释了为什么游戏比工作更容易让人投入。",
];

interface Mark {
  color: number;
  note?: string;
}

export default function HighlightDemo() {
  const [marks, setMarks] = useState<Record<number, Mark>>({ 1: { color: 0 } });
  const [active, setActive] = useState<number | null>(null);
  const [writing, setWriting] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  const count = Object.keys(marks).length;

  return (
    <AppWindow active="pdfs" crumb="PDF / 心流" height={430} paper={false}>
      <div className="flex h-full gap-3">
        <aside className="bg-surface shadow-paper w-[150px] shrink-0 rounded-[12px] px-3 pt-3 max-sm:hidden">
          <div className="text-tau-sm border-line-1 flex gap-3 border-b pb-2">
            <span className="text-ink-3">目录</span>
            <span className="text-ink-1 relative font-medium">
              标注 <b className="text-accent-text tabular-nums">{count}</b>
              <i className="bg-accent absolute inset-x-0 -bottom-2 h-0.5 rounded-full" />
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {Object.entries(marks).map(([index, mark]) => (
              <div
                key={index}
                className="animate-doc-in border-line-1 rounded-[8px] border px-2 py-1.5 text-[11.5px] leading-snug"
              >
                <span
                  className={cn("mr-1 inline-block size-2 rounded-full", COLORS[mark.color].swatch)}
                />
                <span className="text-ink-2 line-clamp-2">{SENTENCES[Number(index)]}</span>
                {mark.note && <p className="text-ink-1 mt-1 line-clamp-2">{mark.note}</p>}
                <p className="text-ink-3 mt-0.5 text-[10.5px]">第 3 页</p>
              </div>
            ))}
          </div>
        </aside>
        <div className="bg-page relative flex min-w-0 flex-1 justify-center overflow-hidden rounded-[12px]">
          <div className="bg-surface shadow-card relative mt-5 flex w-[min(560px,100%)] gap-0 rounded-[2px]">
            <div className="min-w-0 flex-1 px-9 pt-8 pb-6 font-serif max-sm:px-5">
              <p className="text-ink-3 mb-4 text-[11px] tracking-[0.2em]">第三章 · 心流的条件</p>
              <p className="text-[15px] leading-[2]">
                {SENTENCES.map((sentence, index) => {
                  const mark = marks[index];
                  return (
                    <span key={index} className="relative">
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={() => setActive(active === index ? null : index)}
                        onKeyDown={event => event.key === "Enter" && setActive(index)}
                        className={cn(
                          "cursor-text rounded-[2px] transition-colors duration-150",
                          mark ? COLORS[mark.color].mark : "hover:bg-hover",
                          active === index && !mark && "bg-info-soft"
                        )}
                      >
                        {sentence}
                      </span>
                      {active === index && (
                        <span className="bg-surface shadow-float rounded-tau-md animate-doc-in absolute bottom-full left-0 z-10 mb-1.5 flex h-9 items-center gap-0.5 px-1.5 font-sans whitespace-nowrap">
                          {COLORS.map((color, colorIndex) => (
                            <button
                              key={color.name}
                              type="button"
                              aria-label={`${color.name}色高亮`}
                              onClick={() => {
                                setMarks(map => ({
                                  ...map,
                                  [index]: { ...map[index], color: colorIndex },
                                }));
                                setActive(null);
                              }}
                              className="hover:bg-hover grid size-7 place-items-center rounded-[7px]"
                            >
                              <i
                                className={cn(
                                  "size-3.5 rounded-full",
                                  color.swatch,
                                  mark?.color === colorIndex && "ring-ink-1 ring-2 ring-offset-1"
                                )}
                              />
                            </button>
                          ))}
                          <i className="bg-line-1 mx-1 h-4 w-px" />
                          <button
                            type="button"
                            onClick={() => {
                              setMarks(map => ({
                                ...map,
                                [index]: {
                                  color: map[index]?.color ?? 0,
                                  note: map[index]?.note,
                                },
                              }));
                              setWriting(index);
                              setDraft(marks[index]?.note ?? "");
                              setActive(null);
                            }}
                            className="text-ink-2 hover:bg-hover flex h-7 items-center gap-1 rounded-[7px] px-2 text-[12px]"
                          >
                            <MessageSquareText className="size-3.5" strokeWidth={1.75} />
                            写笔记
                          </button>
                          <span className="text-accent-text hover:bg-accent-soft flex h-7 items-center gap-1 rounded-[7px] px-2 text-[12px]">
                            <Sparkles className="size-3.5" strokeWidth={1.75} />
                            问 AI
                          </span>
                          <span className="text-ink-2 grid size-7 place-items-center">
                            <Copy className="size-3.5" strokeWidth={1.75} />
                          </span>
                        </span>
                      )}
                    </span>
                  );
                })}
              </p>
            </div>
            <div className="border-line-1 w-[150px] shrink-0 border-l border-dashed px-2.5 pt-16 max-md:hidden">
              {writing !== null ? (
                <div className="bg-surface border-line-1 shadow-card animate-doc-in rounded-[10px] border p-2.5 font-sans">
                  <p className="border-accent text-ink-2 line-clamp-2 border-l-2 pl-2 text-[11px]">
                    {SENTENCES[writing]}
                  </p>
                  <textarea
                    autoFocus
                    value={draft}
                    onChange={event => setDraft(event.target.value)}
                    placeholder="写下你的想法…"
                    rows={3}
                    className="placeholder:text-ink-3 mt-2 w-full resize-none bg-transparent text-[12px] outline-none select-text"
                  />
                  <div className="flex justify-end gap-1 text-[11.5px]">
                    <button
                      type="button"
                      onClick={() => setWriting(null)}
                      className="text-ink-2 hover:bg-hover rounded-[6px] px-2 py-0.5"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const note = draft.trim();
                        setMarks(map => ({
                          ...map,
                          [writing]: {
                            ...map[writing],
                            note: note || undefined,
                          },
                        }));
                        setWriting(null);
                      }}
                      className="bg-accent text-ink-inverse rounded-[6px] px-2 py-0.5"
                    >
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                Object.entries(marks)
                  .filter(([, mark]) => mark.note)
                  .map(([index, mark]) => (
                    <div
                      key={index}
                      className="bg-surface border-line-1 animate-doc-in mb-2 rounded-[10px] border p-2.5 font-sans text-[12px] leading-snug"
                    >
                      {mark.note}
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </div>
    </AppWindow>
  );
}

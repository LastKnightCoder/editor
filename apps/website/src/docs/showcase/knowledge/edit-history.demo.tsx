/**
 * 编辑历史：右侧时间轴展示按时间记录的版本，点击版本在正文里标出新增与修改，并可试点「恢复到此版本」。
 */
import { useState } from "react";
import { Check, Clock, RotateCcw, Sparkles, User } from "lucide-react";
import { cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

interface Revision {
  id: string;
  time: string;
  author: "你" | "AI 助手";
  summary: string;
  blocks: {
    id: string;
    kind?: "added" | "changed";
    before?: string;
    text: string;
  }[];
}

const REVISIONS: Revision[] = [
  {
    id: "v3",
    time: "16:40",
    author: "你",
    summary: "补充停工仪式与实践例子",
    blocks: [
      {
        id: "b1",
        text: "深度工作不是单纯延长工时，而是在不被打断的时间块里把注意力推到极限。",
      },
      {
        id: "b2",
        text: "每次从写作切去回一条消息，即使只花十秒，也会留下持续十几分钟的注意力残留。",
      },
      {
        id: "b3",
        kind: "added",
        text: "每天结束工作前写下明天要做的三件事，合上笔记本就不再回消息，让大脑彻底退出任务状态。",
      },
    ],
  },
  {
    id: "v2",
    time: "15:18",
    author: "AI 助手",
    summary: "精简开头并润色第二段",
    blocks: [
      {
        id: "b1",
        kind: "changed",
        before: "深度工作其实并不是说每天工作很久，而是要保证一段完全没有干扰的时间。",
        text: "深度工作不是单纯延长工时，而是在不被打断的时间块里把注意力推到极限。",
      },
      {
        id: "b2",
        kind: "changed",
        before: "频繁切换任务会让注意力停留在上一件事上，影响效率。",
        text: "每次从写作切去回一条消息，即使只花十秒，也会留下持续十几分钟的注意力残留。",
      },
    ],
  },
  {
    id: "v1",
    time: "14:05",
    author: "你",
    summary: "写下初稿",
    blocks: [
      {
        id: "b1",
        kind: "added",
        text: "深度工作其实并不是说每天工作很久，而是要保证一段完全没有干扰的时间。",
      },
      {
        id: "b2",
        kind: "added",
        text: "频繁切换任务会让注意力停留在上一件事上，影响效率。",
      },
    ],
  },
];

export default function EditHistoryDemo() {
  const [activeId, setActiveId] = useState("v2");
  const [restoredId, setRestoredId] = useState<string | null>(null);
  const revision = REVISIONS.find(item => item.id === activeId) ?? REVISIONS[0];

  return (
    <AppWindow active="articles" crumb="文章 / 《深度工作》读书笔记" height={410}>
      <div className="grid h-full grid-cols-[1.25fr_240px] max-sm:grid-cols-1">
        {/* 正文改动视图 */}
        <div className="flex min-h-0 flex-col px-7 pt-5 pb-4 max-sm:px-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-tau-title font-semibold">《深度工作》读书笔记</h3>
            <span className="bg-hover text-ink-2 text-tau-tiny rounded-full px-2.5 py-0.5 tabular-nums">
              查看 {revision.time} 版本
            </span>
          </div>
          <div className="scrollbar-hide min-h-0 flex-1 space-y-3 overflow-y-auto text-[13.5px] leading-[1.75]">
            {revision.blocks.map(block => (
              <div
                key={block.id}
                className={cn(
                  "rounded-[9px] px-3 py-2 transition-colors",
                  block.kind === "added" && "bg-ok-soft/60 border-ok border-l-2",
                  block.kind === "changed" && "bg-warn-soft/60 border-warn border-l-2"
                )}
              >
                {block.before && (
                  <p className="text-ink-3 mb-1 text-[12px] line-through">{block.before}</p>
                )}
                <p className="text-ink-1">{block.text}</p>
              </div>
            ))}
          </div>
          <div className="text-ink-3 text-tau-tiny mt-3 flex items-center gap-3">
            <span className="flex items-center gap-1">
              <i className="bg-ok size-2 rounded-full" />
              新增
            </span>
            <span className="flex items-center gap-1">
              <i className="bg-warn size-2 rounded-full" />
              修改
            </span>
            {restoredId && (
              <span className="text-ok ml-auto flex items-center gap-1 font-medium">
                <Check className="size-3.5" strokeWidth={2} />
                已恢复到 {REVISIONS.find(item => item.id === restoredId)?.time} 并记入历史
              </span>
            )}
          </div>
        </div>

        {/* 右侧编辑历史时间轴 */}
        <aside className="border-line-2 bg-page/60 flex min-h-0 flex-col border-l p-3.5 max-sm:hidden">
          <div className="mb-2.5 flex items-center gap-1.5 text-[12.5px] font-semibold">
            <Clock className="text-ink-2 size-3.5" strokeWidth={1.75} />
            编辑历史
          </div>
          <div className="text-ink-3 text-tau-tiny mb-2 px-1">今天</div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
            {REVISIONS.map(item => {
              const on = item.id === activeId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveId(item.id);
                    setRestoredId(null);
                  }}
                  className={cn(
                    "w-full rounded-[9px] px-2.5 py-2 text-left transition-colors",
                    on ? "bg-surface shadow-card ring-line-1 ring-1" : "hover:bg-hover"
                  )}
                >
                  <div className="mb-0.5 flex items-center justify-between text-[11.5px]">
                    <span className="text-ink-1 flex items-center gap-1 font-medium">
                      {item.author === "AI 助手" ? (
                        <Sparkles className="text-accent size-3" strokeWidth={1.75} />
                      ) : (
                        <User className="text-ink-3 size-3" strokeWidth={1.75} />
                      )}
                      {item.author}
                    </span>
                    <span className="text-ink-3 font-tau-mono text-[11px] tabular-nums">
                      {item.time}
                    </span>
                  </div>
                  <p className="text-ink-2 truncate text-[12px]">{item.summary}</p>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setRestoredId(revision.id)}
            className="bg-accent text-ink-inverse mt-2.5 inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] text-[12px] font-medium transition-opacity hover:opacity-90"
          >
            <RotateCcw className="size-3.5" strokeWidth={1.75} />
            恢复到此版本
          </button>
        </aside>
      </div>
    </AppWindow>
  );
}

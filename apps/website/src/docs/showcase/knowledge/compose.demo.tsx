/**
 * 创作模式：左边白板摆着 AI 召集来的资料，右边是正文。悬停一张资料点「引用」，正文里多一个链接，
 * 卡片变成「已引用」；再悬停可以取消。结构按 features/compose 的 ComposeLayout、ComposeCardAccessory 重建。
 */
import { useState } from "react";
import { Check, FileText, PanelsLeftRight, Quote, Sparkles, X } from "lucide-react";
import { AppWindow } from "../AppWindow.tsx";

interface Source {
  id: number;
  title: string;
  body: string;
  x: number;
  y: number;
  group: string;
}

const SOURCES: Source[] = [
  {
    id: 1,
    title: "专注是可以练习的能力",
    body: "像肌肉一样，越用越强；也会因为长期不用而萎缩。",
    x: 4,
    y: 16,
    group: "已关联",
  },
  {
    id: 2,
    title: "浅层工作的虚假满足",
    body: "回复消息带来的满足感，是一种看得见的忙碌。",
    x: 52,
    y: 16,
    group: "已关联",
  },
  {
    id: 3,
    title: "注意力残留",
    body: "从一件事切到另一件，注意力会有一部分留在上一件上。",
    x: 4,
    y: 58,
    group: "AI 找到",
  },
  {
    id: 4,
    title: "番茄记录 · 本周",
    body: "上午的专注时长是下午的两倍。",
    x: 52,
    y: 58,
    group: "AI 找到",
  },
];

export default function ComposeDemo() {
  const [cited, setCited] = useState<number[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const cite = (id: number) => {
    setCited(list => [...list, id]);
    setToast(null);
  };
  const uncite = (id: number) => {
    setCited(list => list.filter(item => item !== id));
    setToast("已取消引用");
  };

  return (
    <AppWindow
      active="articles"
      crumb="文章 / 为什么你总是很忙却没做成事"
      sidebar="none"
      height={440}
      paper={false}
    >
      <div className="flex h-full gap-3">
        <div className="bg-surface shadow-paper relative min-w-0 flex-[1.15] overflow-hidden rounded-[12px] max-sm:hidden">
          <div className="absolute inset-0 bg-[radial-gradient(var(--tau-line-1)_1px,transparent_1px)] bg-[length:14px_14px]" />
          <div className="bg-surface shadow-card text-tau-sm absolute top-3 left-3 z-[2] flex items-center gap-1.5 rounded-full px-3 py-1">
            <Sparkles className="text-accent size-3.5" strokeWidth={1.75} />4 份资料已摆上白板 ·
            不要的直接移走
          </div>
          <span className="text-ink-3 text-tau-tiny absolute top-[12%] left-[5%] font-semibold">
            已关联
          </span>
          <span className="text-ink-3 text-tau-tiny absolute top-[54%] left-[5%] font-semibold">
            AI 找到
          </span>
          {SOURCES.map(source => {
            const on = cited.includes(source.id);
            return (
              <div
                key={source.id}
                className="bg-surface border-line-1 group shadow-card absolute flex w-[44%] flex-col gap-1.5 rounded-[12px] border p-3 pt-2.5"
                style={{ left: `${source.x}%`, top: `${source.y}%` }}
              >
                <div className="flex min-w-0 items-center gap-2 pr-14">
                  <span className="rounded-tau-sm bg-accent-soft text-accent-text grid size-6 flex-none place-items-center">
                    <FileText className="size-3.5" strokeWidth={1.75} />
                  </span>
                  <span className="truncate text-[13px] font-semibold">{source.title}</span>
                </div>
                <p className="text-ink-2 line-clamp-2 text-[12px] leading-[1.6]">{source.body}</p>
                {on ? (
                  <button
                    type="button"
                    title="撤掉正文里指向它的链接"
                    onClick={() => uncite(source.id)}
                    className="bg-ok-soft text-ok hover:bg-danger-soft hover:text-danger group/cite absolute top-2 right-2 inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[11px] leading-5 transition-colors"
                  >
                    <Check className="size-3 group-hover/cite:hidden" strokeWidth={2} />
                    <X className="hidden size-3 group-hover/cite:block" strokeWidth={2} />
                    <span className="group-hover/cite:hidden">已引用</span>
                    <span className="hidden group-hover/cite:inline">取消引用</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    title="在正文光标处插入指向它的链接"
                    onClick={() => cite(source.id)}
                    className="bg-surface shadow-card text-ink-2 hover:text-ink-1 absolute top-2 right-2 inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[11px] leading-5 opacity-0 transition-[opacity,color] group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Quote className="size-3" strokeWidth={1.75} />
                    引用
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="bg-surface shadow-paper flex min-w-0 flex-1 flex-col overflow-hidden rounded-[12px]">
          <div className="scrollbar-hide flex-1 overflow-y-auto px-6 pt-6 pb-6">
            <h3 className="text-[22px] leading-snug font-semibold">为什么你总是很忙却没做成事</h3>
            <div className="text-ink-3 text-tau-tiny mt-2 flex items-center gap-2">
              <span>1,280 字</span>
              <span className="bg-accent-soft text-accent-text inline-flex h-[22px] items-center gap-[5px] rounded-full px-2">
                <PanelsLeftRight className="size-3" strokeWidth={1.75} />
                退出创作模式
              </span>
            </div>
            <p className="text-tau-body mt-4 leading-[1.85]">
              一天下来消息回了几十条，会开了三个，真正想推进的那件事却一个字没动。
            </p>
            <p className="text-tau-body mt-3 leading-[1.85]">
              这不是因为你懒。专注本来就是一种需要练习的能力
              {cited.length > 0 && "，参考 "}
              {cited.map((id, index) => {
                const source = SOURCES.find(item => item.id === id);
                if (!source) return null;
                return (
                  <span key={id}>
                    {index > 0 && "、"}
                    <span className="text-accent-text animate-doc-in inline-block underline decoration-dotted decoration-[1.5px] underline-offset-[3px]">
                      {source.title}
                    </span>
                  </span>
                );
              })}
              。
              <span className="bg-accent ml-0.5 inline-block h-[1.1em] w-[1.5px] translate-y-[3px] animate-pulse" />
            </p>
          </div>
        </div>
      </div>
      {toast && (
        <div className="bg-surface shadow-float text-tau-sm animate-doc-in absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 whitespace-nowrap">
          {toast}
        </div>
      )}
    </AppWindow>
  );
}

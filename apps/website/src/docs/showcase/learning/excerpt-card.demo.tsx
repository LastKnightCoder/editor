/**
 * 标注转为卡片：PDF 左面板「标注」列表，悬停一条出现「转为卡片」，点后弹出带「打开」的提示，
 * 打开即看到生成的卡片（引用块原文 + 批注 + 出处）。列表行按 features/pdfs/reader 的 LeftPanel 重建，
 * 卡片内容格式与 services/material-to-card 一致。
 */
import { useEffect, useState } from "react";
import { ArrowLeft, Layers, MessageSquareText } from "lucide-react";
import { cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

interface Annotation {
  id: number;
  quote: string;
  note?: string;
  page: number;
  border: string;
}

const ANNOTATIONS: Annotation[] = [
  {
    id: 1,
    quote: "深度工作是一种越来越稀缺、也越来越有价值的能力。",
    note: "这就是为什么要每天留出两小时不看消息。",
    page: 12,
    border: "border-tag-4",
  },
  {
    id: 2,
    quote: "浅层工作会让人感觉很忙，却很少产出真正有价值的东西。",
    page: 27,
    border: "border-tag-1",
  },
  {
    id: 3,
    quote: "从一件事切到另一件，注意力会有一部分留在上一件上。",
    note: "注意力残留：被打断后很难马上回到状态。",
    page: 41,
    border: "border-tag-2",
  },
];

const FILE = "深度工作.pdf";

export default function ExcerptCardDemo() {
  const [toastFor, setToastFor] = useState<Annotation | null>(null);
  const [opened, setOpened] = useState<Annotation | null>(null);

  useEffect(() => {
    if (!toastFor) return;
    const timer = setTimeout(() => setToastFor(null), 5000);
    return () => clearTimeout(timer);
  }, [toastFor]);

  const convert = (item: Annotation) => setToastFor(item);

  return (
    <AppWindow
      active={opened ? "cards" : "pdfs"}
      crumb={opened ? "卡片库 / 卡片" : `PDF / ${FILE}`}
      height={400}
      paper={false}
    >
      {opened ? (
        <div className="bg-surface shadow-paper animate-doc-in flex h-full flex-col overflow-hidden rounded-[12px]">
          <div className="flex h-11 shrink-0 items-center gap-2 px-5">
            <button
              type="button"
              onClick={() => setOpened(null)}
              className="text-ink-2 hover:bg-hover text-tau-sm flex h-7 items-center gap-1 rounded-[8px] px-2"
            >
              <ArrowLeft className="size-3.5" strokeWidth={1.75} />
              回到 PDF
            </button>
          </div>
          <div className="scrollbar-hide mx-auto w-full max-w-[560px] flex-1 overflow-y-auto px-8 pt-4 pb-8">
            <blockquote className="border-line-2 text-ink-2 text-tau-body-lg border-l-[3px] pl-4 leading-[1.85]">
              {opened.quote}
            </blockquote>
            {opened.note && <p className="text-tau-body-lg mt-4 leading-[1.85]">{opened.note}</p>}
            <p className="text-ink-2 text-tau-body mt-4">
              —— PDF · {FILE} · 第 {opened.page} 页
            </p>
          </div>
        </div>
      ) : (
        <div className="flex h-full gap-3">
          <aside className="bg-surface shadow-paper flex w-[260px] shrink-0 flex-col rounded-[12px] px-3 pt-3 max-sm:w-full">
            <div className="text-tau-sm border-line-1 flex gap-4 border-b px-1 pb-2">
              <span className="text-ink-3">目录</span>
              <span className="text-ink-3">页面</span>
              <span className="text-ink-1 relative font-medium">
                标注
                <i className="bg-accent absolute inset-x-0 -bottom-2 h-0.5 rounded-full" />
              </span>
              <span className="text-ink-3">书签</span>
            </div>
            <div className="mt-2.5 mb-1.5 flex items-center gap-1.5">
              <span className="bg-selected text-accent-text text-tau-sm inline-flex h-6 items-center gap-1 rounded-full px-2.5 font-medium">
                全部 <span className="tabular-nums">{ANNOTATIONS.length}</span>
              </span>
              <span className="border-line-1 text-ink-2 text-tau-sm inline-flex h-6 items-center rounded-full border px-2.5">
                有笔记
              </span>
              <span className="flex-1" />
              {["bg-tag-4", "bg-tag-5", "bg-tag-1", "bg-tag-2", "bg-tag-3"].map(swatch => (
                <i key={swatch} className={cn("size-3 rounded-full", swatch)} />
              ))}
            </div>
            <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pb-3">
              {ANNOTATIONS.map(item => (
                <div key={item.id} className="group relative">
                  <div className="rounded-tau-sm hover:bg-hover flex w-full flex-col gap-1 px-2 py-2 transition-colors duration-150">
                    <span
                      className={cn(
                        "text-tau-sm text-ink-1 line-clamp-3 border-l-[3px] pl-2 leading-relaxed",
                        item.border
                      )}
                    >
                      {item.quote}
                    </span>
                    {item.note && (
                      <span className="text-tau-meta text-ink-2 flex gap-1.5 pl-0.5">
                        <MessageSquareText
                          className="mt-[3px] size-3 shrink-0"
                          strokeWidth={1.75}
                        />
                        <span className="line-clamp-2">{item.note}</span>
                      </span>
                    )}
                    <span className="text-tau-meta text-ink-3 pl-0.5 tabular-nums">
                      第 {item.page} 页
                    </span>
                  </div>
                  <button
                    type="button"
                    title="转为卡片"
                    aria-label="转为卡片"
                    onClick={() => convert(item)}
                    className="bg-surface shadow-lift text-ink-2 hover:text-ink-1 absolute right-1.5 bottom-1.5 grid size-6 place-items-center rounded-[7px] opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Layers className="size-3" strokeWidth={1.75} />
                  </button>
                </div>
              ))}
            </div>
          </aside>
          <div className="bg-page relative flex min-w-0 flex-1 justify-center overflow-hidden rounded-[12px] max-sm:hidden">
            <div className="bg-surface shadow-card mt-5 w-[min(420px,100%)] rounded-[2px] px-9 pt-8 font-serif">
              <p className="text-ink-3 mb-4 text-[11px] tracking-[0.2em]">
                第一章 · 深度工作很有价值
              </p>
              <p className="text-[14.5px] leading-[2]">
                在新经济中，有三种人会获得优势。
                <span className="bg-tag-4-soft rounded-[2px]">{ANNOTATIONS[0].quote}</span>
                而与此同时，它也正变得越来越少见……
              </p>
            </div>
          </div>
        </div>
      )}

      {toastFor && !opened && (
        <div
          key={toastFor.id}
          className="bg-surface shadow-float text-tau-sm animate-doc-in absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-[10px] py-2 pr-2 pl-3.5 whitespace-nowrap"
        >
          <i className="bg-ok size-1.5 rounded-full" />
          已转为卡片
          <button
            type="button"
            onClick={() => {
              setOpened(toastFor);
              setToastFor(null);
            }}
            className="text-accent-text hover:bg-accent-soft rounded-[7px] px-2 py-0.5 font-medium"
          >
            打开
          </button>
        </div>
      )}
    </AppWindow>
  );
}
